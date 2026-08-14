import type { CommissionConfig } from './commission-calculator.js';
import { isLongOnlyEnforced } from './commission-calculator.js';
import { buildBacktestFeeModel } from './commission-methods/backtest-model.js';
import { aggregateRealizedPnl, modelFees } from '../pnl/index.js';
import { computeMetrics } from './strategy-metrics.js';
import {
  DEFAULT_STRATEGY_CONFIG,
  type OrderDirection,
  type OrderType,
  type Account,
  type Order,
  type FilledOrder,
  type Position,
  type Trade,
  type StrategyConfig,
  type TrailingStopState,
  type StrategyMarker,
} from './strategy-types.js';
import { TrailingStopManager } from './trailing-stop-manager.js';
import { NO_WARNING_SINK, type BacktestWarning, type WarningSink } from '../warning-collector.js';

// Re-export for backward compatibility
export { DEFAULT_STRATEGY_CONFIG } from './strategy-types.js';
export type {
  StrategyConfig,
  StrategyMetrics,
  StrategyMarker,
  Trade,
  FilledOrder,
  Order,
  Position,
  Account,
  OrderDirection,
  CommissionType,
} from './strategy-types.js';

/**
 * Convert the src/pnl exact DecimalStr to the engine's float API. The module's
 * money policy (no floats) applies INSIDE src/pnl; this is the single
 * conversion point at the boundary where the legacy number-typed Trade/equity
 * API lives.
 */
function decimalStrToNumber(value: string): number {
  return Number(value);
}

export class StrategyEngine {
  private config: StrategyConfig;
  private position: Position;
  private pendingOrders: Order[];
  private filledOrders: FilledOrder[];
  private trades: Trade[];
  private markers: StrategyMarker[];
  private equity: number;
  private peakEquity: number;
  private maxDrawdown: number;
  private barIndex: number;
  private timestamp: number;
  private currentPrice: number;
  private entries: number;
  private commissionConfig: CommissionConfig | undefined;
  private _lastMarkerCount: number = 0;
  private _nextOrderId: number = 0;

  // Track best/worst prices during an open position for MAE/MFE calculation.
  // These are updated on every bar while a position is open.
  private _tradeHighPrice: number = 0;
  private _tradeLowPrice: number = 0;

  // Trailing stop manager
  private trailingStopManager: TrailingStopManager = new TrailingStopManager();

  // Per-run diagnostic sink (design D4 — WarningCollector at the composition
  // root). The sink attaches AFTER construction (deliberately not a constructor
  // param: the engine stays constructible with zero infrastructure), so
  // warnings emitted by the constructor are buffered and replayed on attach.
  /** @internal */
  private onWarning: WarningSink = NO_WARNING_SINK;
  /** @internal */
  private readonly pendingWarnings: BacktestWarning[] = [];

  constructor(config: Partial<StrategyConfig> = {}) {
    this.config = { ...DEFAULT_STRATEGY_CONFIG, ...config };

    // Initialize the commission-method config. Jupiter methods (the only
    // CommissionMethodIds) model fees through the shared src/pnl module at
    // trade close — there is no per-fill calculator to construct here.
    if (this.config.commissionMethod) {
      this.commissionConfig = {
        method: this.config.commissionMethod,
        settings: this.config.commissionMethodSettings ?? null,
      };

      // Warn if both pluggable and legacy commission are configured
      if (this.config.commission !== 0) {
        console.warn(
          `[StrategyEngine] Both commissionMethod ('${this.config.commissionMethod}') and legacy commission (${this.config.commission}) are configured. The pluggable commissionMethod takes precedence and legacy commission will be ignored.`,
        );
        // Typed diagnostic (design D4): the precedence decision must reach the
        // run's consumers, not just the console. Buffered until a sink attaches.
        this.warn({
          type: 'fee-decision',
          message: `Both commissionMethod ('${this.config.commissionMethod}') and legacy commission (${this.config.commission}) are configured — the pluggable commissionMethod takes precedence and legacy commission is ignored`,
          context: {
            commissionMethod: this.config.commissionMethod,
            legacyCommission: this.config.commission,
            precedence: 'commissionMethod',
          },
        });
      }
    }
    this.position = {
      symbol: '',
      direction: 'flat',
      quantity: 0,
      avgPrice: 0,
      entryTime: 0,
      entryBarIndex: 0,
      entryName: '',
      pnl: 0,
      pnlPercent: 0,
      commission: 0,
      unrealizedPnl: 0,
      lots: [],
    };
    this.pendingOrders = [];
    this.filledOrders = [];
    this.trades = [];
    this.markers = [];
    this.equity = this.config.initialCapital;
    this.peakEquity = this.equity;
    this.maxDrawdown = 0;
    this.barIndex = 0;
    this.timestamp = 0;
    this.currentPrice = 0;
    this.entries = 0;
  }

  /**
   * Attach a per-run diagnostic sink (design D4 — WarningCollector at the
   * composition root). Called by ExecutionEngine after construction; warnings
   * the constructor buffered (commission-method conflicts) are replayed here.
   */
  setWarningSink(sink: WarningSink): void {
    this.onWarning = sink;
    if (sink === NO_WARNING_SINK) return;
    for (const w of this.pendingWarnings) sink(w);
    this.pendingWarnings.length = 0;
  }

  /** @internal Emit a typed diagnostic, buffering until a sink attaches. */
  private warn(warning: BacktestWarning): void {
    if (this.onWarning !== NO_WARNING_SINK) {
      this.onWarning(warning);
      return;
    }
    this.pendingWarnings.push(warning);
  }

  entry(
    name: string,
    direction: OrderDirection,
    quantity?: number,
    price: number = 0,
    stopPrice?: number,
    limitPrice?: number,
    comment?: string,
  ): Order | undefined {
    const hasStop = stopPrice !== undefined && stopPrice > 0;
    const hasLimit = limitPrice !== undefined && limitPrice > 0;
    const orderType: OrderType =
      hasStop && hasLimit ? 'stop-limit' : hasStop ? 'stop' : hasLimit ? 'limit' : 'market';

    if (orderType === 'market' && price === 0) {
      price = this.currentPrice;
    }

    if (quantity === undefined) {
      quantity = this.calculateQty(direction);
    }

    // Long-only enforcement: reject short entries when commission method requires it.
    // Close any existing long position first (the strategy intended a reversal).
    if (
      this.config.commissionMethod &&
      isLongOnlyEnforced(this.config.commissionMethod) &&
      direction === 'short'
    ) {
      // Concise by design: emitted per suppressed order (can be dozens per
      // backtest) — the typed context carries the structured detail.
      console.warn(
        `[StrategyEngine] Entry "${name}" suppressed — ${this.config.commissionMethod} is long-only`,
      );
      // Typed diagnostic (design D4): this suppression is what the parity
      // divergence analysis found silently dropped short entries — surface it
      // to the run's consumers (API result, export, CLI).
      this.warn({
        type: 'long-only-suppression',
        message: `Entry "${name}" suppressed — ${this.config.commissionMethod} is long-only`,
        context: {
          name,
          direction,
          commissionMethod: this.config.commissionMethod,
          closedExistingLong: this.position.direction === 'long',
        },
      });
      if (this.position.direction === 'long') {
        this.close(this.position.entryName || name, 'reverse');
      }
      return undefined;
    }

    if (!this.canOpenPosition(direction, quantity)) {
      if (this.position.direction !== 'flat' && this.position.direction !== direction) {
        this.close(this.position.entryName || name, 'reverse');
      } else {
        console.log(
          `[StrategyEngine] entry REJECTED: name=${name} dir=${direction} qty=${quantity} price=${this.currentPrice} pos=${this.position.direction} entries=${this.entries} pyramiding=${this.config.pyramiding}`,
        );
        return undefined;
      }
    }

    const order: Order = {
      id: this.generateOrderId(),
      symbol: '',
      direction,
      action: direction === 'long' ? 'buy' : 'sell',
      type: orderType,
      quantity,
      price,
      stopPrice,
      limitPrice,
      entryName: name,
      timestamp: this.timestamp,
      barIndex: this.barIndex,
      slippage: this.config.slippage,
      commission: this.config.commission,
    };

    this.pendingOrders.push(order);
    this.entries++;
    console.log(
      `[StrategyEngine] entry CREATED: name=${name} dir=${direction} qty=${quantity} price=${this.currentPrice} orderId=${order.id}`,
    );

    this.markers.push({
      type: 'entry',
      orderId: order.id,
      name: name || (direction === 'long' ? 'Long' : 'Short'),
      direction,
      action: order.action,
      quantity,
      price,
      barIndex: this.barIndex,
      timestamp: this.timestamp,
      color: direction === 'long' ? '#00FF00' : '#FF0000',
      comment,
    });

    return order;
  }

  order(
    name: string,
    direction: OrderDirection,
    quantity?: number,
    price: number = 0,
    stopPrice?: number,
    limitPrice?: number,
  ): Order | undefined {
    if (quantity === undefined) {
      quantity = this.calculateQty(direction);
    }

    // Long-only enforcement: reject short orders when commission method requires it.
    // Allow sell orders that close an existing long position.
    if (
      this.config.commissionMethod &&
      isLongOnlyEnforced(this.config.commissionMethod) &&
      direction === 'short'
    ) {
      if (this.position.direction !== 'long') {
        // Was FULLY silent — the parity divergence analysis showed short orders
        // dropped here without a trace (15 in one backtest). Typed diagnostic
        // (design D4) so the run's consumers can see the suppression.
        this.warn({
          type: 'long-only-suppression',
          message: `Order "${name}" suppressed — ${this.config.commissionMethod} is long-only`,
          context: {
            name,
            direction,
            commissionMethod: this.config.commissionMethod,
            positionDirection: this.position.direction,
          },
        });
        return undefined;
      }
    }

    const hasStop = stopPrice !== undefined && stopPrice > 0;
    const hasLimit = limitPrice !== undefined && limitPrice > 0;
    const orderType: OrderType =
      hasStop && hasLimit ? 'stop-limit' : hasStop ? 'stop' : hasLimit ? 'limit' : 'market';

    if (orderType === 'market' && price === 0) {
      price = this.currentPrice;
    }

    const order: Order = {
      id: this.generateOrderId(),
      symbol: '',
      direction,
      action: direction === 'long' ? 'buy' : 'sell',
      type: orderType,
      quantity,
      price,
      stopPrice,
      limitPrice,
      entryName: name,
      timestamp: this.timestamp,
      barIndex: this.barIndex,
      slippage: this.config.slippage,
      commission: this.config.commission,
    };

    this.pendingOrders.push(order);

    this.markers.push({
      type: 'order',
      orderId: order.id,
      name,
      direction,
      action: order.action,
      quantity,
      price,
      barIndex: this.barIndex,
      timestamp: this.timestamp,
      color: '#FFFF00',
    });

    return order;
  }

  exit(
    name: string,
    quantity: number = this.position.quantity,
    price: number = 0,
    stopPrice?: number,
    limitPrice?: number,
    comment?: string,
    fromEntry?: string,
    trailPrice?: number,
    trailOffset?: number,
  ): Order | undefined {
    let exitDirection: OrderDirection;
    let exitQuantity: number;
    let exitAction: 'buy' | 'sell';

    if (this.position.direction !== 'flat' && this.position.quantity > 0) {
      exitDirection = this.position.direction;

      // If fromEntry is specified, compute quantity from matching lots
      if (fromEntry && this.position.lots.length > 0) {
        const matchingQty = this.position.lots
          .filter((l) => l.entryName === fromEntry)
          .reduce((sum, l) => sum + l.quantity, 0);
        if (matchingQty <= 0) return undefined;
        exitQuantity = Math.min(
          quantity === this.position.quantity ? matchingQty : quantity,
          matchingQty,
        );
      } else {
        exitQuantity = Math.min(quantity, this.position.quantity);
      }

      exitAction = this.position.direction === 'long' ? 'sell' : 'buy';
    } else {
      const pendingEntry = this.pendingOrders.find((o) => o.type === 'market');
      if (!pendingEntry) return undefined;
      exitDirection = pendingEntry.direction;
      exitQuantity = quantity || pendingEntry.quantity;
      exitAction = pendingEntry.action === 'buy' ? 'sell' : 'buy';
    }

    const hasStop = stopPrice !== undefined && stopPrice > 0;
    const hasLimit = limitPrice !== undefined && limitPrice > 0;
    const hasTrail =
      (trailPrice !== undefined && trailPrice > 0) ||
      (trailOffset !== undefined && trailOffset > 0);
    const orderType: OrderType =
      hasStop && hasLimit
        ? 'stop-limit'
        : hasStop
          ? 'stop'
          : hasLimit
            ? 'limit'
            : hasTrail
              ? 'stop'
              : 'market';

    if (orderType === 'market' && price === 0) {
      price = this.currentPrice;
    }

    const order: Order = {
      id: this.generateOrderId(),
      symbol: this.position.symbol,
      direction: exitDirection,
      action: exitAction,
      type: orderType,
      quantity: exitQuantity,
      price,
      stopPrice,
      limitPrice,
      entryName: name,
      timestamp: this.timestamp,
      barIndex: this.barIndex,
      slippage: this.config.slippage,
      commission: this.config.commission,
      ocaGroup:
        orderType !== 'market' && this.position.direction !== 'flat'
          ? `oca_${this.position.entryName}`
          : undefined,
      trailPrice,
      trailOffset,
      fromEntry,
    };

    if (orderType === 'market') {
      this.fillOrder(order, price);
    } else {
      this.pendingOrders.push(order);
    }

    this.markers.push({
      type: 'exit',
      orderId: order.id,
      name: `Exit ${name}`,
      direction: order.direction,
      action: order.action,
      quantity: order.quantity,
      price,
      barIndex: this.barIndex,
      timestamp: this.timestamp,
      color: order.direction === 'long' ? '#FF6600' : '#FF6600',
      comment,
    });

    return order;
  }

  close(name: string = 'close', comment?: string): Order | undefined {
    if (this.position.direction === 'flat' || this.position.quantity === 0) {
      return undefined;
    }

    const price = this.currentPrice;
    const order: Order = {
      id: this.generateOrderId(),
      symbol: this.position.symbol,
      direction: this.position.direction === 'long' ? 'long' : 'short',
      action: this.position.direction === 'long' ? 'sell' : 'buy',
      type: 'market',
      quantity: this.position.quantity,
      price,
      entryName: name,
      timestamp: this.timestamp,
      barIndex: this.barIndex,
      slippage: this.config.slippage,
      commission: this.config.commission,
    };

    this.pendingOrders.push(order);

    this.markers.push({
      type: 'close',
      orderId: order.id,
      name: `Exit ${name}`,
      direction: order.direction,
      action: order.action,
      quantity: order.quantity,
      price,
      barIndex: this.barIndex,
      timestamp: this.timestamp,
      color: '#FF0000',
      comment,
    });

    return order;
  }

  closeAll(name: string = 'close_all'): Order | undefined {
    return this.close(name);
  }

  cancel(orderId: string): boolean {
    const index = this.pendingOrders.findIndex((o) => o.id === orderId);
    if (index >= 0) {
      const order = this.pendingOrders[index]!;
      this.pendingOrders.splice(index, 1);

      this.markers.push({
        type: 'cancel',
        orderId: order.id,
        name: order.entryName,
        direction: order.direction,
        action: order.action,
        quantity: order.quantity,
        price: order.price,
        barIndex: this.barIndex,
        timestamp: this.timestamp,
        color: '#999999',
      });

      return true;
    }
    return false;
  }

  cancelAll(): void {
    for (const order of this.pendingOrders) {
      this.markers.push({
        type: 'cancel_all',
        orderId: order.id,
        name: order.entryName,
        direction: order.direction,
        action: order.action,
        quantity: order.quantity,
        price: order.price,
        barIndex: this.barIndex,
        timestamp: this.timestamp,
        color: '#999999',
      });
    }
    this.pendingOrders = [];
  }

  getMarkers(): StrategyMarker[] {
    return [...this.markers];
  }

  getNewMarkers(): StrategyMarker[] {
    const prev = this._lastMarkerCount || 0;
    const newMarkers = this.markers.slice(prev);
    this._lastMarkerCount = this.markers.length;
    return newMarkers;
  }

  saveState(): object {
    return {
      position: { ...this.position, lots: this.position.lots.map((l) => ({ ...l })) },
      trailingStops: this.trailingStopManager.saveState(),
      pendingOrders: this.pendingOrders.map((o) => ({ ...o })),
      filledOrders: this.filledOrders.map((o) => ({ ...o })),
      trades: this.trades.map((t) => ({ ...t })),
      markers: this.markers.map((m) => ({ ...m })),
      equity: this.equity,
      peakEquity: this.peakEquity,
      maxDrawdown: this.maxDrawdown,
      entries: this.entries,
    };
  }

  restoreState(state: object): void {
    const s = state as {
      position: Position;
      trailingStops?: Record<string, TrailingStopState>;
      pendingOrders: Order[];
      filledOrders: FilledOrder[];
      trades: Trade[];
      markers: StrategyMarker[];
      equity: number;
      peakEquity: number;
      maxDrawdown: number;
      entries: number;
    };
    this.position = { ...s.position, lots: (s.position.lots || []).map((l) => ({ ...l })) };
    this.pendingOrders = s.pendingOrders.map((o) => ({ ...o }));
    this.trailingStopManager.restoreState(s.trailingStops ?? {});
    this.filledOrders = s.filledOrders.map((o) => ({ ...o }));
    this.trades = s.trades.map((t) => ({ ...t }));
    this.markers = s.markers.map((m) => ({ ...m }));
    this.equity = s.equity;
    this.peakEquity = s.peakEquity;
    this.maxDrawdown = s.maxDrawdown;
    this.entries = s.entries;
  }

  private canOpenPosition(direction: OrderDirection, quantity: number): boolean {
    if (this.position.direction === 'flat') {
      const marginRate = direction === 'long' ? this.config.marginLong : this.config.marginShort;
      const marginRequired = this.currentPrice * quantity * marginRate;
      return marginRequired <= this.getAccount().freeMargin;
    }

    if (this.position.direction === direction) {
      if (this.entries >= this.config.pyramiding + 1) return false;
      const marginRate = direction === 'long' ? this.config.marginLong : this.config.marginShort;
      const marginRequired = this.currentPrice * quantity * marginRate;
      return marginRequired <= this.getAccount().freeMargin;
    }

    return false;
  }

  /**
   * True when fees are modeled through the shared src/pnl module at trade close.
   * Every CommissionMethodId is a jupiter path ('jupiter_ultra'/'jupiter_manual');
   * if a non-jupiter id is ever added to the type, route it explicitly here.
   */
  private get isModuleFeeMethod(): boolean {
    return this.config.commissionMethod !== undefined;
  }

  private fillOrder(order: Order, fillPrice: number): void {
    const slippage = this.calculateSlippage(order, fillPrice);
    const isFlat = this.position.direction === 'flat';
    const adjustedPrice = order.action === 'buy' ? fillPrice + slippage : fillPrice - slippage;

    // Fee policy: jupiter (module-modeled) methods charge fees ONCE per round
    // trip at CLOSE via src/pnl (aggregateRealizedPnl in closeOrReducePosition)
    // — never per fill. Slippage is a price adjustment, not a fee: it already
    // moved `adjustedPrice`, which IS the fill price the PnL anchor uses.
    // Legacy commissionTypes keep their per-fill charging below.
    let commission = 0;
    if (!this.isModuleFeeMethod) {
      commission = this.calculateCommission(order, fillPrice);
      const isExit = !isFlat;
      // For fixed/per_order commission types, charge commission only on entry
      // (opening a position). Charging on both entry and exit double-counts the
      // commission for a round-trip trade. Per-contract and percent types are
      // still charged per fill since they represent actual per-unit costs.
      if (
        isExit &&
        (this.config.commissionType === 'fixed' || this.config.commissionType === 'per_order')
      ) {
        commission = 0;
      }
    }

    const filledOrder: FilledOrder = {
      ...order,
      fillPrice: adjustedPrice,
      fillTime: this.timestamp,
      fillBarIndex: this.barIndex,
    };

    this.filledOrders.push(filledOrder);

    if (order.action === 'buy') {
      if (isFlat || this.position.direction === 'long') {
        // Adding to a long position or opening fresh
        this.openOrAddPosition('long', order.quantity, adjustedPrice, commission, order.entryName);
      } else {
        // Closing/reducing a short position
        this.closeOrReducePosition(
          order.quantity,
          adjustedPrice,
          commission,
          order.entryName,
          order.fromEntry,
        );
      }
    } else {
      if (isFlat || this.position.direction === 'short') {
        // Adding to a short position or opening fresh
        this.openOrAddPosition('short', order.quantity, adjustedPrice, commission, order.entryName);
      } else {
        // Closing/reducing a long position
        this.closeOrReducePosition(
          order.quantity,
          adjustedPrice,
          commission,
          order.entryName,
          order.fromEntry,
        );
      }
    }

    this.equity -= commission;
    this.position.commission += commission;
  }

  private checkLiquidation(): void {
    if (this.position.direction === 'flat' || this.position.quantity === 0) return;

    const marginRate =
      this.position.direction === 'long' ? this.config.marginLong : this.config.marginShort;
    if (marginRate <= 0) return;

    const positionValue = this.currentPrice * this.position.quantity;
    const maintenanceMargin = positionValue * marginRate;
    const totalEquity = this.equity + this.position.unrealizedPnl;

    if (totalEquity < maintenanceMargin) {
      this.close('liquidation', 'Margin liquidation');
    }
  }

  private calculateSlippage(_order: Order, price: number): number {
    if (this.config.slippage === 0) return 0;

    if (this.config.slippageType === 'ticks' || this.config.slippageType === 'points') {
      return this.config.slippage;
    }

    return price * (this.config.slippage / 100);
  }

  /**
   * Legacy (commissionType) per-fill commission — used only when no jupiter
   * commissionMethod is configured. Jupiter methods model fees via src/pnl at
   * trade close and never reach this path.
   * Note: order.commission field is set at order creation but is NOT used for
   * charging. Commission is calculated fresh at fill time based on current config.
   */
  private calculateCommission(order: Order, price: number): number {
    if (this.config.commission === 0) return 0;

    if (this.config.commissionType === 'fixed' || this.config.commissionType === 'per_order') {
      return this.config.commission;
    }

    if (this.config.commissionType === 'per_contract') {
      return this.config.commission * order.quantity;
    }

    // 'percent' type: commission as percentage of trade value
    return price * order.quantity * (this.config.commission / 100);
  }

  private openOrAddPosition(
    direction: OrderDirection,
    quantity: number,
    price: number,
    commission: number,
    entryName: string = '',
  ): void {
    if (this.position.direction === 'flat') {
      this.position = {
        symbol: '',
        direction,
        quantity,
        avgPrice: price,
        entryTime: this.timestamp,
        entryBarIndex: this.barIndex,
        entryName,
        pnl: 0,
        pnlPercent: 0,
        commission,
        unrealizedPnl: 0,
        lots: [
          {
            entryName,
            quantity,
            avgPrice: price,
            timestamp: this.timestamp,
            barIndex: this.barIndex,
          },
        ],
      };
      // Initialize trade excursion tracking at entry price
      this._tradeHighPrice = price;
      this._tradeLowPrice = price;
      // Clear any stale trailing stop state from prior position
      this.trailingStopManager.clear();
    } else {
      const totalQuantity = this.position.quantity + quantity;
      // Two-product weighted average: compute in two passes to reduce floating-point drift
      const oldContribution = this.position.avgPrice * this.position.quantity;
      const newContribution = price * quantity;
      this.position.avgPrice = (oldContribution + newContribution) / totalQuantity;
      this.position.quantity = totalQuantity;
      this.position.commission += commission;
      // Track the new lot for FIFO position composition
      this.position.lots.push({
        entryName,
        quantity,
        avgPrice: price,
        timestamp: this.timestamp,
        barIndex: this.barIndex,
      });
    }
  }

  private closeOrReducePosition(
    quantity: number,
    price: number,
    commission: number,
    exitName: string,
    fromEntryLot?: string,
  ): void {
    const closeQuantity = Math.min(quantity, this.position.quantity);
    const grossPnl =
      this.position.direction === 'long'
        ? (price - this.position.avgPrice) * closeQuantity
        : (this.position.avgPrice - price) * closeQuantity;

    // --- Net PnL + fees ------------------------------------------------
    // Jupiter methods compute the WHOLE round-trip fee here at close through
    // the shared src/pnl module (entry fills charge nothing — see fillOrder):
    // aggregateRealizedPnl anchored on FILL prices, so every modeled fee kind
    // (venue/platform bps + SOL base/priority) reduces net. Legacy
    // commissionTypes keep their inline gross − commission arithmetic.
    let netPnl: number;
    let totalFees: number;
    if (this.isModuleFeeMethod && this.commissionConfig) {
      const model = buildBacktestFeeModel(
        this.commissionConfig.method,
        this.commissionConfig.settings,
        this.config.symbol,
      );
      const isLong = this.position.direction === 'long';
      const entryFillSide: 'BUY' | 'SELL' = isLong ? 'BUY' : 'SELL';
      const exitFillSide: 'BUY' | 'SELL' = isLong ? 'SELL' : 'BUY';
      const result = aggregateRealizedPnl({
        side: isLong ? 'LONG' : 'SHORT',
        entryFill: {
          side: entryFillSide,
          qty: String(closeQuantity),
          fillPrice: String(this.position.avgPrice),
          ts: String(this.position.entryTime),
        },
        exitFill: {
          side: exitFillSide,
          qty: String(closeQuantity),
          fillPrice: String(price),
          ts: String(this.timestamp),
        },
        feesSource: {
          components: modelFees(
            {
              // Round-trip bps are charged on the ENTRY notional — the same
              // convention buildTradeContextFromTrade used for completed trades.
              tradeValue: String(this.position.avgPrice * closeQuantity),
              side: isLong ? 'LONG' : 'SHORT',
            },
            model,
          ),
        },
        prices: { SOL: { priceUsd: model.solUsdPrice, decimals: 9 } },
        anchor: 'fills',
      });
      netPnl = decimalStrToNumber(result.net);
      // Backward-compat `commission` = sum of ALL modeled fees (display).
      totalFees = decimalStrToNumber(result.feesTotal);
      this.position.commission += totalFees;
    } else {
      netPnl = grossPnl - commission;
      totalFees = commission;
    }

    // MAE (Maximum Adverse Excursion) and MFE (Maximum Favorable Excursion)
    // Computed from the full trade lifetime (best/worst price reached during the
    // entire holding period), not just the exit bar.
    // For long: adverse = lowest price reached, favorable = highest price reached
    // For short: adverse = highest price reached, favorable = lowest price reached
    const mae =
      this.position.direction === 'long'
        ? ((this.position.avgPrice - this._tradeLowPrice) / this.position.avgPrice) * 100
        : ((this._tradeHighPrice - this.position.avgPrice) / this.position.avgPrice) * 100;

    const mfe =
      this.position.direction === 'long'
        ? ((this._tradeHighPrice - this.position.avgPrice) / this.position.avgPrice) * 100
        : ((this.position.avgPrice - this._tradeLowPrice) / this.position.avgPrice) * 100;

    const trade: Trade = {
      id: `trade_${this.trades.length + 1}`,
      symbol: this.position.symbol,
      direction: this.position.direction as OrderDirection,
      entryPrice: this.position.avgPrice,
      exitPrice: price,
      entryTime: this.position.entryTime,
      exitTime: this.timestamp,
      entryBarIndex: this.position.entryBarIndex,
      exitBarIndex: this.barIndex,
      quantity: closeQuantity,
      pnl: netPnl,
      pnlPercent:
        this.position.avgPrice > 0
          ? (() => {
              const positionValue = this.position.avgPrice * this.position.quantity;
              const marginRate =
                this.position.direction === 'long'
                  ? this.config.marginLong
                  : this.config.marginShort;
              const capitalAtRisk = marginRate > 0 ? positionValue * marginRate : positionValue;
              return capitalAtRisk > 0 ? (grossPnl / capitalAtRisk) * 100 : 0;
            })()
          : 0,
      commission: totalFees,
      entryName: '',
      exitName,
      mae: Math.max(0, mae),
      mfe: Math.max(0, mfe),
      barsHeld: this.barIndex - this.position.entryBarIndex,
    };

    this.trades.push(trade);
    this.equity += netPnl;

    this.position.quantity -= closeQuantity;

    // Pop lots FIFO (or target specific lot when fromEntryLot is specified)
    let remaining = closeQuantity;
    if (fromEntryLot) {
      // Reduce only the matching entry's lot
      const lotIndex = this.position.lots.findIndex((l) => l.entryName === fromEntryLot);
      if (lotIndex >= 0) {
        const lot = this.position.lots[lotIndex]!;
        if (lot.quantity <= remaining) {
          remaining -= lot.quantity;
          this.position.lots.splice(lotIndex, 1);
        } else {
          lot.quantity -= remaining;
          remaining = 0;
        }
      }
    }
    while (remaining > 0 && this.position.lots.length > 0) {
      const lot = this.position.lots[0]!;
      if (lot.quantity <= remaining) {
        remaining -= lot.quantity;
        this.position.lots.shift();
      } else {
        lot.quantity -= remaining;
        remaining = 0;
      }
    }
    if (this.position.quantity <= 0) {
      // Cancel any remaining pending orders from this position's OCA group
      if (this.position.entryName) {
        this.cancelOcaGroup(`oca_${this.position.entryName}`);
      }
      this.entries = 0;
      this.position = {
        symbol: '',
        direction: 'flat',
        quantity: 0,
        avgPrice: 0,
        entryTime: 0,
        entryBarIndex: 0,
        entryName: '',
        pnl: 0,
        pnlPercent: 0,
        commission: 0,
        unrealizedPnl: 0,
        lots: [],
      };
    }

    this.updateDrawdown();
  }

  private updateDrawdown(): void {
    if (this.equity > this.peakEquity) {
      this.peakEquity = this.equity;
    }

    const drawdown = this.peakEquity - this.equity;
    if (drawdown > this.maxDrawdown) {
      this.maxDrawdown = drawdown;
    }
  }

  updateBar(
    barIndex: number,
    timestamp: number,
    open: number,
    high: number,
    low: number,
    close: number,
    _volume: number,
  ): void {
    this.barIndex = barIndex;
    this.timestamp = timestamp;
    this.currentPrice = close;
    this.fillPendingMarketOrders(open, high, low, close);
    this.trailingStopManager.update(
      this.pendingOrders,
      this.position.direction,
      this.position.avgPrice,
      high,
      low,
      close,
    );
    this.processPendingOrders(high, low);
    this.updatePositionPnL(close);

    // Track trade excursion for MAE/MFE while position is open
    if (this.position.direction !== 'flat' && this.position.quantity > 0) {
      if (high > this._tradeHighPrice) this._tradeHighPrice = high;
      if (low > 0 && low < this._tradeLowPrice) this._tradeLowPrice = low;
    }

    this.checkLiquidation();
  }

  private computeMarketFillPrice(open: number, high: number, low: number, close: number): number {
    switch (this.config.marketFillPrice) {
      case 'ohlc4':
        return (open + high + low + close) / 4;
      case 'close':
        return close;
      case 'high':
        return high;
      case 'low':
        return low;
      case 'open':
      default:
        return open;
    }
  }

  private fillPendingMarketOrders(open: number, high: number, low: number, close: number): void {
    const marketOrders = this.pendingOrders.filter((o) => o.type === 'market');
    this.pendingOrders = this.pendingOrders.filter((o) => o.type !== 'market');

    const fillPrice = this.computeMarketFillPrice(open, high, low, close);

    for (const order of marketOrders) {
      console.log(
        `[StrategyEngine] fillMarketOrder: orderId=${order.id} action=${order.action} qty=${order.quantity} fillPrice=${fillPrice} (mode=${this.config.marketFillPrice})`,
      );
      this.fillOrder(order, fillPrice);
    }
    if (marketOrders.length > 0) {
      console.log(
        `[StrategyEngine] after fill: pos=${this.position.direction} qty=${this.position.quantity}`,
      );
    }
  }

  private processPendingOrders(high: number, low: number): void {
    const ordersToFill: Order[] = [];
    const stopLimitTriggers: Order[] = [];

    this.pendingOrders = this.pendingOrders.filter((order) => {
      if (order.type === 'limit') {
        const limitHit =
          order.action === 'buy'
            ? low <= (order.limitPrice ?? order.price)
            : high >= (order.limitPrice ?? order.price);
        if (limitHit) {
          ordersToFill.push(order);
          return false;
        }
      } else if (order.type === 'stop') {
        const stopHit =
          order.action === 'buy'
            ? high >= (order.stopPrice ?? order.price)
            : low <= (order.stopPrice ?? order.price);
        if (stopHit) {
          ordersToFill.push(order);
          return false;
        }
      } else if (order.type === 'stop-limit') {
        const stopHit =
          order.action === 'buy'
            ? high >= (order.stopPrice ?? order.price)
            : low <= (order.stopPrice ?? order.price);
        if (stopHit) {
          stopLimitTriggers.push(order);
          return false;
        }
      }
      return true;
    });

    for (const order of ordersToFill) {
      const fillPrice =
        order.type === 'limit'
          ? (order.limitPrice ?? order.price)
          : (order.stopPrice ?? order.price);
      this.fillOrder(order, fillPrice);
      // Cancel sibling OCA orders after a fill
      if (order.ocaGroup) {
        this.cancelOcaSiblings(order.ocaGroup);
      }
    }

    for (const order of stopLimitTriggers) {
      const limitPrice = order.limitPrice ?? order.price;
      const limitHit = order.action === 'buy' ? low <= limitPrice : high >= limitPrice;
      if (limitHit) {
        this.fillOrder(order, limitPrice);
        // Cancel sibling OCA orders after a fill
        if (order.ocaGroup) {
          this.cancelOcaSiblings(order.ocaGroup);
        }
      } else {
        const limitOrder: Order = {
          ...order,
          id: this.generateOrderId(),
          type: 'limit',
          price: limitPrice,
          limitPrice,
          stopPrice: undefined,
        };
        this.pendingOrders.push(limitOrder);
      }
    }
  }

  /** Cancel all pending orders in the given OCA group except ones already in the process of being filled. */
  private cancelOcaSiblings(ocaGroup: string): void {
    const cancelled: Order[] = [];
    this.pendingOrders = this.pendingOrders.filter((o) => {
      if (o.ocaGroup === ocaGroup) {
        cancelled.push(o);
        return false;
      }
      return true;
    });
    for (const order of cancelled) {
      this.markers.push({
        type: 'cancel',
        orderId: order.id,
        name: order.entryName,
        direction: order.direction,
        action: order.action,
        quantity: order.quantity,
        price: order.price,
        barIndex: this.barIndex,
        timestamp: this.timestamp,
        color: '#999999',
      });
    }
  }

  /** Cancel all pending orders in a specific OCA group. */
  private cancelOcaGroup(ocaGroup: string): void {
    if (!ocaGroup) return;
    const cancelled: Order[] = [];
    this.pendingOrders = this.pendingOrders.filter((o) => {
      if (o.ocaGroup === ocaGroup) {
        cancelled.push(o);
        return false;
      }
      return true;
    });
    for (const order of cancelled) {
      this.markers.push({
        type: 'cancel',
        orderId: order.id,
        name: order.entryName,
        direction: order.direction,
        action: order.action,
        quantity: order.quantity,
        price: order.price,
        barIndex: this.barIndex,
        timestamp: this.timestamp,
        color: '#999999',
      });
    }
  }

  private updatePositionPnL(currentPrice: number): void {
    if (this.position.direction === 'flat') return;

    this.position.unrealizedPnl =
      this.position.direction === 'long'
        ? (currentPrice - this.position.avgPrice) * this.position.quantity
        : (this.position.avgPrice - currentPrice) * this.position.quantity;

    this.position.pnl = this.position.unrealizedPnl;

    this.position.pnlPercent =
      this.position.avgPrice > 0
        ? ((currentPrice - this.position.avgPrice) / this.position.avgPrice) *
          100 *
          (this.position.direction === 'long' ? 1 : -1)
        : 0;

    const totalEquity = this.equity + this.position.unrealizedPnl;
    if (totalEquity > this.peakEquity) {
      this.peakEquity = totalEquity;
    }

    const drawdown = this.peakEquity - totalEquity;
    if (drawdown > this.maxDrawdown) {
      this.maxDrawdown = drawdown;
    }
  }

  getPosition(): Position {
    return { ...this.position };
  }

  getConfig(): Readonly<StrategyConfig> {
    return this.config;
  }

  getEquity(): number {
    return this.equity;
  }

  getPeakEquity(): number {
    return this.peakEquity;
  }

  private generateOrderId(): string {
    return `order_${++this._nextOrderId}`;
  }

  getMaxDrawdown(): number {
    return this.maxDrawdown;
  }

  getPendingOrders(): Order[] {
    return [...this.pendingOrders];
  }

  getFilledOrders(): FilledOrder[] {
    return [...this.filledOrders];
  }

  getTrades(): Trade[] {
    return [...this.trades];
  }

  getAccount(): Account {
    const marginRate =
      this.position.direction === 'long' ? this.config.marginLong : this.config.marginShort;
    const positionValue = this.currentPrice * this.position.quantity;
    const marginUsed = this.position.direction !== 'flat' ? positionValue * marginRate : 0;
    const totalEquity = this.equity + this.position.unrealizedPnl;

    return {
      initialCapital: this.config.initialCapital,
      balance: this.equity,
      equity: totalEquity,
      marginUsed,
      freeMargin: totalEquity - marginUsed,
    };
  }

  calculateQty(_direction: OrderDirection): number {
    switch (this.config.defaultQtyType) {
      case 'percent_of_equity': {
        const account = this.getAccount();
        const cashAmount = account.equity * (this.config.defaultQty / 100);
        return this.currentPrice > 0 ? cashAmount / this.currentPrice : 0;
      }
      case 'cash': {
        return this.currentPrice > 0 ? this.config.defaultQty / this.currentPrice : 0;
      }
      default:
        return this.config.defaultQty;
    }
  }

  getMetrics(): import('./strategy-types.js').StrategyMetrics {
    return computeMetrics(
      this.trades,
      this.peakEquity,
      this.maxDrawdown,
      this.config.initialCapital,
    );
  }

  reset(): void {
    this._nextOrderId = 0;
    this.position = {
      symbol: '',
      direction: 'flat',
      quantity: 0,
      avgPrice: 0,
      entryTime: 0,
      entryBarIndex: 0,
      entryName: '',
      pnl: 0,
      pnlPercent: 0,
      commission: 0,
      unrealizedPnl: 0,
      lots: [],
    };
    this.pendingOrders = [];
    this.filledOrders = [];
    this.trades = [];
    this.markers = [];
    this._lastMarkerCount = 0;
    this.trailingStopManager.clear();
    this.equity = this.config.initialCapital;
    this.peakEquity = this.equity;
    this.maxDrawdown = 0;
  }
}
