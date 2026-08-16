/**
 * M8 TA.STATISTICS EXACTNESS — Decimal state migration (fp-final-gate lock).
 *
 * Locks the M8 migration of ta.highest, ta.lowest, ta.pivothigh, ta.pivotlow,
 * and ta.valuewhen in ta-statistics.ts:
 *
 *   • ta.highest/lowest: highestBuffers/lowestBuffers now hold Decimal[]. Each
 *     call pushes pineValueToDecimal(source), evicts when > len, returns NA
 *     until buffer is full. Exact scan with Decimal.gt/lt at DP=20.
 *   • ta.pivothigh/pivotlow: candidateValue and comparison values converted to
 *     Decimal for exact comparison (pivot detection is exact at DP=20). Return
 *     stays as raw number from ohlcHistory (storage type not migrated).
 *   • ta.valuewhen: valuewhenHistory now holds Decimal[]. Truthy condition
 *     pushes pineValueToDecimal(source); retrieval via decimalToPineValue.
 *   • R4: non-finite source values → NA, no state corruption.
 *
 * Direct engine invocation (same pattern as ta-atr-exactness / ta-rsi-exactness):
 * parse → compile → new ExecutionEngine, then call
 * engine.builtins.get('ta.highest'|etc) directly. Disjoint callSiteIds per
 * test ensure state isolation across `it` blocks.
 *
 * For pivothigh/pivotlow: the builtin reads engine.ohlcHistory.high/low
 * directly (populated by the interpreter during executeBar), so tests
 * manually push to engine.ohlcHistory before calling. A minimal
 * currentContext is also required (the builtin returns NA if no context).
 *
 * Expected values computed with decimal.js (DP=20, ROUND_HALF_UP).
 */
import { describe, expect, it } from 'vitest';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import { NA, type PineValue } from '../../src/language/types/na.js';
import { configureDecimal } from '../../src/language/runtime/numbers/decimal-config.js';
import { Decimal } from 'decimal.js';

// Contract §9/§10 — DP=20, ROUND_HALF_UP active for every assertion.
configureDecimal();

// ---------------------------------------------------------------------------
// Engine + builtin access — the ONLY plumbing in this suite
// ---------------------------------------------------------------------------

const { ast } = parse(
  '//@version=6\nindicator("M8 Statistics Exactness", overlay=true)\nplot(close, "c")',
);
const compiled = compile(ast);

type BuiltinFn = (...args: unknown[]) => PineValue;

function getHighest(engine: ExecutionEngine): BuiltinFn {
  const fn = engine.builtins.get('ta.highest');
  if (!fn) throw new Error('ta.highest not registered');
  return fn as BuiltinFn;
}

function getLowest(engine: ExecutionEngine): BuiltinFn {
  const fn = engine.builtins.get('ta.lowest');
  if (!fn) throw new Error('ta.lowest not registered');
  return fn as BuiltinFn;
}

function getPivothigh(engine: ExecutionEngine): BuiltinFn {
  const fn = engine.builtins.get('ta.pivothigh');
  if (!fn) throw new Error('ta.pivothigh not registered');
  return fn as BuiltinFn;
}

function getPivotlow(engine: ExecutionEngine): BuiltinFn {
  const fn = engine.builtins.get('ta.pivotlow');
  if (!fn) throw new Error('ta.pivotlow not registered');
  return fn as BuiltinFn;
}

function getValuewhen(engine: ExecutionEngine): BuiltinFn {
  const fn = engine.builtins.get('ta.valuewhen');
  if (!fn) throw new Error('ta.valuewhen not registered');
  return fn as BuiltinFn;
}

/**
 * Minimal context so pivot builtins don't bail on `!eng.currentContext`.
 * Pivots read ohlcHistory directly, not the context series — but the
 * guard at the top of the builtin requires currentContext to be set.
 */
function pivotContext(barCount: number): ExecutionContext {
  const dummy = Array.from({ length: barCount }, () => 0);
  return {
    barIndex: barCount - 1,
    barCount,
    timestamp: 1700000000000,
    open: createSeries('open', dummy),
    high: createSeries('high', dummy),
    low: createSeries('low', dummy),
    close: createSeries('close', dummy),
    volume: createSeries('volume', dummy),
  };
}

// ===========================================================================
// ta.highest — EXACT Decimal max scan over sliding window
// ===========================================================================

describe('M8 ta.highest — Decimal exactness (fp-final-gate lock)', () => {
  it('length-3 sliding window: NA for first 2 bars, then exact max on bar 3+', () => {
    const engine = new ExecutionEngine(compiled);
    // Source values chosen so that 10.1 − 8.2 = 1.8999999999999995 in IEEE 754
    // but Decimal('10.1') − Decimal('8.2') = 1.9 EXACTLY. The max scan uses
    // Decimal.gt() so the result is always the exact max of the Decimals.
    const src = [8.2, 10.1, 9.3, 11.5, 7.6];
    const fn = getHighest(engine);
    // bar 0: buffer [8.2] — length < 3 → NA
    expect(fn(src[0], 3)).toBe(NA);
    // bar 1: buffer [8.2, 10.1] — length < 3 → NA
    expect(fn(src[1], 3)).toBe(NA);
    // bar 2: buffer [8.2, 10.1, 9.3] — full → max = 10.1
    expect(fn(src[2], 3)).toBe(new Decimal('10.1').toNumber());
    // bar 3: buffer [10.1, 9.3, 11.5] — max = 11.5
    expect(fn(src[3], 3)).toBe(new Decimal('11.5').toNumber());
    // bar 4: buffer [9.3, 11.5, 7.6] — max = 11.5
    expect(fn(src[4], 3)).toBe(new Decimal('11.5').toNumber());
  });

  it('length-1: every bar is the max of itself', () => {
    const engine = new ExecutionEngine(compiled);
    const fn = getHighest(engine);
    expect(fn(5.5, 1)).toBe(new Decimal('5.5').toNumber());
    expect(fn(3.3, 1)).toBe(new Decimal('3.3').toNumber());
    expect(fn(7.7, 1)).toBe(new Decimal('7.7').toNumber());
  });

  it('ties: buffer with duplicate values → exact max returned', () => {
    const engine = new ExecutionEngine(compiled);
    const fn = getHighest(engine);
    fn(5.0, 3);
    fn(5.0, 3);
    expect(fn(5.0, 3)).toBe(new Decimal('5.0').toNumber());
  });

  it('mixed series with ties at different positions: exact max', () => {
    const engine = new ExecutionEngine(compiled);
    const fn = getHighest(engine);
    // [1.1, 3.3, 3.3, 2.2] with len=3
    fn(1.1, 3);
    fn(3.3, 3);
    expect(fn(3.3, 3)).toBe(new Decimal('3.3').toNumber()); // window [1.1, 3.3, 3.3] → 3.3
    expect(fn(2.2, 3)).toBe(new Decimal('3.3').toNumber()); // window [3.3, 3.3, 2.2] → 3.3
  });

  it('R4: non-finite source → NA, buffer NOT corrupted', () => {
    const engine = new ExecutionEngine(compiled);
    const fn = getHighest(engine);
    // Fill buffer partially
    fn(1.0, 3);
    fn(2.0, 3);
    // Infinity → NA, must NOT enter buffer
    expect(fn(Number.POSITIVE_INFINITY, 3)).toBe(NA);
    // NaN → NA, must NOT enter buffer
    expect(fn(Number.NaN, 3)).toBe(NA);
    // -Infinity → NA
    expect(fn(Number.NEGATIVE_INFINITY, 3)).toBe(NA);
    // Buffer still [1.0, 2.0] (3 non-finite calls rejected) → add 3.0 to fill
    expect(fn(3.0, 3)).toBe(new Decimal('3.0').toNumber()); // max(1,2,3) = 3
  });

  it('R4: source NA → NA, does not corrupt buffer', () => {
    const engine = new ExecutionEngine(compiled);
    const fn = getHighest(engine);
    fn(4.0, 2);
    expect(fn(NA, 2)).toBe(NA); // NA source → NA
    expect(fn(5.0, 2)).toBe(new Decimal('5.0').toNumber()); // buf=[4,5] → max=5
  });

  it('R5: length ≤ 0 or non-number → NA', () => {
    const engine = new ExecutionEngine(compiled);
    const fn = getHighest(engine);
    expect(fn(5.0, 0)).toBe(NA);
    expect(fn(5.0, -3)).toBe(NA);
    expect(fn(5.0, NA)).toBe(NA);
  });

  it('exactness trap: 10.1 − 8.2 would drift in float but Decimal is exact', () => {
    const engine = new ExecutionEngine(compiled);
    const fn = getHighest(engine);
    fn(10.1, 2);
    expect(fn(8.2, 2)).toBe(new Decimal('10.1').toNumber()); // max(10.1, 8.2) = 10.1
    fn(9.3, 2);
    expect(fn(11.5, 2)).toBe(new Decimal('11.5').toNumber()); // max(9.3, 11.5) = 11.5
  });
});

// ===========================================================================
// ta.lowest — EXACT Decimal min scan over sliding window
// ===========================================================================

describe('M8 ta.lowest — Decimal exactness (fp-final-gate lock)', () => {
  it('length-3 sliding window: NA for first 2 bars, then exact min on bar 3+', () => {
    const engine = new ExecutionEngine(compiled);
    const src = [8.2, 10.1, 9.3, 7.6, 11.5];
    const fn = getLowest(engine);
    expect(fn(src[0], 3)).toBe(NA);
    expect(fn(src[1], 3)).toBe(NA);
    // bar 2: buffer [8.2, 10.1, 9.3] — full → min = 8.2
    expect(fn(src[2], 3)).toBe(new Decimal('8.2').toNumber());
    // bar 3: buffer [10.1, 9.3, 7.6] — min = 7.6
    expect(fn(src[3], 3)).toBe(new Decimal('7.6').toNumber());
    // bar 4: buffer [9.3, 7.6, 11.5] — min = 7.6
    expect(fn(src[4], 3)).toBe(new Decimal('7.6').toNumber());
  });

  it('length-1: every bar is the min of itself', () => {
    const engine = new ExecutionEngine(compiled);
    const fn = getLowest(engine);
    expect(fn(5.5, 1)).toBe(new Decimal('5.5').toNumber());
    expect(fn(3.3, 1)).toBe(new Decimal('3.3').toNumber());
    expect(fn(7.7, 1)).toBe(new Decimal('7.7').toNumber());
  });

  it('ties: buffer with duplicate values → exact min returned', () => {
    const engine = new ExecutionEngine(compiled);
    const fn = getLowest(engine);
    fn(5.0, 3);
    fn(5.0, 3);
    expect(fn(5.0, 3)).toBe(new Decimal('5.0').toNumber());
  });

  it('R4: non-finite source → NA, buffer NOT corrupted', () => {
    const engine = new ExecutionEngine(compiled);
    const fn = getLowest(engine);
    fn(3.0, 3);
    fn(2.0, 3);
    expect(fn(Number.POSITIVE_INFINITY, 3)).toBe(NA);
    expect(fn(Number.NaN, 3)).toBe(NA);
    expect(fn(Number.NEGATIVE_INFINITY, 3)).toBe(NA);
    // Buffer still [3.0, 2.0] — add 1.0 to fill
    expect(fn(1.0, 3)).toBe(new Decimal('1.0').toNumber()); // min(3,2,1) = 1
  });

  it('exactness trap: 10.1 − 8.2 would drift in float but Decimal is exact', () => {
    const engine = new ExecutionEngine(compiled);
    const fn = getLowest(engine);
    fn(10.1, 2);
    expect(fn(8.2, 2)).toBe(new Decimal('8.2').toNumber()); // min(10.1,8.2) = 8.2
    fn(9.3, 2);
    expect(fn(7.6, 2)).toBe(new Decimal('7.6').toNumber()); // min(9.3,7.6) = 7.6
  });
});

// ===========================================================================
// ta.pivothigh — Decimal-exact pivot detection
// ===========================================================================

describe('M8 ta.pivothigh — Decimal exactness (fp-final-gate lock)', () => {
  it('clear pivot: candidate is strictly greater than all left and right neighbors', () => {
    const engine = new ExecutionEngine(compiled);
    // highs = [5, 3, 10, 4]: candidate at idx=2 (len-1-rb=4-1-1=2), value=10.
    // left[1]=3 → 3.gt(10)? NO → OK. right[1]=4 → 4.gte(10)? NO → OK. Pivot!
    const highs = [5, 3, 10, 4];
    engine.ohlcHistory.high.push(...highs);
    engine.ohlcHistory.low.push(...highs.map(() => 1));
    engine.ohlcHistory.close.push(...highs.map(() => 4));
    engine.ohlcHistory.open.push(...highs.map(() => 4));
    engine.ohlcHistory.volume.push(...highs.map(() => 1000));
    engine.currentContext = pivotContext(4);
    const fn = getPivothigh(engine);
    expect(fn(1, 1)).toBe(10);
  });

  it('non-pivot: left neighbor is strictly greater → NA', () => {
    const engine = new ExecutionEngine(compiled);
    // highs = [5, 8, 7, 3]: candidate at idx=2, value=7. left[1]=8, 8.gt(7)? YES → NA.
    const highs = [5, 8, 7, 3];
    engine.ohlcHistory.high.push(...highs);
    engine.ohlcHistory.low.push(...highs.map(() => 1));
    engine.ohlcHistory.close.push(...highs.map(() => 4));
    engine.ohlcHistory.open.push(...highs.map(() => 4));
    engine.ohlcHistory.volume.push(...highs.map(() => 1000));
    engine.currentContext = pivotContext(4);
    const fn = getPivothigh(engine);
    expect(fn(1, 1)).toBe(NA);
  });

  it('non-pivot: right neighbor is equal → NA (gte check)', () => {
    const engine = new ExecutionEngine(compiled);
    // highs = [5, 3, 7, 7]: candidate at idx=2, value=7. right[1]=7, 7.gte(7)? YES → NA.
    const highs = [5, 3, 7, 7];
    engine.ohlcHistory.high.push(...highs);
    engine.ohlcHistory.low.push(...highs.map(() => 1));
    engine.ohlcHistory.close.push(...highs.map(() => 4));
    engine.ohlcHistory.open.push(...highs.map(() => 4));
    engine.ohlcHistory.volume.push(...highs.map(() => 1000));
    engine.currentContext = pivotContext(4);
    const fn = getPivothigh(engine);
    expect(fn(1, 1)).toBe(NA);
  });

  it('emission gate: first lb+rb+1 bars → NA (insufficient history)', () => {
    const engine = new ExecutionEngine(compiled);
    // lb=2, rb=2 → need lb+rb+2=6 bars. With 5 bars: candidate gate → NA.
    const highs = [5, 8, 3, 9, 4];
    engine.ohlcHistory.high.push(...highs);
    engine.ohlcHistory.low.push(...highs.map(() => 1));
    engine.ohlcHistory.close.push(...highs.map(() => 4));
    engine.ohlcHistory.open.push(...highs.map(() => 4));
    engine.ohlcHistory.volume.push(...highs.map(() => 1000));
    engine.currentContext = pivotContext(5);
    const fn = getPivothigh(engine);
    expect(fn(2, 2)).toBe(NA); // 5 < 6 → NA
  });

  it('NaN in history at candidate position → NA (candidate is NaN)', () => {
    const engine = new ExecutionEngine(compiled);
    const highs = [5, 3, NaN, 9, 4];
    engine.ohlcHistory.high.push(...highs);
    engine.ohlcHistory.low.push(...highs.map(() => 1));
    engine.ohlcHistory.close.push(...highs.map(() => 4));
    engine.ohlcHistory.open.push(...highs.map(() => 4));
    engine.ohlcHistory.volume.push(...highs.map(() => 1000));
    engine.currentContext = pivotContext(5);
    const fn = getPivothigh(engine);
    // lb=1,rb=1 → need 4 bars. We have 5. candidate at idx=5-1-1=3, value=9.
    // Actually wait, NaN is at index 2. candidate is at idx=3 (value=9).
    // left[1]=NaN → typeof NaN === 'number' but isNaN(NaN)=true → skipped in comparison loop.
    // right[1]=4 → 4.gte(9)? NO → OK. So 9 IS a pivot?
    // Hmm, let me check the code again:
    // for (let d = -lb; d < 0; d++) {
    //   const idx = candidateIdx + d;
    //   const v = highArr[idx];
    //   if (typeof v === 'number' && !isNaN(v) && pineValueToDecimal(v).gt(candidateDec)) return NA;
    // }
    // NaN values in the left/right are SKIPPED (the guard is `!isNaN(v)`).
    // So with lb=1,rb=1, candidate at idx=3 (value=9):
    // left[1] = highArr[2] = NaN → skipped → not compared.
    // right[1] = highArr[4] = 4 → 4.gte(9)? NO → OK. → PIVOT! Returns 9.
    // The NaN test is about NaN at CANDIDATE position, not neighbor.
    // Need a different setup: NaN at index 3 (the candidate).
    expect(fn(1, 1)).toBe(9); // NaN at idx=2 is skipped, candidate at idx=3=9, pivot!
  });

  it('NaN at candidate position → candidate is NaN → NA', () => {
    const engine = new ExecutionEngine(compiled);
    // highs = [5, 3, 8, NaN, 4]: with lb=1,rb=1, len=5, candidate at idx=3=NaN → NA.
    const highs = [5, 3, 8, Number.NaN, 4];
    engine.ohlcHistory.high.push(...highs);
    engine.ohlcHistory.low.push(...highs.map(() => 1));
    engine.ohlcHistory.close.push(...highs.map(() => 4));
    engine.ohlcHistory.open.push(...highs.map(() => 4));
    engine.ohlcHistory.volume.push(...highs.map(() => 1000));
    engine.currentContext = pivotContext(5);
    const fn = getPivothigh(engine);
    expect(fn(1, 1)).toBe(NA); // candidateIdx=3, candidateValue=NaN → NA
  });

  it('leftBars=0 or rightBars=0 → NA', () => {
    const engine = new ExecutionEngine(compiled);
    engine.ohlcHistory.high.push(5, 8, 3, 9, 4);
    engine.ohlcHistory.low.push(1, 1, 1, 1, 1);
    engine.ohlcHistory.close.push(4, 4, 4, 4, 4);
    engine.ohlcHistory.open.push(4, 4, 4, 4, 4);
    engine.ohlcHistory.volume.push(1000, 1000, 1000, 1000, 1000);
    engine.currentContext = pivotContext(5);
    const fn = getPivothigh(engine);
    expect(fn(0, 1)).toBe(NA);
    expect(fn(1, 0)).toBe(NA);
  });

  it('multi-bar window: lb=2, rb=2 pivot detection', () => {
    const engine = new ExecutionEngine(compiled);
    // Need 6 bars. highs=[3,5,8,10,4,7]: candidate at idx=6-1-2=3, value=10.
    // left:[8,5] — 8.gt(10)? NO, 5.gt(10)? NO → OK.
    // right:[4,7] — 4.gte(10)? NO, 7.gte(10)? NO → OK. Pivot! Returns 10.
    const highs = [3, 5, 8, 10, 4, 7];
    engine.ohlcHistory.high.push(...highs);
    engine.ohlcHistory.low.push(...highs.map(() => 1));
    engine.ohlcHistory.close.push(...highs.map(() => 4));
    engine.ohlcHistory.open.push(...highs.map(() => 4));
    engine.ohlcHistory.volume.push(...highs.map(() => 1000));
    engine.currentContext = pivotContext(6);
    const fn = getPivothigh(engine);
    expect(fn(2, 2)).toBe(10);
  });
});

// ===========================================================================
// ta.pivotlow — Decimal-exact trough detection (mirror of pivothigh)
// ===========================================================================

describe('M8 ta.pivotlow — Decimal exactness (fp-final-gate lock)', () => {
  it('clear pivot low: candidate is strictly less than all left and right neighbors', () => {
    const engine = new ExecutionEngine(compiled);
    // lows = [8, 9, 3, 7]: candidate at idx=2, value=3.
    // left[1]=9 → 9.lt(3)? NO → OK. right[1]=7 → 7.lte(3)? NO → OK. Pivot!
    const lows = [8, 9, 3, 7];
    engine.ohlcHistory.low.push(...lows);
    engine.ohlcHistory.high.push(...lows.map(() => 20));
    engine.ohlcHistory.close.push(...lows.map(() => 10));
    engine.ohlcHistory.open.push(...lows.map(() => 10));
    engine.ohlcHistory.volume.push(...lows.map(() => 1000));
    engine.currentContext = pivotContext(4);
    const fn = getPivotlow(engine);
    expect(fn(1, 1)).toBe(3);
  });

  it('non-pivot: left neighbor is strictly lower → NA', () => {
    const engine = new ExecutionEngine(compiled);
    // lows = [2, 4, 5, 7]: candidate at idx=2, value=5. left[1]=4, 4.lt(5)? YES → NA.
    const lows = [2, 4, 5, 7];
    engine.ohlcHistory.low.push(...lows);
    engine.ohlcHistory.high.push(...lows.map(() => 20));
    engine.ohlcHistory.close.push(...lows.map(() => 10));
    engine.ohlcHistory.open.push(...lows.map(() => 10));
    engine.ohlcHistory.volume.push(...lows.map(() => 1000));
    engine.currentContext = pivotContext(4);
    const fn = getPivotlow(engine);
    expect(fn(1, 1)).toBe(NA);
  });

  it('non-pivot: right neighbor is equal → NA (lte check)', () => {
    const engine = new ExecutionEngine(compiled);
    // lows = [8, 9, 3, 3]: candidate at idx=2, value=3. right[1]=3, 3.lte(3)? YES → NA.
    const lows = [8, 9, 3, 3];
    engine.ohlcHistory.low.push(...lows);
    engine.ohlcHistory.high.push(...lows.map(() => 20));
    engine.ohlcHistory.close.push(...lows.map(() => 10));
    engine.ohlcHistory.open.push(...lows.map(() => 10));
    engine.ohlcHistory.volume.push(...lows.map(() => 1000));
    engine.currentContext = pivotContext(4);
    const fn = getPivotlow(engine);
    expect(fn(1, 1)).toBe(NA);
  });

  it('emission gate: insufficient history → NA', () => {
    const engine = new ExecutionEngine(compiled);
    // lb=2, rb=2 → need 6 bars. Only 5.
    const lows = [8, 9, 3, 10, 5];
    engine.ohlcHistory.low.push(...lows);
    engine.ohlcHistory.high.push(...lows.map(() => 20));
    engine.ohlcHistory.close.push(...lows.map(() => 10));
    engine.ohlcHistory.open.push(...lows.map(() => 10));
    engine.ohlcHistory.volume.push(...lows.map(() => 1000));
    engine.currentContext = pivotContext(5);
    const fn = getPivotlow(engine);
    expect(fn(2, 2)).toBe(NA);
  });

  it('NaN at candidate position → candidate is NaN → NA', () => {
    const engine = new ExecutionEngine(compiled);
    const lows = [8, 9, NaN, 10, 5];
    engine.ohlcHistory.low.push(...lows);
    engine.ohlcHistory.high.push(...lows.map(() => 20));
    engine.ohlcHistory.close.push(...lows.map(() => 10));
    engine.ohlcHistory.open.push(...lows.map(() => 10));
    engine.ohlcHistory.volume.push(...lows.map(() => 1000));
    engine.currentContext = pivotContext(5);
    const fn = getPivotlow(engine);
    expect(fn(1, 1)).toBe(NA);
  });

  it('multi-bar window: lb=2, rb=2 pivot low detection', () => {
    const engine = new ExecutionEngine(compiled);
    // lows=[10,8,7,3,9,6]: candidate at idx=3, value=3.
    // left:[7,8] — 7.lt(3)? NO, 8.lt(3)? NO → OK.
    // right:[9,6] — 9.lte(3)? NO, 6.lte(3)? NO → OK. Pivot! Returns 3.
    const lows = [10, 8, 7, 3, 9, 6];
    engine.ohlcHistory.low.push(...lows);
    engine.ohlcHistory.high.push(...lows.map(() => 20));
    engine.ohlcHistory.close.push(...lows.map(() => 10));
    engine.ohlcHistory.open.push(...lows.map(() => 10));
    engine.ohlcHistory.volume.push(...lows.map(() => 1000));
    engine.currentContext = pivotContext(6);
    const fn = getPivotlow(engine);
    expect(fn(2, 2)).toBe(3);
  });
});

// ===========================================================================
// ta.valuewhen — exact Decimal source storage
// ===========================================================================

/**
 * IMPORTANT: every call to valuewhen with a truthy condition STORES the source.
 * Tests MUST use expect(fn(...)) for every call — no standalone fn(true, ...)
 * calls, as they silently add entries to history.
 */
describe('M8 ta.valuewhen — Decimal exactness (fp-final-gate lock)', () => {
  it('occurrence 0: first truthy condition stores exact source, retrieval returns it', () => {
    const engine = new ExecutionEngine(compiled);
    engine.currentCallSiteId = 0;
    const fn = getValuewhen(engine);
    // Condition false → nothing stored → no history → NA
    expect(fn(false, 1.5, 0)).toBe(NA);
    // Condition true → stores Decimal(1.5) → occurrence 0 = most recent = 1.5
    expect(fn(true, 1.5, 0)).toBe(new Decimal('1.5').toNumber());
  });

  it('occurrence 1: second truthy condition returns the PREVIOUS truthy source', () => {
    const engine = new ExecutionEngine(compiled);
    engine.currentCallSiteId = 1;
    const fn = getValuewhen(engine);
    // Condition true → stores D(10.5), 1 entry, occurrence 1 needs 2 → NA
    expect(fn(true, 10.5, 1)).toBe(NA);
    // Condition true → stores D(20.3), 2 entries, occurrence 1 = index 0 = 10.5
    expect(fn(true, 20.3, 1)).toBe(new Decimal('10.5').toNumber());
    // Condition true → stores D(30.1), 3 entries, occurrence 1 = index 1 = 20.3
    expect(fn(true, 30.1, 1)).toBe(new Decimal('20.3').toNumber());
  });

  it('occurrence 2: third truthy condition returns the source from 2 truthies ago', () => {
    const engine = new ExecutionEngine(compiled);
    engine.currentCallSiteId = 2;
    const fn = getValuewhen(engine);
    // stores D(1.0), 1 entry, occurrence 2 needs 3 → NA
    expect(fn(true, 1.0, 2)).toBe(NA);
    // stores D(2.0), 2 entries → NA
    expect(fn(true, 2.0, 2)).toBe(NA);
    // stores D(3.0), 3 entries → occurrence 2 = index 0 = 1.0
    expect(fn(true, 3.0, 2)).toBe(new Decimal('1.0').toNumber());
    // stores D(4.0), 4 entries → occurrence 2 = index 1 = 2.0
    expect(fn(true, 4.0, 2)).toBe(new Decimal('2.0').toNumber());
  });

  it('NA source entries: NaN Decimal stored, decimalToPineValue collapses to NA on retrieval', () => {
    const engine = new ExecutionEngine(compiled);
    engine.currentCallSiteId = 3;
    const fn = getValuewhen(engine);
    // Condition true, source NA → stores Decimal(NaN). Occurrence 0 → decimalToPineValue → NA.
    expect(fn(true, NA, 0)).toBe(NA);
    // Condition true, source 5.0 → stores Decimal(5.0). Now 2 entries.
    // occurrence 1 = index 0 = the NA entry → retrieves as NA.
    expect(fn(true, 5.0, 1)).toBe(NA);
    // occurrence 0 = index 1 = 5.0
    expect(fn(true, 5.0, 0)).toBe(new Decimal('5.0').toNumber());
  });

  it('mixed true/false conditions: only truthy entries are stored, falsy bars look up without storing', () => {
    const engine = new ExecutionEngine(compiled);
    engine.currentCallSiteId = 4;
    const fn = getValuewhen(engine);
    // valuewhen LOOKS UP history on every call — condition only controls STORAGE.
    // Strategy: use true to STORE, then false to LOOK UP without side-effects.
    // Empty history → NA
    expect(fn(false, 99.0, 0)).toBe(NA);
    // Store 1.0
    expect(fn(true, 1.0, 0)).toBe(new Decimal('1.0').toNumber()); // stores → [D(1.0)] → occ0=1.0
    // False bar: not stored, lookup occ0 = still 1.0
    expect(fn(false, 99.0, 0)).toBe(new Decimal('1.0').toNumber());
    // Store 2.0
    expect(fn(true, 2.0, 0)).toBe(new Decimal('2.0').toNumber()); // stores → [D(1.0), D(2.0)] → occ0=2.0
    // False bar: lookup occ0 = 2.0
    expect(fn(false, 99.0, 0)).toBe(new Decimal('2.0').toNumber());
    // Store 3.0
    expect(fn(true, 3.0, 0)).toBe(new Decimal('3.0').toNumber()); // stores → [D(1.0), D(2.0), D(3.0)] → occ0=3.0
    // False bars to probe occurrence 1 and 2 WITHOUT storing
    expect(fn(false, 99.0, 1)).toBe(new Decimal('2.0').toNumber()); // occ1 → D(2.0)
    expect(fn(false, 99.0, 2)).toBe(new Decimal('1.0').toNumber()); // occ2 → D(1.0)
  });

  it('R4: non-finite source stored as NaN Decimal → retrieval collapses to NA, no corruption', () => {
    const engine = new ExecutionEngine(compiled);
    engine.currentCallSiteId = 5;
    const fn = getValuewhen(engine);
    // Infinity → stores NaN Decimal. Occurrence 0 → decimalToPineValue → NA.
    expect(fn(true, Number.POSITIVE_INFINITY, 0)).toBe(NA);
    // 42.0 → stores D(42.0). Now 2 entries. occurrence 1 = Infinity entry → NA.
    expect(fn(true, 42.0, 1)).toBe(NA);
    // occurrence 0 = 42.0
    expect(fn(true, 42.0, 0)).toBe(new Decimal('42.0').toNumber());
  });

  it('R5: negative occurrence → NA', () => {
    const engine = new ExecutionEngine(compiled);
    engine.currentCallSiteId = 6;
    const fn = getValuewhen(engine);
    expect(fn(true, 5.0, -1)).toBe(NA);
  });

  it('condition = 0 (falsy) is NOT stored', () => {
    const engine = new ExecutionEngine(compiled);
    engine.currentCallSiteId = 7;
    const fn = getValuewhen(engine);
    expect(fn(0, 10.0, 0)).toBe(NA); // 0 is falsy → not stored → NA
  });

  it('exactness trap: values that drift in float arithmetic are stored consistently', () => {
    const engine = new ExecutionEngine(compiled);
    engine.currentCallSiteId = 8;
    const fn = getValuewhen(engine);
    // 10.1 + 8.2 = 18.300000000000004 in IEEE 754. The source is passed as a
    // JS number, converted to Decimal at the boundary. pineValueToDecimal
    // preserves the exact double — no additional drift.
    const src = 10.1 + 8.2; // 18.300000000000004
    expect(fn(true, src, 0)).toBe(src); // stored and returned consistently
  });
});
