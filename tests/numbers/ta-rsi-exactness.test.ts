/**
 * M6 TA.RSI / TA.CROSS* / TA.CHANGE EXACTNESS — Decimal state migration
 * (fp-final-gate lock).
 *
 * Locks the M6 migration of `ta.rsi`, `ta.crossover`, `ta.crossunder`,
 * `ta.cross` and `ta.change` in ta-momentum.ts: gain/loss averages and
 * prevSource now live as Decimal through the ENTIRE recursion (incremental-SMA
 * warm-up then Wilder smoothing, all exact at DP=20), and cross/change diffs
 * are exact Decimal minus — no Number round-trip per bar. The zero-loss branch
 * is guarded with DECIMAL_EPSILON (1e-12) BEFORE the division (R5): both
 * averages zero → 50, only loss zero → 100, else rs = gain/loss →
 * 100 − 100/(1+rs).
 *
 * Direct engine invocation (same pattern as ta-ema-rma-exactness /
 * ta-hma-exactness): parse → compile → new ExecutionEngine, then call
 * engine.builtins.get('ta.rsi' | 'ta.crossover' | ...) directly.
 *
 * Warm-up contract (identical to Pine): ta.rsi's FIRST call seeds
 * prevSource (the value is consumed as the change reference, NOT dropped) and
 * returns NA; calls 2..len run the incremental SMA over the first `len`
 * changes and return NA; the first RSI value is emitted on call len+1
 * (count == len) — i.e. exactly `len` NA calls, matching Pine's
 * length-bar warm-up.
 *
 * State keying: rsi state is `rsi_<len>_<callSiteId>` — tests use DISJOINT
 * lengths so no test observes another test's state. Cross state is
 * `cross_<callSiteId>` SHARED by crossover/crossunder/cross and change state
 * is `change_<callSiteId>` — the cross-family assertions run on a FRESH
 * engine in a single sequential `it` so the shared key cannot collide.
 *
 * Expected values are computed with decimal.js (exact decimal → nearest
 * double) so the suite is self-validating against exact decimals, not float
 * literals.
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

const { ast } = parse(
  '//@version=6\nindicator("M6 RSI Exactness", overlay=true)\nplot(close, "c")',
);
const engine = new ExecutionEngine(compile(ast));

type BuiltinFn = (...args: unknown[]) => PineValue;

function rsi(): BuiltinFn {
  const fn = engine.builtins.get('ta.rsi');
  if (!fn) throw new Error('ta.rsi not registered');
  return fn as BuiltinFn;
}

function change(): BuiltinFn {
  const fn = engine.builtins.get('ta.change');
  if (!fn) throw new Error('ta.change not registered');
  return fn as BuiltinFn;
}

describe('M6 ta.rsi — Decimal Wilder exactness (fp-final-gate lock)', () => {
  it('constant 5.0, len=7 → both-zero branch → EXACT 50 after warm-up (no artifact)', () => {
    const fn = rsi();
    // call 1: state created {prevSource: 5.0}, count=0 → NA (Pine warm-up bar 1)
    expect(fn(5.0, 7)).toBe(NA);
    // calls 2..7: count 1..6 < len — every change is 0, both averages stay 0 → NA
    for (let i = 0; i < 6; i++) {
      expect(fn(5.0, 7)).toBe(NA);
    }
    // call 8: count=7 == len → incremental SMA complete, avgGain=avgLoss=0
    //   → R5 both-zero branch → 50 EXACTLY (float engine: isNearZero boundary)
    expect(fn(5.0, 7)).toBe(50);
    // Wilder recursion: (0*6 + 0)/7 = 0 → both-zero → 50 forever
    for (let i = 0; i < 25; i++) {
      expect(fn(5.0, 7)).toBe(50);
    }
  });

  it('strictly rising 1..6, len=4 → only-loss-zero branch → EXACT 100', () => {
    const fn = rsi();
    expect(fn(1.0, 4)).toBe(NA); // seed prevSource=1.0
    expect(fn(2.0, 4)).toBe(NA); // count=1, gain=1 → avgGain=1, avgLoss=0
    expect(fn(3.0, 4)).toBe(NA); // count=2, avgGain=(1*1+1)/2=1
    expect(fn(4.0, 4)).toBe(NA); // count=3, avgGain=(1*2+1)/3=1
    // call 5: count=4 == len → avgGain=1 > eps, avgLoss=0 ≤ eps → 100 EXACTLY
    expect(fn(5.0, 4)).toBe(100);
    // Wilder: avgGain=(1*3+1)/4=1, avgLoss=0 → 100 forever
    expect(fn(6.0, 4)).toBe(100);
    for (let i = 0; i < 10; i++) {
      expect(fn(6.0, 4)).toBe(100);
    }
  });

  it('strictly falling 7..0, len=6 → only-gain-zero branch → EXACT 0 (rs=0 → 100−100/1)', () => {
    const fn = rsi();
    expect(fn(7.0, 6)).toBe(NA); // seed prevSource=7.0
    // calls 2..6: count 1..5, every change −1 → avgLoss=1, avgGain=0 → NA
    for (let i = 0; i < 5; i++) {
      expect(fn(6.0 - i, 6)).toBe(NA);
    }
    // call 7: count=6 == len → avgLoss=1 > eps, avgGain=0 → rs=0/1=0
    //   → 100 − 100/(1+0) = 100 − 100 = 0 EXACTLY
    expect(fn(1.0, 6)).toBe(0);
    // Wilder: avgLoss=(1*5+1)/6=1, avgGain=0 → 0 forever
    expect(fn(0.0, 6)).toBe(0);
    for (let i = 0; i < 10; i++) {
      expect(fn(0.0, 6)).toBe(0);
    }
  });

  it('known mixed [10,12,9,14], len=2 → hand-computed EXACT 40 then 80 (terminating decimals)', () => {
    const fn = rsi();
    expect(fn(10.0, 2)).toBe(NA); // seed prevSource=10
    // call 2: count=1, change=+2 → avgGain=2, avgLoss=0 → NA (count 1 < len)
    expect(fn(12.0, 2)).toBe(NA);
    // call 3: count=2 == len, change=−3 → avgGain=(2*1+0)/2=1, avgLoss=(0*1+3)/2=1.5
    //   rs = 1/1.5 = 2/3 → 100 − 100/(1+2/3) = 100 − 60 = 40 EXACTLY
    expect(fn(9.0, 2)).toBe(new Decimal('40').toNumber());
    // call 4: count=3 > len → Wilder: avgGain=(1*1+5)/2=3, avgLoss=(1.5*1+0)/2=0.75
    //   rs = 3/0.75 = 4 → 100 − 100/5 = 80 EXACTLY
    expect(fn(14.0, 2)).toBe(new Decimal('80').toNumber());
  });

  it('known mixed [1,2,3,2,1], len=3 → fractional exactness: 66.666… then Wilder 44.444…', () => {
    const fn = rsi();
    expect(fn(1.0, 3)).toBe(NA); // seed prevSource=1
    expect(fn(2.0, 3)).toBe(NA); // count=1, gain=1 → avgGain=1
    expect(fn(3.0, 3)).toBe(NA); // count=2, avgGain=(1*1+1)/2=1
    // call 4: count=3 == len, change=−1 → avgGain=(1*2+0)/3=2/3, avgLoss=(0*2+1)/3=1/3
    //   rs = (2/3)/(1/3) = 2 → 100 − 100/3 = 66.666666666666666667 @ DP=20
    expect(fn(2.0, 3)).toBe(new Decimal('66.666666666666666667').toNumber());
    // call 5: count=4 > len → Wilder: avgGain=(2/3*2+0)/3=4/9, avgLoss=(1/3*2+1)/3=5/9
    //   rs = 4/5 = 0.8 → 100 − 100/1.8 = 44.444444444444444444 @ DP=20
    expect(fn(1.0, 3)).toBe(new Decimal('44.444444444444444444').toNumber());
  });

  it('Pine warm-up NA count: exactly `len` NA calls, first value on call len+1', () => {
    const fn = rsi();
    // len=5, constant 8.0 — NA for calls 1..5 (Pine bars 0..4), 50 on call 6
    for (let i = 0; i < 5; i++) {
      expect(fn(8.0, 5)).toBe(NA);
    }
    expect(fn(8.0, 5)).toBe(50);
  });

  it('R4: Infinity/-Infinity/NaN source → NA, never reaches state, never leaks', () => {
    const fn = rsi();
    expect(fn(Infinity, 13)).toBe(NA); // boundary guard BEFORE state access
    expect(fn(-Infinity, 13)).toBe(NA);
    expect(fn(NaN, 13)).toBe(NA);
    // len=13: the 3 non-finite calls must NOT have created/seeded state —
    //   the finite series starts warm-up from call 1.
    for (let i = 0; i < 13; i++) {
      expect(fn(3.0, 13)).toBe(NA); // calls 1..13
    }
    expect(fn(3.0, 13)).toBe(50); // call 14: count=13 == len → both-zero → 50
  });

  it('NA propagation: NA source/length, len<=0 → NA; NA mid-series → state NOT corrupted', () => {
    const fn = rsi();
    expect(fn(NA, 17)).toBe(NA); // NA source
    expect(fn(0.5, NA)).toBe(NA); // NA length
    expect(fn(0.5, 0)).toBe(NA); // len<=0
    expect(fn(0.5, -3)).toBe(NA); // len<=0
    // len=9 warm-up. The NA sits INSIDE the incremental-SMA phase, where the
    // averages' denominators depend on count — so a corrupted count would
    // change the first RSI value, making this a real state-integrity lock.
    expect(fn(10.0, 9)).toBe(NA); // seed prevSource=10
    expect(fn(12.0, 9)).toBe(NA); // count=1, gain=2 → avgGain=2, avgLoss=0
    expect(fn(NA, 9)).toBe(NA); // NA mid-series: top guard → count/avgs untouched
    expect(fn(9.0, 9)).toBe(NA); // count=2, change=−3 → avgGain=1, avgLoss=1.5
    expect(fn(11.0, 9)).toBe(NA); // count=3 → avgGain=4/3, avgLoss=1
    expect(fn(13.0, 9)).toBe(NA); // count=4 → avgGain=1.5, avgLoss=0.75
    expect(fn(8.0, 9)).toBe(NA); // count=5 → avgGain=1.2, avgLoss=1.6
    expect(fn(10.0, 9)).toBe(NA); // count=6 → avgGain=4/3, avgLoss=4/3
    expect(fn(12.0, 9)).toBe(NA); // count=7 → avgGain=10/7, avgLoss=8/7
    expect(fn(12.0, 9)).toBe(NA); // count=8 → avgGain=1.25, avgLoss=1
    // call 10: count=9 == len, change=0 → avgGain=(1.25*8+0)/9=10/9,
    //   avgLoss=(1*8+0)/9=8/9 → rs = (10/9)/(8/9) = 1.25 →
    //   100 − 100/2.25 = 55.555555555555555556 @ DP=20.
    //   Corrupted count (NA advancing state) would produce a DIFFERENT value
    //   (different SMA denominators) — this is 55.555… exactly.
    expect(fn(12.0, 9)).toBe(new Decimal('55.555555555555555556').toNumber());
  });
});

describe('M6 ta.change — Decimal diff exactness', () => {
  it('first call NA, then EXACT bar-to-bar differences; NA mid-series does not advance state', () => {
    const fn = change();
    expect(fn(0.1)).toBe(NA); // first call seeds prev → NA
    expect(fn(0.3)).toBe(new Decimal('0.2').toNumber()); // 0.3−0.1 = 0.2 EXACT
    expect(fn(0.2)).toBe(new Decimal('-0.1').toNumber()); // 0.2−0.3 = −0.1 EXACT
    expect(fn(0.2)).toBe(new Decimal('0').toNumber()); // equal values → 0 EXACT
    expect(fn(1.5)).toBe(new Decimal('1.3').toNumber()); // 1.5−0.2 = 1.3 EXACT
    expect(fn(NA)).toBe(NA); // NA input → NA, prev NOT advanced
    expect(fn(2.0)).toBe(new Decimal('0.5').toNumber()); // 2.0−1.5 = 0.5 EXACT (NA didn't touch prev)
  });

  it('R4 non-finite source → collapses to NA (documented deliberate divergence, do not restore)', () => {
    const fn = change();
    expect(fn(Infinity)).toBe(NA); // seeds prev=Infinity
    expect(fn(0.5)).toBe(NA); // 0.5−Infinity = −Infinity → decimalToPineValue → NA (R4 upgrade vs float leak)
  });
});

describe('M6 ta.crossover / ta.crossunder / ta.cross — Decimal cross exactness', () => {
  // cross state is keyed `cross_<callSiteId>` and SHARED by all three
  // builtins — use a FRESH engine so every function's first call truly seeds.
  const crossAst = parse(
    '//@version=6\nindicator("M6 Cross Exactness", overlay=true)\nplot(close, "c")',
  );
  const crossEngine = new ExecutionEngine(compile(crossAst.ast));

  function builtin(name: string): BuiltinFn {
    const fn = crossEngine.builtins.get(name);
    if (!fn) throw new Error(`${name} not registered`);
    return fn as BuiltinFn;
  }

  it('crossover: false until a true up-cross; decimal-exact boundary diffs', () => {
    const fn = builtin('ta.crossover');
    expect(fn(1.0, 2.0)).toBe(false); // first call seeds → false
    expect(fn(3.0, 2.0)).toBe(true); // −1 < eps, +1 > eps → UP cross
    expect(fn(3.0, 2.0)).toBe(false); // still above → no cross
    expect(fn(1.0, 2.0)).toBe(false); // now below → down, not up
    expect(fn(3.0, 2.0)).toBe(true); // up again
    // decimal-exact: 0.1→0.2 (−0.1), 0.3→0.2 (+0.1) — exact diffs at DP=20
    expect(fn(0.1, 0.2)).toBe(false);
    expect(fn(0.3, 0.2)).toBe(true);
    expect(fn(NA, 1.0)).toBe(false); // NA input → false, state untouched
  });

  it('crossunder: false until a true down-cross', () => {
    const fn = builtin('ta.crossunder');
    expect(fn(2.0, 1.0)).toBe(false); // first call seeds → false
    expect(fn(1.0, 2.0)).toBe(true); // +1 > −eps, −1 < −eps → DOWN cross
    expect(fn(1.0, 2.0)).toBe(false); // still below → no cross
    expect(fn(2.0, 1.0)).toBe(false); // now above → up, not down
    expect(fn(1.0, 2.0)).toBe(true); // down again
  });

  it('cross: true on EITHER up- or down-cross (OR of both branches)', () => {
    const fn = builtin('ta.cross');
    expect(fn(1.0, 2.0)).toBe(false); // first call seeds → false
    expect(fn(3.0, 2.0)).toBe(true); // up-cross
    expect(fn(3.0, 2.0)).toBe(false); // no cross
    expect(fn(1.0, 2.0)).toBe(true); // down-cross
    expect(fn(1.0, 2.0)).toBe(false); // no cross
  });
});
