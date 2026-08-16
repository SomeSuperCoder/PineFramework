import { Decimal } from 'decimal.js';
import { NA, isNa, type PineValue } from '../../../types/na.js';
import { isFiniteNumber } from '../../float-guards.js';
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

  // Exponential Moving Average — Decimal state (R4 upgrade, M5b). State values
  // live as Decimal through the ENTIRE recursion: sum accumulates exactly at
  // DP=20, the seed prev = sum/len and the k*(val-prev) update never round-trip
  // through Number, so ta.ema no longer drifts the way the float k-iteration
  // did. Count/threshold logic is INTEGER number math — unchanged. Non-finite
  // inputs collapse to NA at the boundary guard, never reaching state.
  eng.builtins.set('ta.ema', (source: PineValue, length: PineValue): PineValue => {
    if (isNa(source) || isNa(length)) return NA;
    const len = Math.trunc(length as number);
    if (len <= 0) return NA;
    const rawVal = source as number;
    if (!isFiniteNumber(rawVal)) return NA;
    // Convert ONCE at the bar boundary — the guard above guarantees a finite
    // number, so pineValueToDecimal cannot produce the NaN marker here.
    const val = pineValueToDecimal(source);

    const key = `ema_${len}_${eng.currentCallSiteId}`;
    // Smoothing constant, computed once per call-site key. Decimal so the
    // recursive update stays exact at DP=20 (float k = 2/(len+1) accumulated
    // IEEE 754 error across bars).
    const k = new Decimal(2).div(new Decimal(len + 1));
    if (!eng.emaState.has(key)) {
      eng.emaState.set(key, {
        prev: new Decimal(0),
        count: 0,
        sum: new Decimal(0),
        initialized: false,
      });
      return NA;
    }
    const state = eng.emaState.get(key)!;
    state.count++;
    state.sum = state.sum.plus(val);

    if (state.count < len) {
      return NA;
    }
    if (!state.initialized) {
      // Seed = SMA of the first `len` bars (Pine warm-up semantics), then recur.
      state.prev = state.sum.div(new Decimal(len));
      state.initialized = true;
      return decimalToPineValue(state.prev);
    }
    state.prev = state.prev.plus(k.times(val.minus(state.prev)));
    return decimalToPineValue(state.prev);
  });

  // Hull Moving Average — Decimal state (R4 upgrade, M5c). The three sliding
  // windows (half, full, diff) hold Decimal values, so the WMA weighted sums
  // accumulate EXACTLY at DP=20 and 2*wmaHalf − wmaFull never round-trips
  // through Number — ta.hma(0.1, ...) no longer drifts the way the float path
  // did. Count/length/threshold logic stays INTEGER number math (Math.floor,
  // array lengths); weights are integers converted per-multiply. Non-finite
  // inputs collapse to NA at the boundary guard, never reaching state.
  eng.builtins.set('ta.hma', (source: PineValue, length: PineValue): PineValue => {
    if (isNa(source) || isNa(length)) return NA;
    const len = Math.trunc(length as number);
    if (len <= 0) return NA;
    const rawVal = source as number;
    if (!isFiniteNumber(rawVal)) return NA;
    // Convert ONCE at the bar boundary — the guard above guarantees a finite
    // number, so pineValueToDecimal cannot produce the NaN marker here.
    const val = pineValueToDecimal(source);
    const halfLen = Math.floor(len / 2);
    const sqrtLen = Math.floor(Math.sqrt(len));

    const key = `hma_${len}_${eng.currentCallSiteId}`;
    if (!eng.hmaBuffers.has(key)) {
      eng.hmaBuffers.set(key, { half: [], full: [], diff: [] });
    }
    const buf = eng.hmaBuffers.get(key)!;

    buf.half.push(val);
    if (buf.half.length > halfLen) buf.half.shift();

    buf.full.push(val);
    if (buf.full.length > len) buf.full.shift();

    // WMA of half-length
    let wmaHalf = new Decimal(0);
    if (buf.half.length >= halfLen) {
      let wSum = new Decimal(0);
      let wWeight = 0;
      for (let i = 0; i < buf.half.length; i++) {
        const weight = i + 1;
        wSum = wSum.plus(buf.half[i].times(weight));
        wWeight += weight;
      }
      wmaHalf = wSum.div(new Decimal(wWeight));
    }

    // WMA of full-length
    let wmaFull = new Decimal(0);
    if (buf.full.length >= len) {
      let wSum = new Decimal(0);
      let wWeight = 0;
      for (let i = 0; i < buf.full.length; i++) {
        const weight = i + 1;
        wSum = wSum.plus(buf.full[i].times(weight));
        wWeight += weight;
      }
      wmaFull = wSum.div(new Decimal(wWeight));
    }

    if (buf.half.length < halfLen || buf.full.length < len) {
      return NA;
    }

    buf.diff.push(wmaHalf.times(2).minus(wmaFull));
    if (buf.diff.length > sqrtLen) buf.diff.shift();

    // WMA of diff with sqrtLen
    if (buf.diff.length < sqrtLen) {
      return NA;
    }
    let dSum = new Decimal(0);
    let dWeight = 0;
    for (let i = 0; i < buf.diff.length; i++) {
      const weight = i + 1;
      dSum = dSum.plus(buf.diff[i].times(weight));
      dWeight += weight;
    }
    return decimalToPineValue(dSum.div(new Decimal(dWeight)));
  });

  // Wilder's Relative Moving Average — the smoothing used by ATR/RSI. Seed is the
  // incremental SMA over the first `len` bars (NA until warm), then
  // rma = (rma[1] * (len - 1) + src) / len. State layout mirrors atrState since
  // ta.atr IS rma of the true range — one algorithm, two call-site key namespaces.
  // Decimal state (R4 upgrade, M5b): prev stays Decimal through seed + warm so
  // the recursion is exact at DP=20; count stays INTEGER number math. Non-finite
  // inputs collapse to NA at the boundary guard, never reaching state.
  eng.builtins.set('ta.rma', (source: PineValue, length: PineValue): PineValue => {
    if (isNa(source) || isNa(length)) return NA;
    const len = Math.trunc(length as number);
    if (len <= 0) return NA;
    const rawVal = source as number;
    if (!isFiniteNumber(rawVal)) return NA;
    // Convert ONCE at the bar boundary — the guard above guarantees a finite
    // number, so pineValueToDecimal cannot produce the NaN marker here.
    const val = pineValueToDecimal(source);

    const key = `rma_${len}_${eng.currentCallSiteId}`;
    if (!eng.rmaState.has(key)) {
      // First bar seeds prev with the (already-converted) value; the incremental
      // SMA over the next bars keeps the seed exact at DP=20.
      eng.rmaState.set(key, { prev: val, count: 1 });
      return NA;
    }
    const state = eng.rmaState.get(key)!;
    state.count++;
    if (state.count <= len) {
      state.prev = state.prev
        .times(new Decimal(state.count - 1))
        .plus(val)
        .div(new Decimal(state.count));
      return NA;
    }
    state.prev = state.prev
      .times(new Decimal(len - 1))
      .plus(val)
      .div(new Decimal(len));
    return decimalToPineValue(state.prev);
  });
}
