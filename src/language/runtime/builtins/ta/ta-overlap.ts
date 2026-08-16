import { NA, isNa, type PineValue } from '../../../types/na.js';
import { guardFinite, isFiniteNumber } from '../../float-guards.js';
import { DecimalRingBuffer } from '../../decimal-ring-buffer.js';
import { pineValueToDecimal, decimalToPineValue } from '../../numbers/index.js';
import type { ExecutionEngine } from '../../execution-engine.js';

export function registerTaOverlap(engine: ExecutionEngine): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eng = engine as any;

  eng.builtins.set('ta.sma', (source: PineValue, length: PineValue): PineValue => {
    if (isNa(source) || isNa(length)) return NA;
    const len = Math.trunc(length as number);
    if (len <= 0) return NA;

    const key = `sma_${len}_${eng.currentCallSiteId}`;
    if (!eng.smaBuffers.has(key)) {
      eng.smaBuffers.set(key, new DecimalRingBuffer(len));
    }
    const buf = eng.smaBuffers.get(key)!;
    // Convert ONCE at the bar boundary — NA/NaN → NaN Decimal (R3). The running
    // sum accumulates EXACTLY at DP=20 inside DecimalRingBuffer (no Number
    // round-trip, §2.2), so ta.sma(0.1,10) = (0.1×10)/10 = 0.1 EXACTLY
    // (fp-final-gate). R4 UPGRADE vs the old float path: non-finite sums no
    // longer leak as raw NaN — decimalToPineValue collapses them to NA, which
    // matches Pine's ta.sma(na) → na propagation. Deliberate; do not restore.
    buf.push(pineValueToDecimal(source));
    if (buf.getSize() < len) {
      return NA;
    }
    return decimalToPineValue(buf.getSum().div(len));
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
      state.prev = state.sum / len;
      state.initialized = true;
      return state.prev;
    }
    state.prev += k * (val - state.prev);
    return guardFinite(state.prev);
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

  // Wilder's Relative Moving Average — the smoothing used by ATR/RSI. Seed is the
  // incremental SMA over the first `len` bars (NA until warm), then
  // rma = (rma[1] * (len - 1) + src) / len. State layout mirrors atrState since
  // ta.atr IS rma of the true range — one algorithm, two call-site key namespaces.
  eng.builtins.set('ta.rma', (source: PineValue, length: PineValue): PineValue => {
    if (isNa(source) || isNa(length)) return NA;
    const len = Math.trunc(length as number);
    if (len <= 0) return NA;
    const val = source as number;
    if (!isFiniteNumber(val)) return NA;

    const key = `rma_${len}_${eng.currentCallSiteId}`;
    if (!eng.rmaState.has(key)) {
      eng.rmaState.set(key, { prev: val, count: 1 });
      return NA;
    }
    const state = eng.rmaState.get(key)!;
    state.count++;
    if (state.count <= len) {
      state.prev = (state.prev * (state.count - 1) + val) / state.count;
      return NA;
    }
    state.prev = (state.prev * (len - 1) + val) / len;
    return guardFinite(state.prev);
  });
}
