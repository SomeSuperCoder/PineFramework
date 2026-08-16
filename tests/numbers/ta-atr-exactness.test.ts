/**
 * M7a TA.TR / TA.ATR EXACTNESS — Decimal state migration (fp-final-gate lock).
 *
 * Locks the M7a migration of `ta.tr` and `ta.atr` in ta-volatility.ts:
 *
 *   • ta.tr is computed EXACTLY at DP=20 —
 *     tr = max(high−low, |high−close[1]|, |low−close[1]|), with the bar-0
 *     prevClose fallback to `close` (no close[1] on the first bar). R4: a
 *     non-finite high/low/close collapses to NA via isFiniteNumber BEFORE
 *     conversion, so Infinity/NaN never reaches Decimal. A NaN close[1] also
 *     falls back to close.
 *   • ta.atr is the exact Wilder RMA of those TRs (incremental-SMA warm-up then
 *     (prev*(len−1)+tr)/len), all Decimal end-to-end — no Number round-trip per
 *     bar, so a CONSTANT true range converges to EXACTLY that constant where
 *     the legacy float iteration drifted. State layout mirrors rmaState; the
 *     values[] history pushes decimalToPineValue(state.prev) per bar (bar 0
 *     pushes the NA sentinel) and backs the ta.atr(N)[i] historical-index path
 *     in expression-executor.ts:885.
 *
 * Direct engine invocation (same pattern as ta-ema-rma-exactness /
 * ta-rsi-exactness): parse → compile → new ExecutionEngine, then call
 * engine.builtins.get('ta.tr' | 'ta.atr') directly. Unlike ta.ema/ta.rsi these
 * builtins READ the bar context (ctx.high/low/close), so each call sets
 * engine.currentContext to a context whose series carry the FULL bar history
 * up to index i (bars.slice(0, i+1)) — the higher-high-lower-low.test pattern.
 * That is what makes close[1] REAL from bar 1 onward while bar 0 still hits
 * the no-prevClose fallback. (Per-bar contexts with only [bar.close] would
 * make close[1] NA on EVERY bar — exactly the trap this suite exists to catch.)
 *
 * State isolation: atr state is keyed `atr_<len>_<callSiteId>` and persists on
 * the engine — each `it` runs on a FRESH ExecutionEngine (compile once, new
 * engine per test), so no test observes another test's state regardless of
 * length. Lengths are still varied per test for readability.
 *
 * Warm-up contract (identical to Pine, byte-identical NA/values-push semantics
 * to the legacy float runtime): bar 0 creates state {prev: tr, count: 1},
 * pushes the NA sentinel to values[] and returns NA; bars 1..len−1 (count
 * 2..len ≤ len) run the incremental SMA and return NA — exactly `len` NA bars
 * total (bars 0..len−1); the first ATR value is emitted on bar len (count =
 * len+1) — the Wilder recursion.
 *
 * Expected values are computed with decimal.js (exact decimal → nearest
 * double) so the suite is self-validating against exact decimals, not float
 * literals.
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
// Engine + bar-context plumbing — the ONLY plumbing in this suite
// ---------------------------------------------------------------------------

const { ast } = parse('//@version=6\nindicator("M7a ATR Exactness", overlay=true)\nplot(close, "c")');
const compiled = compile(ast);

/** Fresh engine per test — atr state (`atr_<len>_<callSiteId>`) must not leak across tests. */
function newEngine(): ExecutionEngine {
  return new ExecutionEngine(compiled);
}

type BuiltinFn = (...args: unknown[]) => PineValue;

function tr(engine: ExecutionEngine): BuiltinFn {
  const fn = engine.builtins.get('ta.tr');
  if (!fn) throw new Error('ta.tr not registered');
  return fn as BuiltinFn;
}

function atr(engine: ExecutionEngine): BuiltinFn {
  const fn = engine.builtins.get('ta.atr');
  if (!fn) throw new Error('ta.atr not registered');
  return fn as BuiltinFn;
}

/** Minimal OHLCV data for the bar context — only high/low/close matter to ta.tr/ta.atr. */
interface TestBar {
  high: number;
  low: number;
  close: number;
}

/**
 * Full-history context for bar index i: every series carries bars[0..i], so
 * getRelative(0) = current bar and getRelative(1) = the REAL previous close
 * (bar 0's getRelative(1) is out-of-bounds → NA → the prevClose fallback).
 */
function contextAt(bars: TestBar[], i: number): ExecutionContext {
  return {
    barIndex: i,
    barCount: bars.length,
    timestamp: 1700000000000 + i * 3600000,
    open: createSeries('open', bars.slice(0, i + 1).map((b) => b.close)),
    high: createSeries('high', bars.slice(0, i + 1).map((b) => b.high)),
    low: createSeries('low', bars.slice(0, i + 1).map((b) => b.low)),
    close: createSeries('close', bars.slice(0, i + 1).map((b) => b.close)),
    volume: createSeries('volume', bars.slice(0, i + 1).map(() => 1000)),
  };
}

/** Drive ta.tr at bar i against the full history of `bars`. */
function trAt(engine: ExecutionEngine, bars: TestBar[], i: number): PineValue {
  engine.currentContext = contextAt(bars, i);
  return tr(engine)();
}

/** Drive ta.atr(len) at bar i against the full history of `bars`. */
function atrAt(engine: ExecutionEngine, bars: TestBar[], i: number, len: number): PineValue {
  engine.currentContext = contextAt(bars, i);
  return atr(engine)(len);
}

describe('M7a ta.tr — Decimal true-range exactness (fp-final-gate lock)', () => {
  it('known bar set → hand-computed EXACT true ranges (max of the 3 terms)', () => {
    const engine = newEngine();
    const bars: TestBar[] = [
      { high: 10.1, low: 8.2, close: 9.3 }, // bar0 fallback prevClose=close=9.3
      { high: 12.3, low: 9.4, close: 11.2 }, // prevClose=9.3
      { high: 11.5, low: 7.1, close: 8.6 }, // prevClose=11.2
      { high: 14.2, low: 10.3, close: 13.1 }, // prevClose=8.6
      { high: 13.4, low: 11.2, close: 12.5 }, // prevClose=13.1
    ];
    // bar0: hl=1.9, |10.1−9.3|=0.8, |8.2−9.3|=1.1 → 1.9
    expect(trAt(engine, bars, 0)).toBe(new Decimal('1.9').toNumber());
    // bar1: hl=2.9, |12.3−9.3|=3.0, |9.4−9.3|=0.1 → 3.0
    expect(trAt(engine, bars, 1)).toBe(new Decimal('3.0').toNumber());
    // bar2: hl=4.4, |11.5−11.2|=0.3, |7.1−11.2|=4.1 → max = 4.4
    expect(trAt(engine, bars, 2)).toBe(new Decimal('4.4').toNumber());
    // bar3: hl=3.9, |14.2−8.6|=5.6, |10.3−8.6|=1.7 → 5.6
    expect(trAt(engine, bars, 3)).toBe(new Decimal('5.6').toNumber());
    // bar4: hl=2.2, |13.4−13.1|=0.3, |11.2−13.1|=1.9 → 2.2
    expect(trAt(engine, bars, 4)).toBe(new Decimal('2.2').toNumber());
  });

  it('bar-0 prevClose fallback: no close[1] → uses close (NOT a zero default)', () => {
    const engine = newEngine();
    // If prevClose defaulted to 0: max(2.3, 12.3, 10) = 12.3. With the close
    // fallback: max(2.3, 1.3, 1.0) = 2.3. Exactly 2.3 proves the fallback.
    const bars: TestBar[] = [{ high: 12.3, low: 10, close: 11 }];
    expect(trAt(engine, bars, 0)).toBe(new Decimal('2.3').toNumber());
  });

  it('R4: non-finite high/low/close → NA, never reaches Decimal, no leak', () => {
    const engine = newEngine();
    // bar0: current close is NaN → guard → NA
    let bars: TestBar[] = [{ high: 10.1, low: 8.2, close: Number.NaN }];
    expect(trAt(engine, bars, 0)).toBe(NA);
    // bar0: current high is Infinity → NA
    bars = [{ high: Number.POSITIVE_INFINITY, low: 8.2, close: 9.3 }];
    expect(trAt(engine, bars, 0)).toBe(NA);
    // bar0: current low is -Infinity → NA
    bars = [{ high: 10.1, low: Number.NEGATIVE_INFINITY, close: 9.3 }];
    expect(trAt(engine, bars, 0)).toBe(NA);
    // A NaN close[1] ALSO falls back to close (R4 note): bar1's prevClose is
    // the NaN bar0 close → fallback → tr = max(2.5, 1.5, 1.0) = 2.5. Without
    // the fallback Decimal.max would propagate NaN → NA.
    bars = [
      { high: 10.1, low: 8.2, close: Number.NaN },
      { high: 12.5, low: 10, close: 11 },
    ];
    expect(trAt(engine, bars, 1)).toBe(new Decimal('2.5').toNumber());
  });
});

describe('M7a ta.atr — Decimal Wilder exactness (fp-final-gate lock)', () => {
  it('constant high/low/close → tr constant → converges to EXACTLY that constant', () => {
    const engine = newEngine();
    // Constant bars: tr = 1.9 every bar (bar0 fallback + bars≥1 real prevClose).
    const bars: TestBar[] = Array.from({ length: 40 }, () => ({
      high: 10.1,
      low: 8.2,
      close: 9.3,
    }));
    // len=7 warm-up: bar0 state creation → NA, bars 1..6 (count 2..7 ≤ 7) → NA
    // — exactly len NA bars (bars 0..6), first value on bar len (count=8).
    for (let i = 0; i < 7; i++) {
      expect(atrAt(engine, bars, i, 7)).toBe(NA);
    }
    // bar7: count=8 > 7 → Wilder (prev*(7−1)+1.9)/7 → exactly 1.9
    // (float would drift: 10.1−8.2 = 1.8999999999999995 → ATR never lands 1.9)
    expect(atrAt(engine, bars, 7, 7)).toBe(new Decimal('1.9').toNumber());
    // recursion: (1.9*6 + 1.9)/7 = 1.9 forever — no drift
    for (let i = 8; i < bars.length; i++) {
      expect(atrAt(engine, bars, i, 7)).toBe(new Decimal('1.9').toNumber());
    }
  });

  it('known mixed series, len=2 → hand-computed EXACT Wilder rma: 3.5, 4.45, 3.425', () => {
    const engine = newEngine();
    const bars: TestBar[] = [
      { high: 10, low: 8, close: 9 }, // tr=2 (fallback)
      { high: 12, low: 9.5, close: 11 }, // tr=3 (prevClose=9)
      { high: 11.5, low: 7, close: 8.6 }, // tr=4.5 (prevClose=11)
      { high: 14, low: 10, close: 13 }, // tr=5.4 (prevClose=8.6)
      { high: 13.4, low: 11, close: 12 }, // tr=2.4 (prevClose=13)
    ];
    // bar0: state created {prev:2, count:1} → NA (values=[NA])
    expect(atrAt(engine, bars, 0, 2)).toBe(NA);
    // bar1: count=2 ≤ 2 → prev=(2*1+3)/2=2.5 → NA (incremental SMA seed phase)
    expect(atrAt(engine, bars, 1, 2)).toBe(NA);
    // bar2: count=3 > 2 → prev=(2.5*1+4.5)/2=3.5 EXACTLY
    expect(atrAt(engine, bars, 2, 2)).toBe(new Decimal('3.5').toNumber());
    // bar3: prev=(3.5*1+5.4)/2=8.9/2=4.45 EXACTLY
    expect(atrAt(engine, bars, 3, 2)).toBe(new Decimal('4.45').toNumber());
    // bar4: prev=(4.45*1+2.4)/2=6.85/2=3.425 EXACTLY
    expect(atrAt(engine, bars, 4, 2)).toBe(new Decimal('3.425').toNumber());
  });

  it('Pine warm-up NA count: bar0 + bars 1..len → NA (len+1 NA), first value on bar len+1', () => {
    const engine = newEngine();
    const bars: TestBar[] = Array.from({ length: 20 }, () => ({
      high: 10.1,
      low: 8.2,
      close: 9.3,
    }));
    // len=5: bars 0..4 are NA (bar0 state creation + 4 incremental-SMA bars),
    // bar5 emits the first value (count=6 > len).
    for (let i = 0; i < 5; i++) {
      expect(atrAt(engine, bars, i, 5)).toBe(NA);
    }
    expect(atrAt(engine, bars, 5, 5)).toBe(new Decimal('1.9').toNumber());
  });

  it('R4: non-finite bar → NA out, state NOT advanced, next finite continues clean', () => {
    const engine = newEngine();
    const bars: TestBar[] = [
      { high: 10, low: 8, close: 9 }, // tr=2 → state {prev:2, count:1} → NA
      { high: Number.POSITIVE_INFINITY, low: 8, close: 9 }, // R4 → NA, count must NOT advance
      { high: 12, low: 9.5, close: 11 }, // tr=3 → count=2 ≤ 2 → prev=2.5 → NA
      { high: 13.4, low: 11, close: 12 }, // tr=2.4 → count=3 > 2 → prev=2.45
    ];
    expect(atrAt(engine, bars, 0, 2)).toBe(NA);
    expect(atrAt(engine, bars, 1, 2)).toBe(NA); // non-finite → NA before state access
    expect(atrAt(engine, bars, 2, 2)).toBe(NA); // count is STILL 2 (not 3) — SMA seed phase
    // If the Infinity bar had advanced count, this would be count=4 > 2 →
    // prev=(3.5*1+2.4)/2=2.95. Instead count=3 → prev=(2.5*1+2.4)/2=2.45.
    expect(atrAt(engine, bars, 3, 2)).toBe(new Decimal('2.45').toNumber());
  });

  it('atrState.values[] history — NA sentinel at bar 0, then exact decimal entries (ta.atr(N)[i] path)', () => {
    // Drives the same mixed series as the exactness test above (len=2), then
    // inspects atrState.values[] directly — the array expression-executor.ts:885
    // reads for ta.atr(N)[i]. State key is atr_2_0 (len=2, direct-call site 0).
    const engine = newEngine();
    const bars: TestBar[] = [
      { high: 10, low: 8, close: 9 },
      { high: 12, low: 9.5, close: 11 },
      { high: 11.5, low: 7, close: 8.6 },
      { high: 14, low: 10, close: 13 },
      { high: 13.4, low: 11, close: 12 },
    ];
    for (let i = 0; i < bars.length; i++) {
      atrAt(engine, bars, i, 2);
    }
    const state = engine.atrState.get('atr_2_0');
    expect(state).toBeDefined();
    const values = state!.values;
    // bar0 pushed the NA sentinel; bars 1..4 pushed decimalToPineValue(prev).
    expect(values.length).toBe(5);
    expect(values[0]).toBe(NA);
    expect(values[1]).toBe(new Decimal('2.5').toNumber());
    expect(values[2]).toBe(new Decimal('3.5').toNumber());
    expect(values[3]).toBe(new Decimal('4.45').toNumber());
    expect(values[4]).toBe(new Decimal('3.425').toNumber());
    // Historical-index semantics (expression-executor.ts:887):
    // values[length−1−index] — index 0 = current bar, 1 = previous, etc.
    expect(values[values.length - 1 - 0]).toBe(new Decimal('3.425').toNumber());
    expect(values[values.length - 1 - 1]).toBe(new Decimal('4.45').toNumber());
    expect(values[values.length - 1 - 2]).toBe(new Decimal('3.5').toNumber());
  });
});
