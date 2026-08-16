/**
 * M5b TA.EMA / TA.RMA EXACTNESS — Decimal state migration (fp-final-gate lock).
 *
 * Locks the M5b migration of `ta.ema` and `ta.rma` in ta-overlap.ts: state
 * values (prev, sum) now live as Decimal through the ENTIRE recursion — sum
 * accumulates exactly at DP=20, the seed prev = sum/len and the k*(val-prev)
 * update never round-trip through Number — so constant/decimal-exact series
 * converge to EXACT decimals where the legacy float k-iteration drifted.
 *
 * Direct engine invocation (same pattern as ta-sma-exactness / math-builtins
 * exactness): parse → compile → new ExecutionEngine, then call
 * engine.builtins.get('ta.ema' | 'ta.rma') directly. State is keyed by
 * `ema_<len>_<callSiteId>` / `rma_<len>_<callSiteId>` — tests use DISJOINT
 * lengths so no test observes another test's state.
 *
 * Warm-up contract (identical to legacy float runtime — count/threshold logic
 * unchanged by M5b, only the arithmetic became Decimal):
 *   • ta.ema: call 1 creates state and returns NA WITHOUT consuming the value
 *     (first bar is dropped by the state-creation call); calls 2..len fill the
 *     sum; the seed prev = sum/len is returned on call len+1, then recursion.
 *   • ta.rma: call 1 seeds prev = val, count = 1 → NA; calls 2..len run the
 *     incremental SMA (NA until warm); the Wilder recursion is returned on
 *     call len+1.
 *
 * Expected values are computed with decimal.js (exact decimal → nearest double)
 * so the suite is self-validating against exact decimals, not float literals.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { NA, type PineValue } from '../../src/language/types/na.js';
import { configureDecimal } from '../../src/language/runtime/numbers/decimal-config.js';
import { Decimal } from 'decimal.js';

// Contract §9/§10 — DP=20, ROUND_HALF_UP active for every assertion.
configureDecimal();

// ---------------------------------------------------------------------------
// Engine + builtin access — the ONLY plumbing in this suite
// ---------------------------------------------------------------------------

const { ast } = parse('//@version=6\nindicator("M5b EMA/RMA Exactness", overlay=true)\nplot(close, "c")');
const engine = new ExecutionEngine(compile(ast));

type BuiltinFn = (...args: unknown[]) => PineValue;

function ema(): BuiltinFn {
  const fn = engine.builtins.get('ta.ema');
  if (!fn) throw new Error('ta.ema not registered');
  return fn as BuiltinFn;
}

function rma(): BuiltinFn {
  const fn = engine.builtins.get('ta.rma');
  if (!fn) throw new Error('ta.rma not registered');
  return fn as BuiltinFn;
}

describe('M5b ta.ema — Decimal state exactness (fp-final-gate lock)', () => {
  it('constant 3.0, len=7 → converges to exactly 3.0 after warm-up (no drift)', () => {
    const fn = ema();
    // call 1: state created → NA (first value dropped — legacy float behavior)
    expect(fn(3.0, 7)).toBe(NA);
    // calls 2..7: count 1..6 < len → NA
    for (let i = 0; i < 6; i++) {
      expect(fn(3.0, 7)).toBe(NA);
    }
    // call 8: count=7 → seed = sum/len = 21/7 = 3.0 EXACTLY
    expect(fn(3.0, 7)).toBe(3.0);
    // recursion: prev += k*(3-3) = 0 → stays exactly 3.0 forever
    for (let i = 0; i < 25; i++) {
      expect(fn(3.0, 7)).toBe(3.0);
    }
  });

  it('constant 0.1, len=9 → converges to exactly 0.1 — the gate trap', () => {
    const fn = ema();
    expect(fn(0.1, 9)).toBe(NA); // state created, value dropped
    for (let i = 0; i < 8; i++) {
      expect(fn(0.1, 9)).toBe(NA); // calls 2..9 fill sum 0.1..0.8
    }
    // call 10: count=9 → seed = 0.9/9 = 0.1 EXACTLY (float: 0.9000000000000001/9 = 0.10000000000000002)
    expect(fn(0.1, 9)).toBe(0.1);
    // recursion: k = 2/10 = 0.2; k*(0.1-0.1) = 0 → exactly 0.1 forever
    for (let i = 0; i < 25; i++) {
      expect(fn(0.1, 9)).toBe(0.1);
    }
  });

  it('mixed window [0.1..0.6], len=3 → seed + recursion exact: 0.3, 0.4, 0.5', () => {
    const fn = ema();
    expect(fn(0.1, 3)).toBe(NA); // state created, 0.1 dropped
    expect(fn(0.2, 3)).toBe(NA); // count=1, sum=0.2
    expect(fn(0.3, 3)).toBe(NA); // count=2, sum=0.5
    // call 4: count=3 → seed = 0.9/3 = 0.3 EXACTLY (0.1+0.2+0.3 = 0.6, +0.4 = 1.0 → wait)
    //   sum of calls 2..4 = 0.2+0.3+0.4 = 0.9 → /3 = 0.3
    expect(fn(0.4, 3)).toBe(new Decimal('0.3').toNumber());
    // k = 2/4 = 0.5; prev = 0.3 + 0.5*(0.5-0.3) = 0.3 + 0.1 = 0.4
    expect(fn(0.5, 3)).toBe(new Decimal('0.4').toNumber());
    // prev = 0.4 + 0.5*(0.6-0.4) = 0.4 + 0.1 = 0.5
    expect(fn(0.6, 3)).toBe(new Decimal('0.5').toNumber());
  });

  it('NA propagation: NA source/length, Infinity, NaN → NA, never reaches state', () => {
    const fn = ema();
    expect(fn(NA, 11)).toBe(NA); // NA source
    expect(fn(0.5, NA)).toBe(NA); // NA length
    expect(fn(Infinity, 11)).toBe(NA); // R4 boundary guard
    expect(fn(-Infinity, 11)).toBe(NA);
    expect(fn(NaN, 11)).toBe(NA);
  });

  it('NA mid-series → NA out, state NOT advanced, next finite continues — no NaN/Infinity leak', () => {
    const fn = ema();
    // len=15: state created call 1 (dropped), calls 2..15 fill count 1..14
    expect(fn(1.0, 15)).toBe(NA);
    for (let i = 0; i < 13; i++) {
      expect(fn(1.0, 15)).toBe(NA); // calls 2..14
    }
    expect(fn(1.0, 15)).toBe(NA); // call 15, count=14
    // call 16: count=15 → seed = sum(calls 2..16)/15 = 15/15 = 1.0
    expect(fn(1.0, 15)).toBe(1.0);
    // NA mid-series: returns NA, must NOT advance count or corrupt sum
    expect(fn(NA, 15)).toBe(NA);
    // next finite value: k = 2/16 = 0.125; prev = 1.0 + 0.125*(2.0-1.0) = 1.125
    // — finite, no NaN/Infinity leaked from the NA bar
    expect(fn(2.0, 15)).toBe(new Decimal('1.125').toNumber());
  });
});

describe('M5b ta.rma — Decimal state exactness (fp-final-gate lock)', () => {
  it('constant 3.0, len=8 → converges to exactly 3.0 after warm-up (no drift)', () => {
    const fn = rma();
    // call 1: state created {prev: 3.0, count: 1} → NA
    expect(fn(3.0, 8)).toBe(NA);
    // calls 2..8: count 2..8 ≤ len → incremental SMA of 3.0s = 3.0 → NA
    for (let i = 0; i < 7; i++) {
      expect(fn(3.0, 8)).toBe(NA);
    }
    // call 9: count=9 > len → prev = (3.0*7 + 3.0)/8 = 24/8 = 3.0 EXACTLY
    expect(fn(3.0, 8)).toBe(3.0);
    // recursion: (3.0*7 + 3.0)/8 = 3.0 forever — no drift
    for (let i = 0; i < 25; i++) {
      expect(fn(3.0, 8)).toBe(3.0);
    }
  });

  it('constant 0.1, len=10 → converges to exactly 0.1 — the gate trap', () => {
    const fn = rma();
    expect(fn(0.1, 10)).toBe(NA); // state created {prev: 0.1, count: 1}
    for (let i = 0; i < 9; i++) {
      expect(fn(0.1, 10)).toBe(NA); // calls 2..10: incremental SMA of 0.1s → NA
    }
    // call 11: count=11 > len → prev = (0.1*9 + 0.1)/10 = 1.0/10 = 0.1 EXACTLY
    // (float running sum: 0.1*9 = 0.9000000000000001 → (1.0000000000000002)/10 = 0.10000000000000003)
    expect(fn(0.1, 10)).toBe(0.1);
    for (let i = 0; i < 25; i++) {
      expect(fn(0.1, 10)).toBe(0.1);
    }
  });

  it('mixed window [0.1..0.5], len=2 → recursion exact: 0.225, 0.3125, 0.40625', () => {
    const fn = rma();
    expect(fn(0.1, 2)).toBe(NA); // state created {prev: 0.1, count: 1}
    expect(fn(0.2, 2)).toBe(NA); // count=2 ≤ len → (0.1+0.2)/2 = 0.15 → NA
    // call 3: count=3 > len → prev = (0.15*1 + 0.3)/2 = 0.45/2 = 0.225
    expect(fn(0.3, 2)).toBe(new Decimal('0.225').toNumber());
    // prev = (0.225*1 + 0.4)/2 = 0.625/2 = 0.3125
    expect(fn(0.4, 2)).toBe(new Decimal('0.3125').toNumber());
    // prev = (0.3125*1 + 0.5)/2 = 0.8125/2 = 0.40625
    expect(fn(0.5, 2)).toBe(new Decimal('0.40625').toNumber());
  });

  it('NA propagation: NA source/length, Infinity, NaN → NA, never reaches state', () => {
    const fn = rma();
    expect(fn(NA, 12)).toBe(NA); // NA source
    expect(fn(0.5, NA)).toBe(NA); // NA length
    expect(fn(Infinity, 12)).toBe(NA); // R4 boundary guard
    expect(fn(-Infinity, 12)).toBe(NA);
    expect(fn(NaN, 12)).toBe(NA);
  });

  it('NA mid-series → NA out, state NOT advanced, next finite continues — no NaN/Infinity leak', () => {
    const fn = rma();
    // len=4: call 1 seeds prev=1.0, count=1 → NA
    expect(fn(1.0, 4)).toBe(NA);
    expect(fn(2.0, 4)).toBe(NA); // count=2, (1+2)/2 = 1.5
    expect(fn(3.0, 4)).toBe(NA); // count=3, (1.5*2+3)/3 = 2.0
    expect(fn(4.0, 4)).toBe(NA); // count=4 ≤ len, (2*3+4)/4 = 2.5
    // call 5: count=5 > len → prev = (2.5*3 + 5.0)/4 = 12.5/4 = 3.125
    expect(fn(5.0, 4)).toBe(new Decimal('3.125').toNumber());
    // NA mid-series: returns NA, must NOT advance count or corrupt prev
    expect(fn(NA, 4)).toBe(NA);
    // next finite value: count=6 > len → prev = (3.125*3 + 6.0)/4 = 15.375/4 = 3.84375
    // — finite, no NaN/Infinity leaked from the NA bar
    expect(fn(6.0, 4)).toBe(new Decimal('3.84375').toNumber());
  });
});