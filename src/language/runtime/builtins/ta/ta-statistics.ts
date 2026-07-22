import { NA, isNa, type PineValue } from '../../../types/na.js';
import type { ExecutionEngine } from '../../execution-engine.js';

export function registerTaStatistics(engine: ExecutionEngine): void {
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
    const highArr = eng.ohlcHistory.high;
    const len = highArr.length;
    if (len < leftBars + rightBars + 1) return NA;
    const candidateIdx = len - 1 - rightBars;
    const candidateValue = highArr[candidateIdx];
    if (typeof candidateValue !== 'number' || isNaN(candidateValue)) return NA;
    for (let d = -leftBars; d < 0; d++) {
      const idx = candidateIdx + d;
      const v = highArr[idx];
      if (typeof v === 'number' && !isNaN(v) && v > candidateValue) return NA;
    }
    for (let d = 1; d <= rightBars; d++) {
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
    const lowArr = eng.ohlcHistory.low;
    const len = lowArr.length;
    if (len < leftBars + rightBars + 1) return NA;
    const candidateIdx = len - 1 - rightBars;
    const candidateValue = lowArr[candidateIdx];
    if (typeof candidateValue !== 'number' || isNaN(candidateValue)) return NA;
    for (let d = -leftBars; d < 0; d++) {
      const idx = candidateIdx + d;
      const v = lowArr[idx];
      if (typeof v === 'number' && !isNaN(v) && v < candidateValue) return NA;
    }
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
    if (condition && condition !== 0 && condition !== false) {
      if (typeof source === 'number') {
        history.push(source);
      } else {
        history.push(NA as any);
      }
    }
    const idx = history.length - 1 - occ;
    if (idx >= 0 && idx < history.length) {
      return history[idx]!;
    }
    return NA;
  });
}
