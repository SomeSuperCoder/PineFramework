/**
 * M5a TA.SMA EXACTNESS — DecimalRingBuffer migration (fp-final-gate lock).
 *
 * Locks the M5a migration of `ta.sma` in ta-overlap.ts: the ring buffer is now
 * a DecimalRingBuffer (push pineValueToDecimal(source), exit
 * decimalToPineValue(sum.div(len))). The fp-final-gate trap_sma proves this at
 * script level — this suite locks the SAME behavior at unit level via direct
 * engine invocation (same construction pattern as math-builtins-exactness.test.ts
 * and execution-engine.test.ts — parse → compile → new ExecutionEngine, then
 * call engine.builtins.get('ta.sma') directly).
 *
 * Statefulness note: ta.sma accumulates per-engine state keyed by
 * `sma_<len>_<callSiteId>`. Calling the builtin directly N times with the same
 * length feeds N bars into that buffer. Tests use DISJOINT lengths so no test
 * can observe another test's buffer state.
 *
 * Asserted contract (mirrors the gate + code comments):
 *   • ta.sma(0.1, 10) === 0.1 EXACTLY after warmup        (was 0.09999999999999999)
 *   • constant series → the constant, exactly
 *   • NA propagation: sma(na) → na; before warm-up → na
 *   • length 1 → identity
 *   • explicit mixed window → exact decimal mean
 *   • R4: input Infinity → NA (never Infinity/NaN leak)
 */
import { describe, expect, it } from 'vitest';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { NA, type PineValue } from '../../src/language/types/na.js';
import { configureDecimal } from '../../src/language/runtime/numbers/decimal-config.js';

// Contract §9/§10 — DP=20, ROUND_HALF_UP active for every assertion.
configureDecimal();

// ---------------------------------------------------------------------------
// Engine + builtin access — the ONLY plumbing in this suite
// ---------------------------------------------------------------------------

const { ast } = parse('//@version=6\nindicator("M5a SMA Exactness", overlay=true)\nplot(close, "c")');
const engine = new ExecutionEngine(compile(ast));

type BuiltinFn = (...args: unknown[]) => PineValue;

function sma(): BuiltinFn {
  const fn = engine.builtins.get('ta.sma');
  if (!fn) throw new Error('ta.sma not registered');
  return fn as BuiltinFn;
}

describe('M5a ta.sma — DecimalRingBuffer exactness (fp-final-gate lock)', () => {
  it('sma(0.1, 10) === exactly 0.1 after warmup — the gate trap', () => {
    const fn = sma();
    // 9 bars: below warmup → NA
    for (let i = 0; i < 9; i++) {
      expect(fn(0.1, 10)).toBe(NA);
    }
    // bar 10: window full — EXACT decimal mean, not 0.09999999999999999
    expect(fn(0.1, 10)).toBe(0.1);
    // every subsequent bar of 0.1 stays exactly 0.1 (sliding window, no drift)
    for (let i = 0; i < 50; i++) {
      expect(fn(0.1, 10)).toBe(0.1);
    }
  });

  it('constant series: sma(1.5, 3) === 1.5 exactly', () => {
    const fn = sma();
    expect(fn(1.5, 3)).toBe(NA); // warmup
    expect(fn(1.5, 3)).toBe(NA);
    expect(fn(1.5, 3)).toBe(1.5);
    expect(fn(1.5, 3)).toBe(1.5); // sliding window of all-1.5 → fixed point exact
  });

  it('NA propagation: sma(na, len) → na; sma(src, na) → na', () => {
    const fn = sma();
    expect(fn(NA, 5)).toBe(NA);
    expect(fn(0.1, NA)).toBe(NA);
  });

  it('warm-up: sma before the window fills → na', () => {
    const fn = sma();
    expect(fn(0.1, 7)).toBe(NA);
    expect(fn(0.1, 7)).toBe(NA);
    expect(fn(0.1, 7)).toBe(NA);
    expect(fn(0.1, 7)).toBe(NA);
    expect(fn(0.1, 7)).toBe(NA);
    expect(fn(0.1, 7)).toBe(NA);
    expect(fn(0.1, 7)).toBe(0.1); // bar 7 fills the window
  });

  it('length 1 → identity (equals input exactly)', () => {
    const fn = sma();
    expect(fn(0.7, 1)).toBe(0.7);
    expect(fn(0.1, 1)).toBe(0.1);
    expect(fn(-2.5, 1)).toBe(-2.5);
  });

  it('explicit mixed window: sma([0.1, 0.2, 0.3, 0.4], 4) === 0.25 exactly', () => {
    const fn = sma();
    expect(fn(0.1, 4)).toBe(NA);
    expect(fn(0.2, 4)).toBe(NA);
    expect(fn(0.3, 4)).toBe(NA);
    // sum = 0.1+0.2+0.3+0.4 = 1.0 → /4 = 0.25 EXACTLY (float would give
    // 0.25000000000000006 or similar)
    expect(fn(0.4, 4)).toBe(0.25);
  });

  it('R4: input Infinity → NA, never Infinity/NaN leak', () => {
    const fn = sma();
    expect(fn(Infinity, 11)).toBe(NA); // warmup
    // bar 11: window full, but sum is non-finite → collapsed to NA (R4 upgrade
    // vs old float path which leaked raw NaN)
    expect(fn(Infinity, 11)).toBe(NA);
  });
});