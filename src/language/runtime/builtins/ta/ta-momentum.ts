import { Decimal } from 'decimal.js';
import { NA, isNa, type PineValue } from '../../../types/na.js';
import { isFiniteNumber } from '../../float-guards.js';
import { pineValueToDecimal, decimalToPineValue, DECIMAL_EPSILON } from '../../numbers/index.js';
import type { ExecutionEngine } from '../../execution-engine.js';

export function registerTaMomentum(engine: ExecutionEngine): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eng = engine as any;

  // Relative Strength Index — Decimal state (R4 upgrade, M6). The gain/loss
  // averages accumulate EXACTLY at DP=20 as Decimal (prevAvgGain/prevAvgLoss/
  // prevSource stay Decimal through the entire recursion — no Number round-trip
  // per bar), so ta.rsi no longer drifts the way the float Wilder average did.
  // Count/warm-up logic stays INTEGER number math; len stays integer via
  // Math.trunc. EPSILON BRANCH: the zero-loss guard moves from the float
  // isNearZero (1e-10) to DECIMAL_EPSILON (1e-12) — with exact decimal
  // accumulation the avg-loss-zero branch flips are LEGITIMATE exactness
  // changes, not bugs (backend-lead plan ruling, M6). Non-finite inputs
  // collapse to NA at the boundary guard, never reaching state.
  eng.builtins.set('ta.rsi', (source: PineValue, length: PineValue): PineValue => {
    if (isNa(source) || isNa(length)) return NA;
    const len = Math.trunc(length as number);
    if (len <= 0) return NA;
    const rawVal = source as number;
    if (!isFiniteNumber(rawVal)) return NA;
    // Convert ONCE at the bar boundary — the guard above guarantees a finite
    // number, so pineValueToDecimal cannot produce the NaN marker here.
    const val = pineValueToDecimal(source);

    const key = `rsi_${len}_${eng.currentCallSiteId}`;
    if (!eng.rsiState.has(key)) {
      // First bar seeds prevSource with the (already-converted) value so the
      // first change is exact at DP=20; averages start at zero (Pine warm-up:
      // NA until count reaches len).
      eng.rsiState.set(key, {
        prevAvgGain: new Decimal(0),
        prevAvgLoss: new Decimal(0),
        count: 0,
        prevSource: val,
      });
      return NA;
    }
    const state = eng.rsiState.get(key)!;
    state.count++;

    const change = val.minus(state.prevSource);
    const gain = change.gt(0) ? change : new Decimal(0);
    const loss = change.lt(0) ? change.neg() : new Decimal(0);
    state.prevSource = val;

    if (state.count <= len) {
      // Incremental SMA over the first `len` bars (Pine warm-up semantics) —
      // exact at DP=20.
      state.prevAvgGain = state.prevAvgGain
        .times(new Decimal(state.count - 1))
        .plus(gain)
        .div(new Decimal(state.count));
      state.prevAvgLoss = state.prevAvgLoss
        .times(new Decimal(state.count - 1))
        .plus(loss)
        .div(new Decimal(state.count));
      if (state.count < len) return NA;
    } else {
      // Wilder smoothing after warm-up: avg = (avg*(len-1) + value) / len.
      state.prevAvgGain = state.prevAvgGain
        .times(new Decimal(len - 1))
        .plus(gain)
        .div(new Decimal(len));
      state.prevAvgLoss = state.prevAvgLoss
        .times(new Decimal(len - 1))
        .plus(loss)
        .div(new Decimal(len));
    }

    // R5: guard the zero-loss branch BEFORE dividing — an avg-loss of exactly
    // zero (or ≤ DECIMAL_EPSILON) must never reach div (would yield
    // ±Infinity/NaN and leak past the boundary). Both-zero → 50 (flat series);
    // only-loss-zero → 100 (one-sided movement). Keeps Pine semantics.
    if (state.prevAvgLoss.lte(DECIMAL_EPSILON)) {
      return state.prevAvgGain.lte(DECIMAL_EPSILON) ? 50 : 100;
    }
    const rs = state.prevAvgGain.div(state.prevAvgLoss);
    // 100 - 100/(1+rs) — exact decimal; decimalToPineValue double-guards the
    // exit against any residual non-finite result (R4/R5).
    return decimalToPineValue(
      new Decimal(100).minus(new Decimal(100).div(new Decimal(1).plus(rs))),
    );
  });

  // Cross detection — Decimal state (R4 upgrade, M6). Prev src/cmp are stored
  // as Decimal and diffs computed with Decimal minus, so crossover/crossunder/
  // cross compare EXACT bar-to-bar differences at DP=20 instead of carrying
  // IEEE 754 error. CROSS_EPSILON (1e-10) stays the DOCUMENTED cross-detection
  // tolerance — a comparison threshold, NOT an accumulation tolerance, so its
  // meaning is unchanged by the decimal migration. NA/isNa guards unchanged:
  // an NA input never touches state.
  const CROSS_EPSILON = new Decimal('1e-10');

  eng.builtins.set('ta.crossover', (source: PineValue, compare: PineValue): PineValue => {
    if (isNa(source) || isNa(compare)) return false;
    // Convert ONCE at the bar boundary — NA already guarded above (M5 pattern).
    const src = pineValueToDecimal(source);
    const cmp = pineValueToDecimal(compare);
    const key = `cross_${eng.currentCallSiteId}`;
    const prev = eng.crossPrevValues.get(key);
    if (!prev) {
      eng.crossPrevValues.set(key, { src, cmp });
      return false;
    }
    const prevDiff = prev.src.minus(prev.cmp);
    const currDiff = src.minus(cmp);
    const result = prevDiff.lt(CROSS_EPSILON) && currDiff.gt(CROSS_EPSILON);
    prev.src = src;
    prev.cmp = cmp;
    return result;
  });

  eng.builtins.set('ta.crossunder', (source: PineValue, compare: PineValue): PineValue => {
    if (isNa(source) || isNa(compare)) return false;
    const src = pineValueToDecimal(source);
    const cmp = pineValueToDecimal(compare);
    const key = `cross_${eng.currentCallSiteId}`;
    const prev = eng.crossPrevValues.get(key);
    if (!prev) {
      eng.crossPrevValues.set(key, { src, cmp });
      return false;
    }
    const prevDiff = prev.src.minus(prev.cmp);
    const currDiff = src.minus(cmp);
    const result = prevDiff.gt(CROSS_EPSILON.neg()) && currDiff.lt(CROSS_EPSILON.neg());
    prev.src = src;
    prev.cmp = cmp;
    return result;
  });

  eng.builtins.set('ta.cross', (source: PineValue, compare: PineValue): PineValue => {
    if (isNa(source) || isNa(compare)) return false;
    const src = pineValueToDecimal(source);
    const cmp = pineValueToDecimal(compare);
    const key = `cross_${eng.currentCallSiteId}`;
    const prev = eng.crossPrevValues.get(key);
    if (!prev) {
      eng.crossPrevValues.set(key, { src, cmp });
      return false;
    }
    const prevDiff = prev.src.minus(prev.cmp);
    const currDiff = src.minus(cmp);
    const crossed =
      (prevDiff.lt(CROSS_EPSILON) && currDiff.gt(CROSS_EPSILON)) ||
      (prevDiff.gt(CROSS_EPSILON.neg()) && currDiff.lt(CROSS_EPSILON.neg()));
    prev.src = src;
    prev.cmp = cmp;
    return crossed;
  });

  // ta.change — Decimal state (R4 upgrade, M6). The previous source is stored
  // as Decimal and the diff computed with Decimal minus, so ta.change returns
  // the EXACT bar-to-bar difference at DP=20. NA guard unchanged; a NaN/Inf
  // source (a number, not the NA symbol) becomes a NaN Decimal whose diff
  // decimalToPineValue collapses to NA — the R4 upgrade vs the old float path,
  // which leaked raw NaN into PineValue space. Deliberate; do not restore.
  eng.builtins.set('ta.change', (source: PineValue): PineValue => {
    if (isNa(source)) return NA;
    const src = pineValueToDecimal(source);
    const key = `change_${eng.currentCallSiteId}`;
    const prev = eng.changePrevValues.get(key);
    if (prev === undefined) {
      eng.changePrevValues.set(key, src);
      return NA;
    }
    const result = src.minus(prev);
    eng.changePrevValues.set(key, src);
    return decimalToPineValue(result);
  });
}
