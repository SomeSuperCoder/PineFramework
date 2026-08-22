/**
 * M7b TA.SUPERTREND EXACTNESS — Decimal state migration (fp-final-gate lock).
 *
 * Locks the M7b migration of `ta.supertrend` in ta-volatility.ts:
 *
 *   • TR is computed EXACTLY at DP=20 (same 3-term max as ta.tr/ta.atr, bar-0
 *     prevClose fallback to close, NaN close[1] falls back to close too).
 *   • The internal ATR is the exact seed-then-Wilder RMA of those TRs —
 *     count-1 seed, count ≤ period incremental-SMA warm-up (→ [NA,NA] AND
 *     prevUpper/prevLower reset to null), then (prev*(period−1)+tr)/period —
 *     all Decimal end-to-end, no Number round-trip per bar. A CONSTANT true
 *     range therefore converges to EXACTLY that constant where the legacy
 *     float iteration drifted (10.1−8.2 = 1.8999999999999995 in IEEE 754).
 *   • Band math is exact: hl2 = (high+low)/2, upper = hl2 + mult·atr,
 *     lower = hl2 − mult·atr, finalUpper = min(upper, prevUpper),
 *     finalLower = max(lower, prevLower), st = close > finalUpper ?
 *     finalLower : finalUpper, direction = close >= st ? 1 : -1. prevUpper/
 *     prevLower are stored Decimal | null so band-following compares exact
 *     decimals across bars (execution-engine.ts supertrendState widening).
 *   • Return is the [st, direction] tuple; decimalToPineValue double-guards
 *     the exit (decimal NaN/±Inf AND JS Number overflow → NA).
 *
 * Direct engine invocation (same pattern as ta-atr-exactness / ta-ema-rma-
 * exactness): parse → compile → new ExecutionEngine, then call
 * engine.builtins.get('ta.supertrend') directly. The builtin READS the bar
 * context (ctx.high/low/close), so each call sets engine.currentContext to a
 * context whose series carry the FULL bar history up to index i
 * (bars.slice(0, i+1)) — that is what makes close[1] REAL from bar 1 onward
 * while bar 0 still hits the no-prevClose fallback.
 *
 * State isolation: supertrend state is keyed `st_<atrPeriod>_<callSiteId>`
 * and persists on the engine — each `it` runs on a FRESH ExecutionEngine
 * (compile once, new engine per test), so no test observes another test's
 * state regardless of period.
 *
 * Warm-up contract: atrCount==1 (bar 0) seeds atrPrev = tr and returns
 * [NA,NA]; bars 1..period−1 (count 2..period) run the incremental SMA and
 * return [NA,NA] — exactly `period` NA bars total (bars 0..period−1); the
 * first value is emitted on bar period (count = period+1) — the Wilder
 * recursion. Every warm-up bar ALSO resets prevUpper/prevLower to null, so
 * the first emitted value always uses the raw upper/lower bands.
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

const { ast } = parse(
  '//@version=6\nindicator("M7b Supertrend Exactness", overlay=true)\nplot(close, "c")',
);
const compiled = compile(ast);

/** Fresh engine per test — supertrend state (`st_<period>_<callSiteId>`) must not leak across tests. */
function newEngine(): ExecutionEngine {
  return new ExecutionEngine(compiled);
}

type BuiltinFn = (...args: unknown[]) => PineValue;

function supertrend(engine: ExecutionEngine): BuiltinFn {
  const fn = engine.builtins.get('ta.supertrend');
  if (!fn) throw new Error('ta.supertrend not registered');
  return fn as BuiltinFn;
}

/** Minimal OHLCV data for the bar context — only high/low/close matter to ta.supertrend. */
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
    open: createSeries(
      'open',
      bars.slice(0, i + 1).map((b) => b.close),
    ),
    high: createSeries(
      'high',
      bars.slice(0, i + 1).map((b) => b.high),
    ),
    low: createSeries(
      'low',
      bars.slice(0, i + 1).map((b) => b.low),
    ),
    close: createSeries(
      'close',
      bars.slice(0, i + 1).map((b) => b.close),
    ),
    volume: createSeries(
      'volume',
      bars.slice(0, i + 1).map(() => 1000),
    ),
  };
}

/** ta.supertrend returns [st, direction] — a 2-tuple of PineValues. */
type SuperTrendTuple = [PineValue, PineValue];

/** Drive ta.supertrend(factor, atrPeriod) at bar i against the full history of `bars`. */
function stAt(
  engine: ExecutionEngine,
  bars: TestBar[],
  i: number,
  factor: PineValue,
  atrPeriod: PineValue,
): SuperTrendTuple {
  engine.currentContext = contextAt(bars, i);
  return supertrend(engine)(factor, atrPeriod) as SuperTrendTuple;
}

describe('M7b ta.supertrend — Decimal band exactness (fp-final-gate lock)', () => {
  it('constant series → tr constant → internal ATR converges EXACTLY → band/line exact, direction stable', () => {
    const engine = newEngine();
    // Constant bars: tr = 1.9 every bar (bar0 fallback + bars≥1 real prevClose).
    // 10.1−8.2 is 1.8999999999999995 in IEEE 754 — the legacy float ATR never
    // lands exactly 1.9, so the legacy band drifted; the Decimal ATR is exact.
    const bars: TestBar[] = Array.from({ length: 40 }, () => ({
      high: 10.1,
      low: 8.2,
      close: 9.3,
    }));
    // period=7 warm-up: bar0 seed → NA, bars 1..6 (count 2..7 ≤ 7) → NA —
    // exactly `period` NA bars (bars 0..6), first value on bar period
    // (count=8 → Wilder). Every warm-up bar also resets prevUpper/Lower.
    for (let i = 0; i < 7; i++) {
      expect(stAt(engine, bars, i, 3, 7)).toEqual([NA, NA]);
    }
    // bar7: atr converges to 1.9 exactly (constant series → TR constant).
    // PineScript convention: direction = -1 (uptrend), close >= st → -1.
    // close 9.3 < 14.85 → direction = 1 (downtrend).
    expect(stAt(engine, bars, 7, 3, 7)).toEqual([new Decimal('14.85').toNumber(), 1]);
    // recursion keeps atr = 1.9 forever → [14.85, 1] stable, no drift
    for (let i = 8; i < bars.length; i++) {
      expect(stAt(engine, bars, i, 3, 7)).toEqual([new Decimal('14.85').toNumber(), 1]);
    }
  });

  it('known mixed series → hand-computed EXACT band-following (conditional ratchet) + trend flip', () => {
    const engine = newEngine();
    // period=2, mult=1. prevClose from getRelative(1) (real previous bar close).
    // Conditional band-following:
    // upper only tightens when close[1] < prevUpper; lower only tightens when
    // close[1] > prevLower.
    const bars: TestBar[] = [
      { high: 10, low: 8, close: 9 }, // tr=max(2,1,1)=2 → count=1 → NA
      { high: 12, low: 9.5, close: 11 }, // prevClose=9, tr=max(2.5,3,0.5)=3 → count=2 ≤ 2 → NA
      { high: 11.5, low: 7, close: 8.6 }, // prevClose=11, tr=max(4.5,0.5,4)=4.5 → count=3 → atr=(2.5+4.5)/2=3.5
      { high: 14, low: 10, close: 13 }, // prevClose=8.6, tr=max(4,5.4,1.4)=5.4 → atr=(3.5+5.4)/2=4.45
      { high: 13.4, low: 11, close: 12 }, // prevClose=13, tr=max(2.4,0.4,2)=2.4 → atr=(4.45+2.4)/2=3.425
    ];
    // bar0/bar1: warm-up → [NA,NA]
    expect(stAt(engine, bars, 0, 1, 2)).toEqual([NA, NA]);
    expect(stAt(engine, bars, 1, 1, 2)).toEqual([NA, NA]);
    // bar2: atr=3.5, hl2=9.25 → upper=12.75, lower=5.75 (prev null).
    // prevDirection=1 (init downtrend), close 8.6 < upper → st=12.75, dir=1.
    expect(stAt(engine, bars, 2, 1, 2)).toEqual([new Decimal('12.75').toNumber(), 1]);
    // bar3: atr=4.45, hl2=12 → upper=16.45, lower=7.55.
    // close[1]=8.6 < prevUpper=12.75 → finalUpper=min(16.45,12.75)=12.75.
    // close[1]=8.6 > prevLower=5.75 → finalLower=max(7.55,5.75)=7.55.
    // close 13 > 12.75 → TREND FLIP: st=finalLower=7.55, dir=-1.
    expect(stAt(engine, bars, 3, 1, 2)).toEqual([new Decimal('7.55').toNumber(), -1]);
    // bar4: atr=3.425, hl2=12.2 → upper=15.625, lower=8.775.
    // close[1]=13 > prevUpper=12.75 → finalUpper=15.625 (reset).
    // close[1]=13 > prevLower=7.55 → finalLower=max(8.775,7.55)=8.775.
    // close 12 > finalLower=8.775 → stays uptrend: st=8.775, dir=-1.
    expect(stAt(engine, bars, 4, 1, 2)).toEqual([new Decimal('8.775').toNumber(), -1]);
  });

  it('supertrendState — Decimal|null widening: warm-up resets prevUpper/prevLower to null, emitted bands are exact Decimals', () => {
    // Warm-up-only engine: state exists, prevUpper/prevLower are null after
    // every NA bar (the reset contract), atrPrev holds the seed.
    const warm = newEngine();
    const bars: TestBar[] = Array.from({ length: 3 }, () => ({
      high: 10.1,
      low: 8.2,
      close: 9.3,
    }));
    for (let i = 0; i < 3; i++) {
      stAt(warm, bars, i, 3, 7);
    }
    const warmState = warm.supertrendState.get('st_7_0');
    expect(warmState).toBeDefined();
    expect(warmState!.atrCount).toBe(3);
    expect(warmState!.prevUpper).toBeNull();
    expect(warmState!.prevLower).toBeNull();
    expect(warmState!.atrPrev.eq(new Decimal('1.9'))).toBe(true);

    // Fully-warmed engine: prevUpper/prevLower are EXACT Decimal bands.
    const engine = newEngine();
    for (let i = 0; i < 40; i++) {
      stAt(engine, bars, i, 3, 7);
    }
    const state = engine.supertrendState.get('st_7_0');
    expect(state).toBeDefined();
    expect(state!.atrCount).toBe(40);
    expect(state!.atrPrev.eq(new Decimal('1.9'))).toBe(true);
    expect(state!.prevUpper).toBeInstanceOf(Decimal);
    expect(state!.prevUpper!.eq(new Decimal('14.85'))).toBe(true);
    expect(state!.prevLower).toBeInstanceOf(Decimal);
    expect(state!.prevLower!.eq(new Decimal('3.45'))).toBe(true);
  });

  it('R4: non-finite high/low/close → [NA,NA] before state access — state NOT advanced, next finite continues clean', () => {
    const engine = newEngine();
    // bar0: current close NaN → [NA,NA]
    let bars: TestBar[] = [{ high: 10.1, low: 8.2, close: Number.NaN }];
    expect(stAt(engine, bars, 0, 3, 2)).toEqual([NA, NA]);
    // bar0: current high Infinity → [NA,NA]
    bars = [{ high: Number.POSITIVE_INFINITY, low: 8.2, close: 9.3 }];
    expect(stAt(engine, bars, 0, 3, 2)).toEqual([NA, NA]);
    // bar0: current low -Infinity → [NA,NA]
    bars = [{ high: 10.1, low: Number.NEGATIVE_INFINITY, close: 9.3 }];
    expect(stAt(engine, bars, 0, 3, 2)).toEqual([NA, NA]);

    // State non-advance (period=2): the Infinity bar must NOT bump atrCount.
    const engine2 = newEngine();
    const mixed: TestBar[] = [
      { high: 10, low: 8, close: 9 }, // tr=2 → count=1 → NA
      { high: Number.POSITIVE_INFINITY, low: 8, close: 9 }, // R4 → NA, count must NOT advance
      { high: 12, low: 9.5, close: 11 }, // tr=3 → count=2 ≤ 2 → warm-up → NA
      { high: 13.4, low: 11, close: 12 }, // tr=2.4 → count=3 > 2 → atr=(2.5+2.4)/2=2.45
    ];
    expect(stAt(engine2, mixed, 0, 3, 2)).toEqual([NA, NA]);
    expect(stAt(engine2, mixed, 1, 3, 2)).toEqual([NA, NA]); // non-finite → NA before state access
    // If the Infinity bar had advanced count, bar2 would be count=3 > 2 →
    // an emitted value. Instead count is STILL 2 → warm-up → [NA,NA].
    expect(stAt(engine2, mixed, 2, 3, 2)).toEqual([NA, NA]);
    // bar3: count=3 → atr=(2.5*1+2.4)/2=2.45. hl2=12.2 → upper=12.2+7.35=19.55,
    // lower=12.2-7.35=4.85 (mult=3). st: 12 > 19.55? NO → 19.55, dir=1.
    expect(stAt(engine2, mixed, 3, 3, 2)).toEqual([new Decimal('19.55').toNumber(), 1]);

    // NaN close[1] falls back to close (period=1 → Wilder = TR itself).
    // The NaN-close bar (bar1) does NOT advance state (R4 guard fires before
    // state access) — so the seed is bar0's tr=2, and bar2's prevClose is
    // bar1's NaN close → fallback close=11 → tr = max(2.5, |12.5−11|=1.5,
    // |10−11|=1) = 2.5. count=2 > 1 → atr=(2*0+2.5)/1=2.5. hl2=11.25 →
    // upper=18.75, lower=3.75. st: 11 > 18.75? NO → 18.75, dir=1. Without
    // the fallback, tr would be NaN → [NA,NA] — so [18.75,1] proves it.
    const engine3 = newEngine();
    const nanClose: TestBar[] = [
      { high: 10, low: 8, close: 9 }, // finite → count=1 seed → NA
      { high: 12.5, low: 10, close: Number.NaN }, // R4 → [NA,NA], count stays 1
      { high: 12.5, low: 10, close: 11 }, // prevClose=NaN → fallback close=11
    ];
    expect(stAt(engine3, nanClose, 0, 3, 1)).toEqual([NA, NA]);
    expect(stAt(engine3, nanClose, 1, 3, 1)).toEqual([NA, NA]);
    expect(stAt(engine3, nanClose, 2, 3, 1)).toEqual([new Decimal('18.75').toNumber(), 1]);
  });

  it('R5: factor non-finite → mult defaults 3.0; atrPeriod non-number → Math.trunc default 10; atrPeriod ≤ 0 → [NA,NA]', () => {
    const bars: TestBar[] = Array.from({ length: 20 }, () => ({
      high: 10.1,
      low: 8.2,
      close: 9.3,
    }));
    // factor NA / NaN / +Infinity → mult = 3.0. Constant series (period=7):
    // bar7 upper = 9.15 + 3*1.9 = 14.85 → st=14.85, dir=1. If mult were 0 the
    // band would collapse to hl2=9.15 and close 9.3 would flip the trend (st
    // = lower = 9.15, dir=-1) — so [14.85,1] proves the 3.0 default. (Legacy
    // code let +Infinity through as mult=Infinity → guardFinite → NA; the
    // isFiniteNumber guard now defaults it to 3.0 — the R5 improvement.)
    const engineFactorNA = newEngine();
    for (let i = 0; i < 7; i++) {
      expect(stAt(engineFactorNA, bars, i, NA, 7)).toEqual([NA, NA]);
    }
    expect(stAt(engineFactorNA, bars, 7, NA, 7)).toEqual([new Decimal('14.85').toNumber(), 1]);
    const engineFactorNaN = newEngine();
    for (let i = 0; i < 7; i++) {
      expect(stAt(engineFactorNaN, bars, i, Number.NaN, 7)).toEqual([NA, NA]);
    }
    expect(stAt(engineFactorNaN, bars, 7, Number.NaN, 7)).toEqual([
      new Decimal('14.85').toNumber(),
      1,
    ]);
    const engineFactorInf = newEngine();
    for (let i = 0; i < 7; i++) {
      expect(stAt(engineFactorInf, bars, i, Number.POSITIVE_INFINITY, 7)).toEqual([NA, NA]);
    }
    expect(stAt(engineFactorInf, bars, 7, Number.POSITIVE_INFINITY, 7)).toEqual([
      new Decimal('14.85').toNumber(),
      1,
    ]);

    // atrPeriod non-number (NA) → period defaults to 10 → 10 NA bars (0..9),
    // first value on bar 10 (still [14.85,1] on the constant series).
    const enginePeriodNA = newEngine();
    for (let i = 0; i < 10; i++) {
      expect(stAt(enginePeriodNA, bars, i, 3, NA)).toEqual([NA, NA]);
    }
    expect(stAt(enginePeriodNA, bars, 10, 3, NA)).toEqual([new Decimal('14.85').toNumber(), 1]);

    // atrPeriod ≤ 0 → [NA,NA] on a finite bar, every bar.
    const enginePeriodZero = newEngine();
    expect(stAt(enginePeriodZero, bars, 5, 3, 0)).toEqual([NA, NA]);
    const enginePeriodNeg = newEngine();
    expect(stAt(enginePeriodNeg, bars, 5, 3, -3)).toEqual([NA, NA]);
  });
});
