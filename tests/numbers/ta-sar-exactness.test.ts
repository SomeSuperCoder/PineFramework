/**
 * M7c ta.sar — Decimal SAR exactness + snapshot/rollback safety proof.
 *
 * Locks the fp-final-gate for Parabolic SAR: hand-computed exact SAR values
 * via decimal.js DP=20, pre-init buffer branch, R4 non-finite guards,
 * af-default fallbacks, and a snapshot/rollback correctness test proving
 * the shallow-copy { ...v } path is safe for Decimal fields.
 *
 * Pattern: follows ta-atr-exactness.test.ts — direct engine invocation,
 * bar-context feeding via contextAt, DISJOINT call-site IDs per test,
 * expected values via decimal.js.
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
  '//@version=6\nindicator("M7c SAR Exactness", overlay=true)\nplot(close, "c")',
);
const compiled = compile(ast);

/** Fresh engine per test — sar state (`sar_<callSiteId>`) must not leak across tests. */
function newEngine(): ExecutionEngine {
  return new ExecutionEngine(compiled);
}

type BuiltinFn = (...args: unknown[]) => PineValue;

function sar(engine: ExecutionEngine): BuiltinFn {
  const fn = engine.builtins.get('ta.sar');
  if (!fn) throw new Error('ta.sar not registered');
  return fn as BuiltinFn;
}

interface TestBar {
  high: number;
  low: number;
  close: number;
}

/**
 * Full-history context for bar index i: every series carries bars[0..i], so
 * getRelative(0) = current bar and getRelative(1) = the REAL previous bar
 * (bar 0's getRelative(1) is out-of-bounds → NA → the prevBar fallback).
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

/** Drive ta.sar at bar i against the full history of `bars`. */
function sarAt(
  engine: ExecutionEngine,
  bars: TestBar[],
  i: number,
  start = 0.02,
  inc = 0.02,
  max = 0.2,
): PineValue {
  engine.currentContext = contextAt(bars, i);
  return sar(engine)(start, inc, max);
}

// ---------------------------------------------------------------------------
// Pre-init buffer + init + regular bar tests
// ---------------------------------------------------------------------------

describe('M7c ta.sar — Decimal SAR exactness (fp-final-gate lock)', () => {
  it('pre-init buffer: bar 0 returns low, stores raw bar values in state', () => {
    const engine = newEngine();
    const bars: TestBar[] = [{ high: 10, low: 8, close: 9 }];
    // bar 0: no prevBar → pre-init buffer → return low = 8
    expect(sarAt(engine, bars, 0)).toBe(new Decimal('8').toNumber());
    // Verify state was stored with raw values
    const state = engine.sarState.get('sar_0');
    expect(state).toBeDefined();
    expect(state!.initialized).toBe(false);
    expect(state!.sar.toString()).toBe('8');
    expect(state!.ep.toString()).toBe('10');
    expect(state!.prevSar.toString()).toBe('8');
    expect(state!.prevEp.toString()).toBe('10');
    expect(state!.prevLow1.toString()).toBe('8');
    expect(state!.prevLow2.toString()).toBe('8');
    expect(state!.prevHigh1.toString()).toBe('10');
    expect(state!.prevHigh2.toString()).toBe('10');
    expect(state!.barCount).toBe(1);
  });

  it('pre-init: bar 0 non-finite → bar 1 also pre-init → return low', () => {
    const engine = newEngine();
    const bars: TestBar[] = [
      { high: Number.NaN, low: 8, close: 9 }, // non-finite → NA, state not created
      { high: 12, low: 9.5, close: 11 }, // state created, no valid prevBar → pre-init
    ];
    // bar 0: NaN high → R4 guard → NA
    expect(sarAt(engine, bars, 0)).toBe(NA);
    // State not created for bar 0 (R4 guard returns before state access)
    expect(engine.sarState.has('sar_0')).toBe(false);
    // bar 1: state created, prevBar (bar0) has NaN → hasPrevBar=false → pre-init → return low=9.5
    expect(sarAt(engine, bars, 1)).toBe(new Decimal('9.5').toNumber());
    const state = engine.sarState.get('sar_0');
    expect(state).toBeDefined();
    expect(state!.initialized).toBe(false);
    expect(state!.sar.toString()).toBe('9.5');
    expect(state!.barCount).toBe(1);
  });

  it('known uptrend series → hand-computed EXACT SAR through init + reversals', () => {
    const engine = newEngine();
    // Carefully chosen: bar1 close > prevClose → uptrend init.
    // bar2 low < SAR → reversal to downtrend.
    // bar3 high > SAR → reversal to uptrend.
    // bars 4-5: uptrend continues, SAR clamped by prevLow2 then escapes.
    const bars: TestBar[] = [
      { high: 10, low: 8, close: 9 }, // bar0: pre-init → 8
      { high: 12, low: 9.5, close: 11 }, // bar1: init uptrend: min(9.5, 8) = 8
      { high: 11.5, low: 7, close: 8.6 }, // bar2: reversal ↓: sar = prevEp = 12
      { high: 14, low: 10, close: 13 }, // bar3: reversal ↑: sar = prevEp = 7
      { high: 13.4, low: 11, close: 12 }, // bar4: clamped: min(7.14, 10, 7) = 7
      { high: 12, low: 10.5, close: 11 }, // bar5: escapes: min(7.14, 11, 10) = 7.14
    ];

    // bar0: pre-init → return low
    expect(sarAt(engine, bars, 0)).toBe(new Decimal('8').toNumber());

    // bar1: close=11 > prevClose=9 → uptrend.
    //   sar = min(low=9.5, prevLow=8) = 8.
    expect(sarAt(engine, bars, 1)).toBe(new Decimal('8').toNumber());

    // bar2: uptrend.
    //   sar = 8+0.02*(12-8) = 8.08, clamped to min(8.08, 9.5, 8) = 8.
    //   low=7 < 8 → reversal to down. sar = prevEp = 12.
    expect(sarAt(engine, bars, 2)).toBe(new Decimal('12').toNumber());

    // bar3: downtrend.
    //   sar = 12+0.02*(7-12) = 11.9, clamped to max(11.9, 11.5, 12) = 12.
    //   high=14 > 12 → reversal to up. sar = prevEp = 7.
    expect(sarAt(engine, bars, 3)).toBe(new Decimal('7').toNumber());

    // bar4: uptrend.
    //   sar = 7+0.02*(14-7) = 7.14, clamped to min(7.14, 10, 7) = 7.
    //   low=11 >= 7 → no reversal. high=13.4 < 14 → no ep update.
    expect(sarAt(engine, bars, 4)).toBe(new Decimal('7').toNumber());

    // bar5: uptrend.
    //   sar = 7+0.02*(14-7) = 7.14, clamped to min(7.14, 11, 10) = 7.14.
    expect(sarAt(engine, bars, 5)).toBe(new Decimal('7.14').toNumber());
  });

  it('known downtrend series → hand-computed EXACT SAR with AF acceleration', () => {
    const engine = newEngine();
    // bar1 close < prevClose → downtrend init. Bars 2-4: ep updates, AF accelerates.
    const bars: TestBar[] = [
      { high: 10, low: 8, close: 9 }, // bar0: pre-init → 8
      { high: 11, low: 8.5, close: 8 }, // bar1: init down: max(11,10) = 11
      { high: 10.5, low: 6, close: 7 }, // bar2: ep update: af→0.04
      { high: 9, low: 5, close: 6 }, // bar3: ep update: af→0.06
      { high: 8, low: 5.5, close: 6.5 }, // bar4: no ep update (5.5 > 5)
    ];

    // bar0: pre-init → 8
    expect(sarAt(engine, bars, 0)).toBe(new Decimal('8').toNumber());

    // bar1: close=8 < prevClose=9 → downtrend.
    //   sar = max(high=11, prevHigh=10) = 11.
    expect(sarAt(engine, bars, 1)).toBe(new Decimal('11').toNumber());

    // bar2: sar = 11+0.02*(8-11) = 10.94, clamped to max(10.94, 11, 10) = 11.
    //   high=10.5 <= 11 → no reversal. low=6 < 8 → ep=6, af=0.04.
    expect(sarAt(engine, bars, 2)).toBe(new Decimal('11').toNumber());

    // bar3: sar = 11+0.04*(6-11) = 10.8, clamped to max(10.8, 10.5, 11) = 11.
    //   high=9 <= 11 → no reversal. low=5 < 6 → ep=5, af=0.06.
    expect(sarAt(engine, bars, 3)).toBe(new Decimal('11').toNumber());

    // bar4: sar = 11+0.06*(5-11) = 10.64, clamped to max(10.64, 9, 10.5) = 10.64.
    //   high=8 <= 10.64 → no reversal. low=5.5 >= 5 → no ep update.
    expect(sarAt(engine, bars, 4)).toBe(new Decimal('10.64').toNumber());
  });

  it('AF acceleration in uptrend → exact SAR with af climbing to 0.04, 0.06, 0.08', () => {
    const engine = newEngine();
    // Steady uptrend: each bar makes new high → ep updates, AF accelerates.
    const bars: TestBar[] = [
      { high: 10, low: 8, close: 9 }, // bar0: pre-init → 8
      { high: 12, low: 9.5, close: 11 }, // bar1: init uptrend → 8
      { high: 13, low: 10, close: 12 }, // bar2: ep=13, af→0.04. sar=8
      { high: 14, low: 11, close: 13 }, // bar3: ep=14, af→0.06. sar=8.2
      { high: 15, low: 12, close: 14 }, // bar4: ep=15, af→0.08. sar=8.548
    ];

    expect(sarAt(engine, bars, 0)).toBe(new Decimal('8').toNumber());
    expect(sarAt(engine, bars, 1)).toBe(new Decimal('8').toNumber());

    // bar2: sar=8+0.02*(12-8)=8.08, clamped min(8.08,9.5,8)=8.
    //   high=13>12→ep=13, af=min(0.04,0.2)=0.04
    expect(sarAt(engine, bars, 2)).toBe(new Decimal('8').toNumber());

    // bar3: sar=8+0.04*(13-8)=8.2, clamped min(8.2,10,9.5)=8.2.
    //   high=14>13→ep=14, af=min(0.06,0.2)=0.06
    expect(sarAt(engine, bars, 3)).toBe(new Decimal('8.2').toNumber());

    // bar4: sar=8.2+0.06*(14-8.2)=8.548, clamped min(8.548,11,10)=8.548.
    //   high=15>14→ep=15, af=min(0.08,0.2)=0.08
    expect(sarAt(engine, bars, 4)).toBe(new Decimal('8.548').toNumber());
  });

  // ---------------------------------------------------------------------------
  // R4: non-finite guards
  // ---------------------------------------------------------------------------

  it('R4: non-finite bar → NA, state NOT advanced, next finite bar continues clean', () => {
    const engine = newEngine();
    const bars: TestBar[] = [
      { high: 10, low: 8, close: 9 }, // bar0: pre-init → 8
      { high: 12, low: 9.5, close: 11 }, // bar1: init uptrend → 8
      { high: Number.POSITIVE_INFINITY, low: 7, close: 8.6 }, // bar2: R4 → NA
      { high: 11.5, low: 6, close: 8 }, // bar3: continues from bar1 state
    ];

    expect(sarAt(engine, bars, 0)).toBe(new Decimal('8').toNumber());
    expect(sarAt(engine, bars, 1)).toBe(new Decimal('8').toNumber());

    // bar2: Infinity high → R4 → NA, barCount NOT advanced
    expect(sarAt(engine, bars, 2)).toBe(NA);
    expect(engine.sarState.get('sar_0')!.barCount).toBe(2); // bar0+bar1 only

    // bar3: continues from bar1's state (trend=up, prevSar=8, prevEp=12).
    //   sar=8+0.02*(12-8)=8.08, clamped min(8.08,9.5,8)=8. low=6<8→reversal.
    //   sar=prevEp=12.
    expect(sarAt(engine, bars, 3)).toBe(new Decimal('12').toNumber());
    // barCount advanced to 3 (bar0+bar1+bar3; bar2 was skipped)
    expect(engine.sarState.get('sar_0')!.barCount).toBe(3);
  });

  it('R4: NaN low and -Infinity close → NA, state never created', () => {
    const engine = newEngine();
    let bars: TestBar[] = [{ high: 10, low: Number.NaN, close: 9 }];
    expect(sarAt(engine, bars, 0)).toBe(NA);

    bars = [{ high: 10, low: 8, close: Number.NEGATIVE_INFINITY }];
    expect(sarAt(engine, bars, 0)).toBe(NA);

    // State should NOT be created for these (R4 guard returns before state access)
    expect(engine.sarState.has('sar_0')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // af defaults
  // ---------------------------------------------------------------------------

  it('af defaults: NaN args → 0.02/0.02/0.2', () => {
    const engine = newEngine();
    const bars: TestBar[] = [
      { high: 10, low: 8, close: 9 },
      { high: 12, low: 9.5, close: 11 },
      { high: 13, low: 10, close: 12 },
    ];
    // Pass NaN args — should use defaults
    expect(sarAt(engine, bars, 0, Number.NaN, Number.NaN, Number.NaN)).toBe(
      new Decimal('8').toNumber(),
    );
    expect(sarAt(engine, bars, 1, Number.NaN, Number.NaN, Number.NaN)).toBe(
      new Decimal('8').toNumber(),
    );
    expect(sarAt(engine, bars, 2, Number.NaN, Number.NaN, Number.NaN)).toBe(
      new Decimal('8').toNumber(),
    );
    // Verify afStart/afInc/afMax = defaults in state
    const state = engine.sarState.get('sar_0');
    expect(state!.afStart.toString()).toBe('0.02');
    expect(state!.afInc.toString()).toBe('0.02');
    expect(state!.afMax.toString()).toBe('0.2');
  });

  it('af defaults: Infinity args → 0.02/0.02/0.2', () => {
    const engine = newEngine();
    const bars: TestBar[] = [
      { high: 10, low: 8, close: 9 },
      { high: 12, low: 9.5, close: 11 },
    ];
    sarAt(
      engine,
      bars,
      0,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );
    sarAt(
      engine,
      bars,
      1,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );
    const state = engine.sarState.get('sar_0');
    expect(state!.afStart.toString()).toBe('0.02');
    expect(state!.afInc.toString()).toBe('0.02');
    expect(state!.afMax.toString()).toBe('0.2');
  });
});

// ---------------------------------------------------------------------------
// Snapshot/rollback correctness — the M7c risk verification
// ---------------------------------------------------------------------------

describe('M7c ta.sar — Snapshot/rollback correctness (shallow-copy safety proof)', () => {
  it('snapshot preserves SarStateValue, rollback restores exact Decimal state', () => {
    const engine = newEngine();
    const bars: TestBar[] = [
      { high: 10, low: 8, close: 9 }, // bar0: pre-init → 8
      { high: 12, low: 9.5, close: 11 }, // bar1: init uptrend → 8
      { high: 11.5, low: 7, close: 8.6 }, // bar2: reversal ↓ → 12
      { high: 14, low: 10, close: 13 }, // bar3: reversal ↑ → 7
      { high: 13.4, low: 11, close: 12 }, // bar4: clamped → 7
      { high: 15, low: 11.5, close: 14 }, // bar5: ep update, af→0.04 → 7.14
      { high: 16, low: 12, close: 15 }, // bar6: ep update, af→0.06 → 7.4544
      { high: 14, low: 5, close: 6 }, // bar7: low < sar → reversal ↓ → 16
    ];

    // Execute bars 0-4
    for (let i = 0; i <= 4; i++) {
      sarAt(engine, bars, i);
    }

    const key = 'sar_0';
    const stateAt4 = engine.sarState.get(key)!;
    expect(stateAt4).toBeDefined();

    // Capture pre-advance values (all fields that change in the main loop)
    const snapshot = {
      trend: stateAt4.trend,
      sar: stateAt4.sar.toString(),
      ep: stateAt4.ep.toString(),
      af: stateAt4.af.toString(),
      prevSar: stateAt4.prevSar.toString(),
      prevEp: stateAt4.prevEp.toString(),
      prevLow1: stateAt4.prevLow1.toString(),
      prevLow2: stateAt4.prevLow2.toString(),
      prevHigh1: stateAt4.prevHigh1.toString(),
      prevHigh2: stateAt4.prevHigh2.toString(),
      barCount: stateAt4.barCount,
    };

    // Take snapshot (engine.createSnapshot delegates to state-manager)
    engine.createSnapshot();

    // Execute bars 5-7 (advances state — AF accelerates, EP changes, trend reverses)
    for (let i = 5; i <= 7; i++) {
      sarAt(engine, bars, i);
    }

    // Verify state HAS changed (bars 5-7 mutated it)
    const stateAfterAdvance = engine.sarState.get(key)!;
    expect(stateAfterAdvance.barCount).toBe(8);
    expect(stateAfterAdvance.trend).toBe('down'); // bar7 reversed
    expect(stateAfterAdvance.prevSar.toString()).not.toBe(snapshot.prevSar);
    expect(stateAfterAdvance.ep.toString()).not.toBe(snapshot.ep);

    // Rollback to snapshot
    const ok = engine.rollbackToSnapshot();
    expect(ok).toBe(true);

    // Assert EVERY field matches pre-advance — proves shallow-copy safety
    const stateAfterRollback = engine.sarState.get(key)!;
    expect(stateAfterRollback.trend).toBe(snapshot.trend);
    expect(stateAfterRollback.sar.toString()).toBe(snapshot.sar);
    expect(stateAfterRollback.ep.toString()).toBe(snapshot.ep);
    expect(stateAfterRollback.af.toString()).toBe(snapshot.af);
    expect(stateAfterRollback.prevSar.toString()).toBe(snapshot.prevSar);
    expect(stateAfterRollback.prevEp.toString()).toBe(snapshot.prevEp);
    expect(stateAfterRollback.prevLow1.toString()).toBe(snapshot.prevLow1);
    expect(stateAfterRollback.prevLow2.toString()).toBe(snapshot.prevLow2);
    expect(stateAfterRollback.prevHigh1.toString()).toBe(snapshot.prevHigh1);
    expect(stateAfterRollback.prevHigh2.toString()).toBe(snapshot.prevHigh2);
    expect(stateAfterRollback.barCount).toBe(snapshot.barCount);

    // Verify the engine can continue correctly after rollback
    // After rollback, state = bar4 state (trend=up, prevSar=7, prevEp=14, af=0.02)
    // bar5: sar=7+0.02*(14-7)=7.14, min(7.14,11,10)=7.14. low=11.5>=7.14→no reversal.
    expect(sarAt(engine, bars, 5)).toBe(new Decimal('7.14').toNumber());
  });
});
