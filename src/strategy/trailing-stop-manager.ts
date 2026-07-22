/**
 * Trailing stop management for Strategy Engine.
 * Self-contained module with its own state map.
 */
import type { Order, TrailingStopState, PositionDirection } from './strategy-types.js';

export class TrailingStopManager {
  private trailingStops: Map<string, TrailingStopState> = new Map();

  clear(): void {
    this.trailingStops.clear();
  }

  saveState(): Record<string, TrailingStopState> {
    const state: Record<string, TrailingStopState> = {};
    for (const [key, val] of this.trailingStops) {
      state[key] = { ...val };
    }
    return state;
  }

  restoreState(state: Record<string, TrailingStopState>): void {
    this.trailingStops = new Map(
      Object.entries(state).map(([k, v]) => [k, { ...v }]),
    );
  }

  /** Update trailing stop prices for pending orders with trail parameters. */
  update(pendingOrders: Order[], positionDirection: PositionDirection, avgPrice: number, high: number, low: number, currentPrice: number): void {
    const mintick = 0.01;

    for (const order of pendingOrders) {
      if (order.trailOffset === undefined && order.trailPrice === undefined) continue;

      let state = this.trailingStops.get(order.id);

      if (!state) {
        // Initialize trailing stop state
        const entryPrice = avgPrice;
        let activationPrice: number;
        let initialStop: number;

        if (order.trailOffset !== undefined && order.trailOffset > 0) {
          // trail_offset: distance in ticks from extreme price
          activationPrice = positionDirection === 'long'
            ? entryPrice + order.trailOffset * mintick
            : entryPrice - order.trailOffset * mintick;
          initialStop = positionDirection === 'long'
            ? activationPrice - order.trailOffset * mintick
            : activationPrice + order.trailOffset * mintick;
        } else if (order.trailPrice !== undefined && order.trailPrice > 0) {
          // trail_price: absolute offset from market
          activationPrice = positionDirection === 'long'
            ? entryPrice + order.trailPrice
            : entryPrice - order.trailPrice;
          initialStop = positionDirection === 'long'
            ? activationPrice - order.trailPrice
            : activationPrice + order.trailPrice;
        } else {
          continue;
        }

        state = {
          orderId: order.id,
          trailOffset: order.trailOffset,
          trailPrice: order.trailPrice,
          highestPrice: positionDirection === 'long' ? entryPrice : entryPrice,
          stopPrice: initialStop,
          isActivated: false,
        };
        this.trailingStops.set(order.id, state);
      }

      // Check activation
      if (!state.isActivated) {
        // Compute the activation price: entry price + favorable move
        const actPrice = positionDirection === 'long'
          ? avgPrice + (state.trailOffset !== undefined ? state.trailOffset * mintick : (state.trailPrice ?? 0))
          : avgPrice - (state.trailOffset !== undefined ? state.trailOffset * mintick : (state.trailPrice ?? 0));
        const activated = positionDirection === 'long'
          ? high >= actPrice
          : low <= actPrice;
        if (activated) {
          state.isActivated = true;
          state.highestPrice = positionDirection === 'long' ? high : low;
        }
      }

      if (state.isActivated) {
        // Update highest/lowest price seen
        if (positionDirection === 'long') {
          if (high > state.highestPrice) state.highestPrice = high;
        } else {
          if (low < state.highestPrice) state.highestPrice = low;
        }

        // Compute new stop price
        let newStop: number;
        if (state.trailOffset !== undefined && state.trailOffset > 0) {
          newStop = positionDirection === 'long'
            ? state.highestPrice - state.trailOffset * mintick
            : state.highestPrice + state.trailOffset * mintick;
        } else if (state.trailPrice !== undefined && state.trailPrice > 0) {
          newStop = positionDirection === 'long'
            ? currentPrice - state.trailPrice
            : currentPrice + state.trailPrice;
        } else {
          continue;
        }

        // One-way ratchet: stop only moves in favorable direction
        const stopImproved = positionDirection === 'long'
          ? newStop > state.stopPrice
          : newStop < state.stopPrice;

        if (stopImproved) {
          state.stopPrice = newStop;
          // Update the pending order's stopPrice
          order.stopPrice = newStop;
        }
      }
    }
  }
}
