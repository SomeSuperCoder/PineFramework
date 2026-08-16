import type { Decimal } from 'decimal.js';
import { NA, isNa, type PineValue } from '../../../types/na.js';
import { isFiniteNumber } from '../../float-guards.js';
import { pineValueToDecimal, decimalToPineValue } from '../../numbers/index.js';
import type { ExecutionEngine } from '../../execution-engine.js';

export function registerTaStatistics(engine: ExecutionEngine): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eng = engine as any;

  // ─── ta.highest ──────────────────────────────────────────────────────────
  // M8: Exact Decimal comparison — max scan uses Decimal.gt() at DP=20 so
  // ta.highest of a known Decimal series returns the exact max (fp-final-gate).
  // Buffer holds Decimal[]; non-finite sources collapse to NA at the boundary
  // guard (isFiniteNumber), preventing Infinity/NaN from entering the buffer.
  eng.builtins.set('ta.highest', (source: PineValue, length: PineValue): PineValue => {
    if (isNa(source) || isNa(length)) return NA;
    const len = Math.trunc(length as number);
    if (len <= 0) return NA;
    // R4: reject Infinity/NaN before Decimal conversion — they must not enter
    // the buffer (ta.ema pattern). PineValue truthiness is NOT sufficient here:
    // Infinity is truthy but must not be compared as a valid high.
    const rawVal = source as number;
    if (!isFiniteNumber(rawVal)) return NA;
    const key = `highest_${len}_${eng.currentCallSiteId}`;
    if (!eng.highestBuffers.has(key)) {
      eng.highestBuffers.set(key, []);
    }
    const buf = eng.highestBuffers.get(key)!;
    buf.push(pineValueToDecimal(source));
    if (buf.length > len) buf.shift();
    if (buf.length < len) return NA;
    // Exact max scan — Decimal.gt() is exact at DP=20 (no IEEE 754 drift).
    let max = buf[0];
    for (let i = 1; i < buf.length; i++) {
      if (buf[i].gt(max)) max = buf[i];
    }
    return decimalToPineValue(max);
  });

  // ─── ta.lowest ───────────────────────────────────────────────────────────
  // M8: Exact Decimal comparison — min scan uses Decimal.lt() at DP=20 so
  // ta.lowest of a known Decimal series returns the exact min (fp-final-gate).
  // Same R4 guard and buffer pattern as ta.highest (symmetry).
  eng.builtins.set('ta.lowest', (source: PineValue, length: PineValue): PineValue => {
    if (isNa(source) || isNa(length)) return NA;
    const len = Math.trunc(length as number);
    if (len <= 0) return NA;
    const rawVal = source as number;
    if (!isFiniteNumber(rawVal)) return NA;
    const key = `lowest_${len}_${eng.currentCallSiteId}`;
    if (!eng.lowestBuffers.has(key)) {
      eng.lowestBuffers.set(key, []);
    }
    const buf = eng.lowestBuffers.get(key)!;
    buf.push(pineValueToDecimal(source));
    if (buf.length > len) buf.shift();
    if (buf.length < len) return NA;
    // Exact min scan — Decimal.lt() is exact at DP=20 (no IEEE 754 drift).
    let min = buf[0];
    for (let i = 1; i < buf.length; i++) {
      if (buf[i].lt(min)) min = buf[i];
    }
    return decimalToPineValue(min);
  });

  // ─── ta.pivothigh ────────────────────────────────────────────────────────
  // M8: Pivot detection reads engine OHLC history (number[]) — the storage
  // stays as-is (not migrated; OHLC Decimal-ification is a separate concern).
  // The ONLY change: candidate and comparison values are converted to Decimal
  // for the comparison, so pivot detection is exact at DP=20 (fp-final-gate).
  // Return stays as the raw number from ohlcHistory (matching storage type).
  eng.builtins.set('ta.pivothigh', (...args: PineValue[]): PineValue => {
    if (!eng.currentContext) return NA;
    const last = args[args.length - 1];
    const hasNamed = typeof last === 'object' && last !== null && !Array.isArray(last);
    const positionalCount = hasNamed ? args.length - 1 : args.length;
    if (positionalCount < 2) return NA;
    const leftBars = args[0] as number;
    const rightBars = args[1] as number;
    if (leftBars < 1 || rightBars < 1) return NA;
    const lb = Math.trunc(leftBars);
    const rb = Math.trunc(rightBars);
    if (lb > 0 && rb > 0) {
      const needed = lb + rb + 1;
      if (needed > eng.pivotLookback) eng.pivotLookback = needed;
    }
    const highArr = eng.ohlcHistory.high;
    const len = highArr.length;
    // Emission gate (real Pine confirmation semantics): at the current bar the
    // newest candidate whose right window has just closed is p = len-1-rbBars.
    // A pivot at p is only KNOWN once the full window [p - leftBars, p + rightBars]
    // is fully inside executed history. That window spans leftBars+1+rightBars
    // bars (the pivot bar itself is the +1), so the FIRST leftBars+rightBars+1
    // output values are null — ta.pivothigh(5,5) yields 11 nulls, then values
    // (see execution-engine.test.ts 'Runtime lookback filtering').
    if (len < lb + rb + 2) return NA;
    const candidateIdx = len - 1 - rb;
    const candidateValue = highArr[candidateIdx];
    if (typeof candidateValue !== 'number' || isNaN(candidateValue)) return NA;
    // Exact comparison: convert both candidate and comparison values to Decimal
    // so the pivot check is exact at DP=20 (no IEEE 754 rounding error).
    const candidateDec = pineValueToDecimal(candidateValue);
    for (let d = -lb; d < 0; d++) {
      const idx = candidateIdx + d;
      const v = highArr[idx];
      if (typeof v === 'number' && !isNaN(v) && pineValueToDecimal(v).gt(candidateDec)) return NA;
    }
    for (let d = 1; d <= rb; d++) {
      const idx = candidateIdx + d;
      const v = highArr[idx];
      if (typeof v === 'number' && !isNaN(v) && pineValueToDecimal(v).gte(candidateDec)) return NA;
    }
    return candidateValue;
  });

  // ─── ta.pivotlow ─────────────────────────────────────────────────────────
  // M8: Mirror of ta.pivothigh over ohlcHistory.low. Same justified exception:
  // OHLC storage stays number[], comparisons are Decimal-exact.
  eng.builtins.set('ta.pivotlow', (...args: PineValue[]): PineValue => {
    if (!eng.currentContext) return NA;
    const last = args[args.length - 1];
    const hasNamed = typeof last === 'object' && last !== null && !Array.isArray(last);
    const positionalCount = hasNamed ? args.length - 1 : args.length;
    if (positionalCount < 2) return NA;
    const leftBars = args[0] as number;
    const rightBars = args[1] as number;
    if (leftBars < 1 || rightBars < 1) return NA;
    const lb = Math.trunc(leftBars);
    const rb = Math.trunc(rightBars);
    if (lb > 0 && rb > 0) {
      const needed = lb + rb + 1;
      if (needed > eng.pivotLookback) eng.pivotLookback = needed;
    }
    const lowArr = eng.ohlcHistory.low;
    const len = lowArr.length;
    // Emission gate (real Pine confirmation semantics) — see ta.pivothigh above.
    // A pivot at p is only KNOWN once the full window [p-lb, p+rb] is fully
    // inside executed history (window spans lb+1+rb bars; the pivot bar is the
    // +1). The first lb+rb+1 output values are null.
    if (len < lb + rb + 2) return NA;
    const candidateIdx = len - 1 - rb;
    const candidateValue = lowArr[candidateIdx];
    if (typeof candidateValue !== 'number' || isNaN(candidateValue)) return NA;
    // Exact comparison: convert both candidate and comparison values to Decimal.
    const candidateDec = pineValueToDecimal(candidateValue);
    for (let d = -lb; d < 0; d++) {
      const idx = candidateIdx + d;
      const v = lowArr[idx];
      if (typeof v === 'number' && !isNaN(v) && pineValueToDecimal(v).lt(candidateDec)) return NA;
    }
    for (let d = 1; d <= rb; d++) {
      const idx = candidateIdx + d;
      const v = lowArr[idx];
      if (typeof v === 'number' && !isNaN(v) && pineValueToDecimal(v).lte(candidateDec)) return NA;
    }
    return candidateValue;
  });

  // ─── ta.valuewhen ────────────────────────────────────────────────────────
  // M8: Exact Decimal storage — when condition is truthy, source is converted
  // to Decimal and stored. Retrieval converts back via decimalToPineValue,
  // which maps NaN/±Inf Decimal to NA (R4). Condition truthiness stays as-is
  // (PineValue truthiness check — not numeric).
  eng.builtins.set(
    'ta.valuewhen',
    (condition: PineValue, source: PineValue, occurrence: PineValue): PineValue => {
      const occ = typeof occurrence === 'number' ? Math.trunc(occurrence) : 0;
      if (occ < 0) return NA;
      const key = `valuewhen_${eng.currentCallSiteId}`;
      if (!eng.valuewhenHistory) {
        eng.valuewhenHistory = new Map();
      }
      if (!eng.valuewhenHistory.has(key)) {
        eng.valuewhenHistory.set(key, []);
      }
      const history: Decimal[] = eng.valuewhenHistory.get(key)!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (condition && condition !== 0 && (condition as any) !== false) {
        // Convert source to Decimal at the boundary. Non-numeric sources (string,
        // boolean, etc.) throw at the boundary — matching ta.ema/ta.sma pattern.
        // NaN Decimal (from NA source) is stored as the internal invalid marker;
        // decimalToPineValue collapses it back to NA on retrieval (R4).
        history.push(pineValueToDecimal(source));
        // Track lookback: need enough history to find the Nth occurrence
        // The occurrence index is 0-based, so we need at least occ+1 entries
        const needed = occ + 1;
        if (needed > eng.valuewhenLookback) eng.valuewhenLookback = needed;
      }
      const idx = history.length - 1 - occ;
      if (idx >= 0 && idx < history.length) {
        return decimalToPineValue(history[idx]!);
      }
      return NA;
    },
  );
}
