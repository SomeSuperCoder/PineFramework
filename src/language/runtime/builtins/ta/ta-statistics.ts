import { NA, isNa, type PineValue } from '../../../types/na.js';
import type { ExecutionEngine } from '../../execution-engine.js';

export function registerTaStatistics(engine: ExecutionEngine): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eng = engine as any;

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

  /**
   * ta.pivothigh(leftBars, rightBars) → series float
   *
   * Detects a pivot high bar whose high is strictly greater than the high
   * of all bars in the window [barIndex - leftBars - rightBars, barIndex - rightBars + rightBars],
   * excluding the candidate bar itself.
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
    for (let d = -lb; d < 0; d++) {
      const idx = candidateIdx + d;
      const v = highArr[idx];
      if (typeof v === 'number' && !isNaN(v) && v > candidateValue) return NA;
    }
    for (let d = 1; d <= rb; d++) {
      const idx = candidateIdx + d;
      const v = highArr[idx];
      if (typeof v === 'number' && !isNaN(v) && v >= candidateValue) return NA;
    }
    return candidateValue;
  });

  /**
   * ta.pivotlow(leftBars, rightBars) → series float
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
    for (let d = -lb; d < 0; d++) {
      const idx = candidateIdx + d;
      const v = lowArr[idx];
      if (typeof v === 'number' && !isNaN(v) && v < candidateValue) return NA;
    }
    for (let d = 1; d <= rb; d++) {
      const idx = candidateIdx + d;
      const v = lowArr[idx];
      if (typeof v === 'number' && !isNaN(v) && v <= candidateValue) return NA;
    }
    return candidateValue;
  });

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
      const history: number[] = eng.valuewhenHistory.get(key)!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (condition && condition !== 0 && (condition as any) !== false) {
        if (typeof source === 'number') {
          history.push(source);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          history.push(NA as any);
        }
        // Track lookback: need enough history to find the Nth occurrence
        // The occurrence index is 0-based, so we need at least occ+1 entries
        const needed = occ + 1;
        if (needed > eng.valuewhenLookback) eng.valuewhenLookback = needed;
      }
      const idx = history.length - 1 - occ;
      if (idx >= 0 && idx < history.length) {
        return history[idx]!;
      }
      return NA;
    },
  );
}
