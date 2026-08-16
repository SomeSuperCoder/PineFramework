import { Decimal } from 'decimal.js';
import { NA, isNa, type PineValue } from '../../../types/na.js';
import { guardFinite, isFiniteNumber } from '../../float-guards.js';
import { pineValueToDecimal, decimalToPineValue } from '../../numbers/index.js';
import type { ExecutionEngine } from '../../execution-engine.js';

export function registerTaVolatility(engine: ExecutionEngine): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eng = engine as any;

  eng.builtins.set('ta.sar', (start: PineValue, inc: PineValue, max: PineValue): PineValue => {
    if (!eng.currentContext) return NA;
    const ctx = eng.currentContext;
    const high = ctx.high.getRelative(0);
    const low = ctx.low.getRelative(0);
    const close = ctx.close.getRelative(0);
    if (typeof high !== 'number' || typeof low !== 'number' || typeof close !== 'number') return NA;

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

    const prevLow1: number = state.prevLow1;
    const prevLow2: number = state.prevLow2;
    const prevHigh1: number = state.prevHigh1;
    const prevHigh2: number = state.prevHigh2;
    const prevEp: number = state.prevEp;

    if (!isFiniteNumber(high) || !isFiniteNumber(low) || !isFiniteNumber(close)) {
      return NA;
    }
    let sar = guardFinite(state.prevSar + state.af * (state.ep - state.prevSar)) as number;
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

  // Average True Range — Decimal state (R4 upgrade, M7a). ta.atr IS rma of the
  // true range: the TR is computed at the bar boundary as exact Decimal, then
  // accumulated with the seed-then-Wilder recursion (prev*(count-1)+tr)/count →
  // (prev*(len-1)+tr)/len entirely at DP=20 — no Number round-trip per bar, so
  // the ATR converges EXACTLY on constant series (fp-final-gate). State layout
  // mirrors rmaState (ta.rma in ta-overlap.ts) — one algorithm, two call-site
  // key namespaces. The values[] history keeps PineValue[] semantics for the
  // ta.atr(N)[i] historical-index path in expression-executor: the first bar
  // pushes the NA sentinel; warm-up and Wilder entries are decimalToPineValue'd.
  // count/len stay INTEGER number math (Math.trunc guard). R4: non-finite OHLC
  // collapses to NA via isFiniteNumber BEFORE conversion, so Infinity never
  // reaches Decimal state (a NaN close[1] also falls back to close). R5: count/
  // len are positive integers by guard, so every div denominator is non-zero.
  eng.builtins.set('ta.atr', (length: PineValue): PineValue => {
    if (!eng.currentContext) return NA;
    const len = Math.trunc(typeof length === 'number' ? length : 14);
    if (len <= 0) return NA;
    const ctx = eng.currentContext;
    const high = ctx.high.getRelative(0);
    const low = ctx.low.getRelative(0);
    const close = ctx.close.getRelative(0);
    if (!isFiniteNumber(high) || !isFiniteNumber(low) || !isFiniteNumber(close)) return NA;
    // Convert ONCE at the bar boundary — the guard above guarantees finite
    // numbers, so pineValueToDecimal cannot produce the NaN marker here.
    const highD = pineValueToDecimal(high);
    const lowD = pineValueToDecimal(low);
    const closeD = pineValueToDecimal(close);
    // On bar 0 there is no close[1]; fall back to close so TR degrades to
    // max(high-low, |high-close|, |low-close|) — identical to the ta.tr path.
    const prevClose = ctx.close.getRelative(1);
    const prevCloseD = isFiniteNumber(prevClose) ? pineValueToDecimal(prevClose) : closeD;
    const tr = Decimal.max(
      highD.minus(lowD),
      highD.minus(prevCloseD).abs(),
      lowD.minus(prevCloseD).abs(),
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
      state.prev = state.prev
        .times(new Decimal(state.count - 1))
        .plus(tr)
        .div(new Decimal(state.count));
      state.values.push(decimalToPineValue(state.prev));
      return NA;
    }
    state.prev = state.prev
      .times(new Decimal(len - 1))
      .plus(tr)
      .div(new Decimal(len));
    state.values.push(decimalToPineValue(state.prev));
    return decimalToPineValue(state.prev);
  });

  // True range: max(high - low, |high - close[1]|, |low - close[1]|). Stateless —
  // a per-bar value with at most close[1] lookback. The `useMA` parameter is
  // accepted for signature compatibility with ta.tr(useMA): per the Pine v6
  // reference, ta.tr(true) is the canonical RAW true-range calculation (it is
  // paired with ta.rma(trueRange, len) to build ATRs), so the flag does not
  // alter the returned series. The LuxAlgo supertrend-3d script depends on this:
  // it computes `ta.tr(true)` once and derives 10 ATRs via ta.rma.
  // Decimal (R4 upgrade, M7a): the three terms are computed EXACTLY at DP=20
  // (high-low / |high-close[1]| / |low-close[1]| carry no IEEE 754 drift), and
  // decimalToPineValue double-guards the exit — the old guardFinite(tr) is
  // subsumed. Non-finite OHLC collapses to NA at the isFiniteNumber boundary
  // BEFORE conversion, so Infinity never reaches Decimal.
  eng.builtins.set('ta.tr', (useMA?: PineValue): PineValue => {
    void useMA; // accepted for Pine signature parity; does not change semantics
    if (!eng.currentContext) return NA;
    const ctx = eng.currentContext;
    const high = ctx.high.getRelative(0);
    const low = ctx.low.getRelative(0);
    const close = ctx.close.getRelative(0);
    if (!isFiniteNumber(high) || !isFiniteNumber(low) || !isFiniteNumber(close)) {
      return NA;
    }
    // Convert ONCE at the bar boundary — the guard above guarantees finite
    // numbers, so pineValueToDecimal cannot produce the NaN marker here.
    const highD = pineValueToDecimal(high);
    const lowD = pineValueToDecimal(low);
    const closeD = pineValueToDecimal(close);
    // On bar 0 there is no close[1]; fall back to close so TR degrades to
    // max(high-low, |high-close|, |low-close|) — identical to the ta.atr path.
    const prevClose = ctx.close.getRelative(1);
    const prevCloseD = isFiniteNumber(prevClose) ? pineValueToDecimal(prevClose) : closeD;
    const tr = Decimal.max(
      highD.minus(lowD),
      highD.minus(prevCloseD).abs(),
      lowD.minus(prevCloseD).abs(),
    );
    return decimalToPineValue(tr);
  });

  // Supertrend: factor * ATR band channel around hl2 with the classic
  // band-following rule (upper = min(current, prior), lower = max(current, prior),
  // trend = close vs final band). Returns [supertrend, direction] as a JS tuple —
  // the runtime's destructuring assignment ([a, b] = fn()) unpacks it. Direction is
  // 1 when close is above the line (uptrend), -1 below. NA-safe: while the internal
  // ATR warms up the function returns [na, na] without ever comparing against NA.
  // Decimal (R4 upgrade, M7b): TR, the internal seed-then-Wilder RMA, and the band
  // math (hl2 ± mult·atr, min/max band-following, close-vs-band compare) all run
  // EXACTLY at DP=20 — no Number round-trip per bar, so constant series converge
  // EXACTLY (fp-final-gate). Values convert once at the bar boundary
  // (pineValueToDecimal) and back at the exit (decimalToPineValue double-guards:
  // decimal NaN/±Inf AND JS Number overflow → NA — subsumes the old guardFinite).
  // R4: non-finite OHLC collapses to NA via isFiniteNumber BEFORE conversion, so
  // Infinity never reaches Decimal state; a NaN close[1] falls back to close.
  // mult defaults to 3.0 for a missing/NA/non-finite factor. period stays an
  // integer via Math.trunc — only VALUES are decimal, window sizing stays int.
  // prevUpper/prevLower are stored Decimal | null so band-following compares
  // exact decimals across bars. R5: period ≥ 1 by guard, so every div denominator
  // (count, period) is non-zero.
  eng.builtins.set('ta.supertrend', (factor: PineValue, atrPeriod: PineValue): PineValue => {
    if (!eng.currentContext) return [NA, NA] as PineValue;
    const mult = isFiniteNumber(factor) ? new Decimal(factor) : new Decimal(3.0);
    const period = Math.trunc(typeof atrPeriod === 'number' ? (atrPeriod as number) : 10);
    if (period <= 0) return [NA, NA] as PineValue;
    const ctx = eng.currentContext;
    const high = ctx.high.getRelative(0);
    const low = ctx.low.getRelative(0);
    const close = ctx.close.getRelative(0);
    if (!isFiniteNumber(high) || !isFiniteNumber(low) || !isFiniteNumber(close)) {
      return [NA, NA] as PineValue;
    }
    // Convert ONCE at the bar boundary — the guard above guarantees finite
    // numbers, so pineValueToDecimal cannot produce the NaN marker here.
    const highD = pineValueToDecimal(high);
    const lowD = pineValueToDecimal(low);
    const closeD = pineValueToDecimal(close);
    // On bar 0 there is no close[1]; fall back to close so TR degrades to
    // max(high-low, |high-close|, |low-close|) — identical to ta.tr/ta.atr.
    const prevClose = ctx.close.getRelative(1);
    const prevCloseD = isFiniteNumber(prevClose) ? pineValueToDecimal(prevClose) : closeD;
    const tr = Decimal.max(
      highD.minus(lowD),
      highD.minus(prevCloseD).abs(),
      lowD.minus(prevCloseD).abs(),
    );

    const key = `st_${period}_${eng.currentCallSiteId}`;
    if (!eng.supertrendState.has(key)) {
      eng.supertrendState.set(key, {
        atrCount: 0,
        atrPrev: new Decimal(0),
        prevUpper: null,
        prevLower: null,
      });
    }
    const state = eng.supertrendState.get(key)!;

    // Internal ATR via the same seed-then-Wilder RMA as ta.atr/ta.rma — the
    // warm-up SMA and the Wilder smoothing both accumulate EXACTLY at DP=20.
    let atr: Decimal | null;
    state.atrCount++;
    if (state.atrCount === 1) {
      state.atrPrev = tr;
      atr = null;
    } else if (state.atrCount <= period) {
      state.atrPrev = state.atrPrev
        .times(new Decimal(state.atrCount - 1))
        .plus(tr)
        .div(new Decimal(state.atrCount));
      atr = null;
    } else {
      state.atrPrev = state.atrPrev
        .times(new Decimal(period - 1))
        .plus(tr)
        .div(new Decimal(period));
      atr = state.atrPrev;
    }

    if (atr === null) {
      state.prevUpper = null;
      state.prevLower = null;
      return [NA, NA] as PineValue;
    }

    const hl2 = highD.plus(lowD).div(2);
    const upper = hl2.plus(mult.times(atr));
    const lower = hl2.minus(mult.times(atr));
    const finalUpper = state.prevUpper === null ? upper : Decimal.min(upper, state.prevUpper);
    const finalLower = state.prevLower === null ? lower : Decimal.max(lower, state.prevLower);
    state.prevUpper = finalUpper;
    state.prevLower = finalLower;

    const st = closeD.gt(finalUpper) ? finalLower : finalUpper;
    const direction = closeD.gte(st) ? 1 : -1;
    return [decimalToPineValue(st), direction] as PineValue;
  });
}
