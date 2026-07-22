import { NA, isNa, type PineValue } from '../../../types/na.js';
import { guardFinite, isNearZero } from '../../float-guards.js';
import type { ExecutionEngine } from '../../execution-engine.js';

export function registerTaMomentum(engine: ExecutionEngine): void {
  const eng = engine as any;

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

    if (isNearZero(state.prevAvgLoss)) return isNearZero(state.prevAvgGain) ? 50 : 100;
    const rs = state.prevAvgGain / state.prevAvgLoss;
    return guardFinite(100 - 100 / (1 + rs));
  });

  // Small epsilon for cross detection
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
}
