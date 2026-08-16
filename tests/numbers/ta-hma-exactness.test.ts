/**
 * M5c TA.HMA EXACTNESS — Decimal state migration (fp-final-gate lock).
 *
 * Locks the M5c migration of `ta.hma` in ta-overlap.ts: the three sliding
 * windows (half, full, diff) now hold Decimal values, WMA weighted sums
 * accumulate EXACTLY at DP=20 (`wSum.plus(buf.half[i].times(weight))`, no
 * Number round-trip), and 2*wmaHalf − wmaFull never goes through IEEE 754 —
 * so ta.hma(0.1, ...) converges to EXACT 0.1 where the legacy float path
 * drifted (0.1*28 = 2.8000000000000003 → /28 = 0.10000000000000002, etc.).
 *
 * Direct engine invocation (same pattern as ta-ema-rma-exactness /
 * ta-sma-exactness): parse → compile → new ExecutionEngine, then call
 * engine.builtins.get('ta.hma') directly. State is keyed by
 * `hma_<len>_<callSiteId>` — tests use DISJOINT lengths so no test observes
 * another test's state. Buffers are created on the FIRST finite call (that
 * call's value IS consumed — unlike ta.ema, no bar is dropped).
 *
 * Warm-up contract (identical to legacy float runtime — window/length
 * threshold logic unchanged by M5c, only the arithmetic became Decimal):
 *   • halfLen = floor(len/2), sqrtLen = floor(sqrt(len)).
 *   • Every call pushes into half (cap halfLen) and full (cap len); a value
 *     is emitted only once half.length >= halfLen AND full.length >= len
 *     AND diff.length >= sqrtLen, where diff grows one element per call from
 *     the call where full first filled (call `len`) — so the first emitted
 *     value is at call `len + sqrtLen - 1`, and calls 1..(len+sqrtLen-2) are
 *     NA.
 *   • Non-finite (NaN/±Infinity) and NA inputs return NA BEFORE the buffer
 *     exists / before any push — they never advance state.
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

const { ast } = parse('//@version=6\nindicator("M5c HMA Exactness", overlay=true)\nplot(close, "c")');
const engine = new ExecutionEngine(compile(ast));

type BuiltinFn = (...args: unknown[]) => PineValue;

function hma(): BuiltinFn {
  const fn = engine.builtins.get('ta.hma');
  if (!fn) throw new Error('ta.hma not registered');
  return fn as BuiltinFn;
}

describe('M5c ta.hma — Decimal window exactness (fp-final-gate lock)', () => {
  it('constant 0.1, len=7 → converges to exactly 0.1 after warm-up (the gate trap)', () => {
    const fn = hma();
    // len=7: halfLen=3, sqrtLen=2 → first value at call len+sqrtLen-1 = 8
    for (let i = 0; i < 7; i++) {
      expect(fn(0.1, 7)).toBe(NA); // calls 1..7 fill half + full windows
    }
    // call 8: full filled at call 7, diff now has 2 elements → emit.
    //   wmaHalf = (0.1+0.2+0.3)/6 = 0.1; wmaFull = (0.1*28)/28 = 0.1;
    //   diff = 2*0.1−0.1 = 0.1; WMA(diff) = (0.1+0.2)/3 = 0.1 EXACTLY
    //   (float path: 0.1*28 = 2.8000000000000003 → wmaFull = 0.10000000000000002)
    expect(fn(0.1, 7)).toBe(0.1);
    // steady state: all windows hold 0.1 → every WMA = 0.1 exactly, forever
    for (let i = 0; i < 25; i++) {
      expect(fn(0.1, 7)).toBe(0.1);
    }
  });

  it('constant 3.0, len=10 → converges to exactly 3.0 after warm-up (no drift)', () => {
    const fn = hma();
    // len=10: halfLen=5, sqrtLen=3 → first value at call 10+3-1 = 12
    for (let i = 0; i < 11; i++) {
      expect(fn(3.0, 10)).toBe(NA);
    }
    expect(fn(3.0, 10)).toBe(3.0);
    for (let i = 0; i < 25; i++) {
      expect(fn(3.0, 10)).toBe(3.0);
    }
  });

  it('mixed window [1,5,1,4,4,10], len=4 → exact 4.0 then 8.1 (locks WMA weights + 2*half−full)', () => {
    const fn = hma();
    // len=4: halfLen=2, sqrtLen=2 → first value at call 4+2-1 = 5
    expect(fn(1.0, 4)).toBe(NA); // call 1: half=[1]
    expect(fn(5.0, 4)).toBe(NA); // call 2: half=[1,5], full=[1,5]
    expect(fn(1.0, 4)).toBe(NA); // call 3: half=[5,1], full=[1,5,1]
    expect(fn(4.0, 4)).toBe(NA); // call 4: full=[1,5,1,4] filled → diff=[3], len 1<2
    // call 5 (4.0): half=[4,4] → wmaHalf=(4+8)/3=4; full=[5,1,4,4] → wmaFull=(5+2+12+16)/10=3.5;
    //   diff=2*4−3.5=4.5; WMA([3,4.5]) = (3+9)/3 = 4 EXACTLY
    expect(fn(4.0, 4)).toBe(new Decimal('4').toNumber());
    // call 6 (10.0): half=[4,10] → wmaHalf=(4+20)/3=8; full=[1,4,4,10] → wmaFull=(1+8+12+40)/10=6.1;
    //   diff=2*8−6.1=9.9; WMA([4.5,9.9]) = (4.5+19.8)/3 = 8.1 EXACTLY
    expect(fn(10.0, 4)).toBe(new Decimal('8.1').toNumber());
  });

  it('R4: Infinity/-Infinity/NaN source → NA, never reaches state, never leaks', () => {
    const fn = hma();
    expect(fn(Infinity, 13)).toBe(NA); // guard returns BEFORE buffer creation
    expect(fn(-Infinity, 13)).toBe(NA);
    expect(fn(NaN, 13)).toBe(NA);
    // len=13: halfLen=6, sqrtLen=3 → first value at call 15 (calls 1..14 NA).
    // The 3 non-finite calls above must NOT have consumed bars — the finite
    // series starts warm-up from call 1.
    for (let i = 0; i < 14; i++) {
      expect(fn(1.0, 13)).toBe(NA);
    }
    expect(fn(1.0, 13)).toBe(1.0); // all windows full of 1.0 → exactly 1.0
  });

  it('NA propagation: NA source/length → NA; len<=0 → NA', () => {
    const fn = hma();
    expect(fn(NA, 16)).toBe(NA); // NA source
    expect(fn(0.5, NA)).toBe(NA); // NA length
    expect(fn(0.5, 0)).toBe(NA); // len<=0
    expect(fn(0.5, -3)).toBe(NA); // len<=0
  });

  it('NA mid-series → NA out, state NOT advanced, next finite continues — no NaN/Infinity leak', () => {
    const fn = hma();
    // len=15: halfLen=7, sqrtLen=3 → first value at call 17 (calls 1..16 NA)
    for (let i = 0; i < 16; i++) {
      expect(fn(1.0, 15)).toBe(NA);
    }
    expect(fn(1.0, 15)).toBe(1.0); // call 17 — all windows 1.0
    // NA mid-series: returns NA, must NOT push into half/full/diff
    expect(fn(NA, 15)).toBe(NA);
    // call 18 (2.0): half=[1×6,2] → wmaHalf=(21+14)/28=1.25; full=[1×14,2] → wmaFull=(105+30)/120=1.125;
    //   diff=2*1.25−1.125=1.375; WMA([1,1,1.375]) = (1+2+4.125)/6 = 1.1875
    //   — finite, no NaN/Infinity leaked from the NA bar
    expect(fn(2.0, 15)).toBe(new Decimal('1.1875').toNumber());
  });
});
