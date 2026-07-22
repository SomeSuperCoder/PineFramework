import { NA, isNa, type PineValue } from '../../../types/na.js';
import { guardFinite, isFiniteNumber } from '../../float-guards.js';
import type { ExecutionEngine } from '../../execution-engine.js';

export function registerTaVolatility(engine: ExecutionEngine): void {
  const eng = engine as any;

  eng.builtins.set('ta.sar', (start: PineValue, inc: PineValue, max: PineValue): PineValue => {
    if (!eng.currentContext) return NA;
    const ctx = eng.currentContext;
    const high = ctx.high.getRelative(0);
    const low = ctx.low.getRelative(0);
    const close = ctx.close.getRelative(0);
    if (typeof high !== 'number' || typeof low !== 'number' || typeof close !== 'number')
      return NA;

    const afStart = typeof start === 'number' ? start : 0.02;
    const afInc = typeof inc === 'number' ? inc : 0.02;
    const afMax = typeof max === 'number' ? max : 0.2;
    const key = `sar_${eng.currentCallSiteId}`;

    if (!eng.sarState.has(key)) {
      eng.sarState.set(key, {
        initialized: false,
        trend: 'up',
        sar: 0,
        ep: 0,
        af: afStart,
        afStart,
        afInc,
        afMax,
        prevSar: 0,
        prevEp: 0,
        prevLow1: 0,
        prevLow2: 0,
        prevHigh1: 0,
        prevHigh2: 0,
        barCount: 0,
      });
    }

    const state = eng.sarState.get(key)!;
    state.barCount++;

    const prevHigh = ctx.high.getRelative(1);
    const prevLow = ctx.low.getRelative(1);
    const prevClose = ctx.close.getRelative(1);

    if (!state.initialized) {
      if (
        typeof prevHigh !== 'number' ||
        typeof prevLow !== 'number' ||
        typeof prevClose !== 'number'
      ) {
        state.prevHigh1 = high;
        state.prevLow1 = low;
        state.prevHigh2 = high;
        state.prevLow2 = low;
        state.prevSar = low;
        state.prevEp = high;
        state.sar = low;
        state.ep = high;
        return low;
      }

      if (close > prevClose) {
        state.trend = 'up';
        state.sar = Math.min(low, prevLow);
        state.ep = Math.max(high, prevHigh);
      } else {
        state.trend = 'down';
        state.sar = Math.max(high, prevHigh);
        state.ep = Math.min(low, prevLow);
      }

      state.af = afStart;
      state.prevSar = state.sar;
      state.prevEp = state.ep;
      state.prevLow1 = low;
      state.prevLow2 = prevLow;
      state.prevHigh1 = high;
      state.prevHigh2 = prevHigh;
      state.initialized = true;
      return state.sar;
    }

    const prevLow1 = state.prevLow1;
    const prevLow2 = state.prevLow2;
    const prevHigh1 = state.prevHigh1;
    const prevHigh2 = state.prevHigh2;
    const prevEp = state.prevEp;

    if (!isFiniteNumber(high) || !isFiniteNumber(low) || !isFiniteNumber(close)) {
      return NA;
    }
    let sar = guardFinite(state.prevSar + state.af * (state.ep - state.prevSar));
    if (isNa(sar)) return NA;

    if (state.trend === 'up') {
      sar = Math.min(sar, prevLow1, prevLow2);

      if (low < sar) {
        state.trend = 'down';
        sar = prevEp;
        state.ep = low;
        state.af = afStart;
      } else {
        if (high > state.ep) {
          state.ep = high;
          state.af = Math.min(state.af + afInc, afMax);
        }
      }
    } else {
      sar = Math.max(sar, prevHigh1, prevHigh2);

      if (high > sar) {
        state.trend = 'up';
        sar = prevEp;
        state.ep = high;
        state.af = afStart;
      } else {
        if (low < state.ep) {
          state.ep = low;
          state.af = Math.min(state.af + afInc, afMax);
        }
      }
    }

    state.prevSar = sar;
    state.prevEp = state.ep;
    state.prevLow1 = low;
    state.prevLow2 = prevLow1;
    state.prevHigh1 = high;
    state.prevHigh2 = prevHigh1;

    return guardFinite(sar);
  });

  eng.builtins.set('ta.atr', (length: PineValue): PineValue => {
    if (!eng.currentContext) return NA;
    const len = Math.trunc(typeof length === 'number' ? length : 14);
    if (len <= 0) return NA;
    const ctx = eng.currentContext;
    const high = ctx.high.getRelative(0);
    const low = ctx.low.getRelative(0);
    const close = ctx.close.getRelative(0);
    if (typeof high !== 'number' || typeof low !== 'number' || typeof close !== 'number')
      return NA;
    const prevClose = ctx.close.getRelative(1);
    const tr = Math.max(
      high - low,
      Math.abs(high - (typeof prevClose === 'number' ? prevClose : close)),
      Math.abs(low - (typeof prevClose === 'number' ? prevClose : close)),
    );
    const key = `atr_${len}_${eng.currentCallSiteId}`;
    if (!eng.atrState.has(key)) {
      eng.atrState.set(key, { prev: tr, count: 1, values: [] });
      eng.atrState.get(key)!.values.push(NA);
      return NA;
    }
    const state = eng.atrState.get(key)!;
    state.count++;
    if (state.count <= len) {
      state.prev = (state.prev * (state.count - 1) + tr) / state.count;
      state.values.push(state.prev);
      return NA;
    }
    state.prev = (state.prev * (len - 1) + tr) / len;
    state.values.push(state.prev);
    return state.prev;
  });
}
