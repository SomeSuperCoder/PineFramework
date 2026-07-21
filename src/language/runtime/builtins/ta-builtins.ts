import type { ExecutionEngine } from '../execution-engine.js';
import { NA, isNa, type PineValue } from '../../types/na.js';
import { RingBuffer } from '../ring-buffer.js';
import { guardFinite, isFiniteNumber, isNearZero } from '../float-guards.js';

export function registerTaBuiltins(engine: ExecutionEngine): void {
  const eng = engine as any;

  eng.builtins.set('ta.sma', (source: PineValue, length: PineValue): PineValue => {
    if (isNa(source) || isNa(length)) return NA;
    const len = Math.trunc(length as number);
    if (len <= 0) return NA;

    const key = `sma_${len}_${eng.currentCallSiteId}`;
    if (!eng.smaBuffers.has(key)) {
      eng.smaBuffers.set(key, new RingBuffer(len));
    }
    const buf = eng.smaBuffers.get(key)!;
    buf.push(source as number);
    if (buf.getSize() < len) {
      return NA;
    }
    return buf.getSum() / len;
  });

  eng.builtins.set('ta.ema', (source: PineValue, length: PineValue): PineValue => {
    if (isNa(source) || isNa(length)) return NA;
    const len = Math.trunc(length as number);
    if (len <= 0) return NA;
    const val = source as number;
    if (!isFiniteNumber(val)) return NA;

    const key = `ema_${len}_${eng.currentCallSiteId}`;
    const k = 2 / (len + 1);
    if (!eng.emaState.has(key)) {
      eng.emaState.set(key, { prev: 0, count: 0, sum: 0, initialized: false });
      return NA;
    }
    const state = eng.emaState.get(key)!;
    state.count++;
    state.sum += val;

    if (state.count < len) {
      return NA;
    }
    if (!state.initialized) {
      // Initialize with SMA of first 'len' values
      state.prev = state.sum / len;
      state.initialized = true;
      return state.prev;
    }
    // Numerically stable form: prev += k * (val - prev)
    // Avoids the less-stable: prev = val * k + prev * (1 - k)
    state.prev += k * (val - state.prev);
    return guardFinite(state.prev);
  });

  eng.builtins.set('ta.rsi', (source: PineValue, length: PineValue): PineValue => {
    if (isNa(source) || isNa(length)) return NA;
    const len = Math.trunc(length as number);
    if (len <= 0) return NA;
    const val = source as number;
    if (isNaN(val)) return NA;

    const key = `rsi_${len}_${eng.currentCallSiteId}`;
    if (!eng.rsiState.has(key)) {
      eng.rsiState.set(key, { prevAvgGain: 0, prevAvgLoss: 0, count: 0, prevSource: val });
      return NA;
    }
    const state = eng.rsiState.get(key)!;
    state.count++;

    const change = val - state.prevSource;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    state.prevSource = val;

    if (state.count <= len) {
      state.prevAvgGain = (state.prevAvgGain * (state.count - 1) + gain) / state.count;
      state.prevAvgLoss = (state.prevAvgLoss * (state.count - 1) + loss) / state.count;
      if (state.count < len) return NA;
    } else {
      state.prevAvgGain = (state.prevAvgGain * (len - 1) + gain) / len;
      state.prevAvgLoss = (state.prevAvgLoss * (len - 1) + loss) / len;
    }

    // Use epsilon comparison to handle IEEE 754 near-zero values
    if (isNearZero(state.prevAvgLoss)) return isNearZero(state.prevAvgGain) ? 50 : 100;
    const rs = state.prevAvgGain / state.prevAvgLoss;
    return guardFinite(100 - 100 / (1 + rs));
  });

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

    // Guard all inputs to prevent NaN cascade
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

  eng.builtins.set('ta.highest', (source: PineValue, length: PineValue): PineValue => {
    if (isNa(source) || isNa(length)) return NA;
    const len = Math.trunc(length as number);
    if (len <= 0) return NA;
    const key = `highest_${len}_${eng.currentCallSiteId}`;
    if (!eng.highestBuffers.has(key)) {
      eng.highestBuffers.set(key, []);
    }
    const buf = eng.highestBuffers.get(key)!;
    buf.push(source as number);
    if (buf.length > len) buf.shift();
    if (buf.length < len) return NA;
    let max = buf[0];
    for (let i = 1; i < buf.length; i++) {
      if (buf[i] > max) max = buf[i];
    }
    return max;
  });

  eng.builtins.set('ta.lowest', (source: PineValue, length: PineValue): PineValue => {
    if (isNa(source) || isNa(length)) return NA;
    const len = Math.trunc(length as number);
    if (len <= 0) return NA;
    const key = `lowest_${len}_${eng.currentCallSiteId}`;
    if (!eng.lowestBuffers.has(key)) {
      eng.lowestBuffers.set(key, []);
    }
    const buf = eng.lowestBuffers.get(key)!;
    buf.push(source as number);
    if (buf.length > len) buf.shift();
    if (buf.length < len) return NA;
    let min = buf[0];
    for (let i = 1; i < buf.length; i++) {
      if (buf[i] < min) min = buf[i];
    }
    return min;
  });

  eng.builtins.set('ta.hma', (source: PineValue, length: PineValue): PineValue => {
    if (isNa(source) || isNa(length)) return NA;
    const len = Math.trunc(length as number);
    if (len <= 0) return NA;
    const halfLen = Math.floor(len / 2);
    const sqrtLen = Math.floor(Math.sqrt(len));

    const key = `hma_${len}_${eng.currentCallSiteId}`;
    if (!eng.hmaBuffers.has(key)) {
      eng.hmaBuffers.set(key, { half: [], full: [], diff: [] });
    }
    const buf = eng.hmaBuffers.get(key)!;
    const val = source as number;

    buf.half.push(val);
    if (buf.half.length > halfLen) buf.half.shift();

    buf.full.push(val);
    if (buf.full.length > len) buf.full.shift();

    // WMA of half-length
    let wmaHalf = 0;
    if (buf.half.length >= halfLen) {
      let wSum = 0;
      let wWeight = 0;
      for (let i = 0; i < buf.half.length; i++) {
        const weight = i + 1;
        wSum += buf.half[i] * weight;
        wWeight += weight;
      }
      wmaHalf = wSum / wWeight;
    }

    // WMA of full-length
    let wmaFull = 0;
    if (buf.full.length >= len) {
      let wSum = 0;
      let wWeight = 0;
      for (let i = 0; i < buf.full.length; i++) {
        const weight = i + 1;
        wSum += buf.full[i] * weight;
        wWeight += weight;
      }
      wmaFull = wSum / wWeight;
    }

    if (buf.half.length < halfLen || buf.full.length < len) {
      return NA;
    }

    buf.diff.push(2 * wmaHalf - wmaFull);
    if (buf.diff.length > sqrtLen) buf.diff.shift();

    // WMA of diff with sqrtLen
    if (buf.diff.length < sqrtLen) {
      return NA;
    }
    let dSum = 0;
    let dWeight = 0;
    for (let i = 0; i < buf.diff.length; i++) {
      const weight = i + 1;
      dSum += buf.diff[i] * weight;
      dWeight += weight;
    }
    return dSum / dWeight;
  });

  // Small epsilon for cross detection — values within this band are
  // considered equal, preventing false positives from IEEE 754 noise
  // while still detecting clear cross signals.
  const CROSS_EPSILON = 1e-10;

  eng.builtins.set('ta.crossover', (source: PineValue, compare: PineValue): PineValue => {
    if (isNa(source) || isNa(compare)) return false;
    const key = `cross_${eng.currentCallSiteId}`;
    const prev = eng.crossPrevValues.get(key);
    if (!prev) {
      eng.crossPrevValues.set(key, { src: source as number, cmp: compare as number });
      return false;
    }
    const prevDiff = prev.src - prev.cmp;
    const currDiff = (source as number) - (compare as number);
    // Was not clearly above, now clearly above (must clear epsilon band)
    const result = prevDiff < CROSS_EPSILON && currDiff > CROSS_EPSILON;
    prev.src = source as number;
    prev.cmp = compare as number;
    return result;
  });

  eng.builtins.set('ta.crossunder', (source: PineValue, compare: PineValue): PineValue => {
    if (isNa(source) || isNa(compare)) return false;
    const key = `cross_${eng.currentCallSiteId}`;
    const prev = eng.crossPrevValues.get(key);
    if (!prev) {
      eng.crossPrevValues.set(key, { src: source as number, cmp: compare as number });
      return false;
    }
    const prevDiff = prev.src - prev.cmp;
    const currDiff = (source as number) - (compare as number);
    // Was not clearly below, now clearly below
    const result = prevDiff > -CROSS_EPSILON && currDiff < -CROSS_EPSILON;
    prev.src = source as number;
    prev.cmp = compare as number;
    return result;
  });

  eng.builtins.set('ta.cross', (source: PineValue, compare: PineValue): PineValue => {
    if (isNa(source) || isNa(compare)) return false;
    const key = `cross_${eng.currentCallSiteId}`;
    const prev = eng.crossPrevValues.get(key);
    if (!prev) {
      eng.crossPrevValues.set(key, { src: source as number, cmp: compare as number });
      return false;
    }
    const prevDiff = prev.src - prev.cmp;
    const currDiff = (source as number) - (compare as number);
    const crossed =
      (prevDiff < CROSS_EPSILON && currDiff > CROSS_EPSILON) ||
      (prevDiff > -CROSS_EPSILON && currDiff < -CROSS_EPSILON);
    prev.src = source as number;
    prev.cmp = compare as number;
    return crossed;
  });

  eng.builtins.set('ta.change', (source: PineValue): PineValue => {
    if (isNa(source)) return NA;
    const key = `change_${eng.currentCallSiteId}`;
    const prev = eng.changePrevValues.get(key);
    if (prev === undefined) {
      eng.changePrevValues.set(key, source as number);
      return NA;
    }
    const result = (source as number) - prev;
    eng.changePrevValues.set(key, source as number);
    return result;
  });

  /**
   * ta.pivothigh(leftBars, rightBars) → series float
   *
   * Detects a pivot high bar whose high is strictly greater than the high
   * of all bars in the window [barIndex - leftBars - rightBars, barIndex - rightBars + rightBars],
   * excluding the candidate bar itself.
   *
   * The result appears `rightBars` bars after the pivot (when confirmed).
   * Left-side bars that go beyond the available series length are skipped (NA-tolerant).
   */
  eng.builtins.set('ta.pivothigh', (...args: PineValue[]): PineValue => {
    if (!eng.currentContext) return NA;
    const last = args[args.length - 1];
    const hasNamed = typeof last === 'object' && last !== null && !Array.isArray(last);
    const positionalCount = hasNamed ? args.length - 1 : args.length;
    if (positionalCount < 2) return NA;
    const leftBars = args[0] as number;
    const rightBars = args[1] as number;
    if (leftBars < 1 || rightBars < 1) return NA;
    // Read from the engine's accumulated OHLC history, not from the context series.
    // Each context's series only has the current bar's value, but ohlcHistory has
    // all historical bars pushed by the interpreter before statements execute.
    const highArr = eng.ohlcHistory.high;
    const len = highArr.length;
    // Must have ALL left + right + candidate bars in the window
    if (len < leftBars + rightBars + 1) return NA;
    const candidateIdx = len - 1 - rightBars;
    const candidateValue = highArr[candidateIdx];
    if (typeof candidateValue !== 'number' || isNaN(candidateValue)) return NA;
    // Left neighbors: equal values are OK (candidate is the LAST max in the window)
    for (let d = -leftBars; d < 0; d++) {
      const idx = candidateIdx + d;
      const v = highArr[idx];
      if (typeof v === 'number' && !isNaN(v) && v > candidateValue) return NA;
    }
    // Right neighbors: must be STRICTLY less — equal means pivot not confirmed
    for (let d = 1; d <= rightBars; d++) {
      const idx = candidateIdx + d;
      const v = highArr[idx];
      if (typeof v === 'number' && !isNaN(v) && v >= candidateValue) return NA;
    }
    return candidateValue;
  });

  /**
   * ta.pivotlow(leftBars, rightBars) → series float
   *
   * Detects a pivot low bar whose low is strictly less than the low
   * of all bars in the window [barIndex - leftBars - rightBars, barIndex - rightBars + rightBars],
   * excluding the candidate bar itself.
   */
  eng.builtins.set('ta.pivotlow', (...args: PineValue[]): PineValue => {
    if (!eng.currentContext) return NA;
    const last = args[args.length - 1];
    const hasNamed = typeof last === 'object' && last !== null && !Array.isArray(last);
    const positionalCount = hasNamed ? args.length - 1 : args.length;
    if (positionalCount < 2) return NA;
    const leftBars = args[0] as number;
    const rightBars = args[1] as number;
    if (leftBars < 1 || rightBars < 1) return NA;
    // Read from the engine's accumulated OHLC history, not from the context series.
    const lowArr = eng.ohlcHistory.low;
    const len = lowArr.length;
    // Must have ALL left + right + candidate bars in the window
    if (len < leftBars + rightBars + 1) return NA;
    const candidateIdx = len - 1 - rightBars;
    const candidateValue = lowArr[candidateIdx];
    if (typeof candidateValue !== 'number' || isNaN(candidateValue)) return NA;
    // Left neighbors: equal values are OK (candidate is the LAST min in the window)
    for (let d = -leftBars; d < 0; d++) {
      const idx = candidateIdx + d;
      const v = lowArr[idx];
      if (typeof v === 'number' && !isNaN(v) && v < candidateValue) return NA;
    }
    // Right neighbors: must be STRICTLY greater — equal means pivot not confirmed
    for (let d = 1; d <= rightBars; d++) {
      const idx = candidateIdx + d;
      const v = lowArr[idx];
      if (typeof v === 'number' && !isNaN(v) && v <= candidateValue) return NA;
    }
    return candidateValue;
  });

  eng.builtins.set('ta.valuewhen', (condition: PineValue, source: PineValue, occurrence: PineValue): PineValue => {
    const occ = typeof occurrence === 'number' ? Math.trunc(occurrence) : 0;
    if (occ < 0) return NA;
    const key = `valuewhen_${eng.currentCallSiteId}`;
    if (!eng.valuewhenHistory) {
      eng.valuewhenHistory = new Map();
    }
    if (!eng.valuewhenHistory.has(key)) {
      eng.valuewhenHistory.set(key, []);
    }
    const history: number[] = eng.valuewhenHistory.get(key)!;
    // When condition is truthy, record the source value
    if (condition && condition !== 0 && condition !== false) {
      if (typeof source === 'number') {
        history.push(source);
      } else {
        history.push(NA as any);
      }
    }
    // Return the value at the requested occurrence (occ=0 is most recent, occ=1 is previous, etc.)
    const idx = history.length - 1 - occ;
    if (idx >= 0 && idx < history.length) {
      return history[idx]!;
    }
    return NA;
  });
}
