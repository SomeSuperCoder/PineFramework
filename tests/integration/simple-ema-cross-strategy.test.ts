import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
  type StrategyMarkerEntry,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import type { Bar } from '../../src/data/bar.js';

// ---------------------------------------------------------------------------
// Helper: deterministic bar generation with controlled EMA crossover pattern
// ---------------------------------------------------------------------------

/**
 * Creates bars that guarantee at least one EMA crossover and crossunder.
 * Phase 1 (bars 0-29):  Strong uptrend  → fastEMA > slowEMA (long condition)
 * Phase 2 (bars 30-59): Strong downtrend → fastEMA < slowEMA (short condition)
 * Phase 3 (bars 60-89): Strong uptrend  → fastEMA > slowEMA (long condition)
 *
 * With fastEMA=9 and slowEMA=21 the crossover/crossunder should happen
 * a few bars after each phase boundary.
 */
function createCrossoverBars(): Bar[] {
  const bars: Bar[] = [];
  let price = 100;

  for (let i = 0; i < 120; i++) {
    const open = price;
    let close: number;

    if (i < 30) {
      close = open + 2.0;
    } else if (i < 60) {
      close = open - 2.0;
    } else if (i < 90) {
      close = open + 2.0;
    } else {
      close = open - 2.0;
    }

    const high = Math.max(open, close) + 0.5;
    const low = Math.min(open, close) - 0.5;

    bars.push({
      timestamp: 1700000000000 + i * 3600000,
      open,
      high,
      low,
      close,
      volume: 1000,
    });

    price = close;
  }
  return bars;
}

function barsToContext(bars: Bar[]): ExecutionContext[] {
  return bars.map((bar, index) => ({
    barIndex: index,
    barCount: bars.length,
    timestamp: bar.timestamp,
    open: createSeries(
      'open',
      bars.slice(0, index + 1).map((b) => b.open),
    ),
    high: createSeries(
      'high',
      bars.slice(0, index + 1).map((b) => b.high),
    ),
    low: createSeries(
      'low',
      bars.slice(0, index + 1).map((b) => b.low),
    ),
    close: createSeries(
      'close',
      bars.slice(0, index + 1).map((b) => b.close),
    ),
    volume: createSeries(
      'volume',
      bars.slice(0, index + 1).map((b) => b.volume),
    ),
  }));
}

const strategySource = fs.readFileSync('./test_indicators/simple_ema_cross_strategy.pine', 'utf-8');

describe('Simple EMA Cross Strategy – marker analysis', () => {
  let incrementalMarkers: StrategyMarkerEntry[];
  let batchMarkers: StrategyMarkerEntry[];
  let allResults: ReturnType<ExecutionEngine['executeBar']>;
  let batchResult: ReturnType<ExecutionEngine['executeBars']>;

  beforeAll(() => {
    const bars = createCrossoverBars();
    const { ast } = parse(strategySource);
    const compiled = compile(ast);

    // --- Incremental (bar-by-bar) execution ---
    const engine1 = new ExecutionEngine(compiled);
    const contexts1 = barsToContext(bars);
    allResults = [];
    for (const ctx of contexts1) {
      allResults.push(engine1.executeBar(ctx));
    }
    incrementalMarkers = allResults.flatMap((r) => r.strategyMarkers ?? []);

    // --- Batch execution via executeBars() ---
    const engine2 = new ExecutionEngine(compiled);
    const contexts2 = barsToContext(bars);
    batchResult = engine2.executeBars(contexts2);
    batchMarkers = batchResult.strategyMarkers;
  });

  // --- Basic sanity --------------------------------------------------------

  it('compiles and executes all 90 bars without errors', () => {
    const failures = allResults.filter((r) => !r.success);
    expect(failures).toEqual([]);
    expect(allResults).toHaveLength(120);
  });

  it('batch executeBars returns all markers', () => {
    expect(batchResult.success).toBe(true);
    // At minimum we expect: Short entry, Exit Short, Long entry, Exit Long, Short entry
    expect(batchMarkers.length).toBeGreaterThanOrEqual(5);
  });

  // --- Incremental marker correctness -------------------------------------

  it('incremental execution produces at least 5 markers (Short entry, Exit Short, Long entry, Exit Long, Short entry)', () => {
    // Expected sequence: Short entry + Exit Short (reverse) + Long entry + Exit Long (reverse) + Short entry
    expect(incrementalMarkers.length).toBeGreaterThanOrEqual(5);
  });

  it('batch and incremental markers match', () => {
    expect(batchMarkers).toHaveLength(incrementalMarkers.length);
    for (let i = 0; i < batchMarkers.length; i++) {
      expect(batchMarkers[i].type).toBe(incrementalMarkers[i].type);
      expect(batchMarkers[i].name).toBe(incrementalMarkers[i].name);
      expect(batchMarkers[i].direction).toBe(incrementalMarkers[i].direction);
      expect(batchMarkers[i].barIndex).toBe(incrementalMarkers[i].barIndex);
    }
  });

  // --- Entry marker correctness -------------------------------------------

  it('Long entry markers have correct name and direction', () => {
    const entries = incrementalMarkers.filter((m) => m.type === 'entry' && m.direction === 'long');
    expect(entries.length).toBeGreaterThanOrEqual(1);
    for (const e of entries) {
      expect(e.name).toBe('Long');
      expect(e.direction).toBe('long');
      expect(e.action).toBe('buy');
      expect(e.color).toBe('#00FF00');
      expect(e.price).toBeGreaterThan(0);
      expect(e.barIndex).toBeGreaterThanOrEqual(0);
      expect(e.timestamp).toBeGreaterThan(0);
    }
  });

  it('Short entry markers have correct name and direction', () => {
    const entries = incrementalMarkers.filter((m) => m.type === 'entry' && m.direction === 'short');
    expect(entries.length).toBeGreaterThanOrEqual(1);
    for (const e of entries) {
      expect(e.name).toBe('Short');
      expect(e.direction).toBe('short');
      expect(e.action).toBe('sell');
      expect(e.color).toBe('#FF0000');
      expect(e.price).toBeGreaterThan(0);
    }
  });

  // --- Close marker correctness (reversal closes) -------------------------

  it('close markers use entry name and have reverse comment', () => {
    const closes = incrementalMarkers.filter((m) => m.type === 'close');
    expect(closes.length).toBeGreaterThanOrEqual(2);
    for (const c of closes) {
      expect(c.name).toMatch(/^Exit (Long|Short)$/);
      expect(['long', 'short']).toContain(c.direction);
      expect(c.comment).toBe('reverse');
    }
  });

  // --- Marker sequence correctness ----------------------------------------

  it('entries alternate: Long, then Short, then Long', () => {
    const entries = incrementalMarkers.filter((m) => m.type === 'entry');
    expect(entries.length).toBeGreaterThanOrEqual(3);
    // First entry is Long (uptrend hits first crossover)
    expect(entries[0].direction).toBe('long');
    expect(entries[0].name).toBe('Long');
    expect(entries[1].direction).toBe('short');
    expect(entries[2].direction).toBe('long');
  });

  it('each reversal entry is preceded by a close', () => {
    const entries = incrementalMarkers.filter((m) => m.type === 'entry');
    const closes = incrementalMarkers.filter((m) => m.type === 'close');

    // Second and third entries should have a preceding close
    for (let i = 1; i < entries.length; i++) {
      const prevClose = closes.find((c) => c.barIndex <= entries[i].barIndex);
      expect(prevClose).toBeDefined();
    }
  });

  // --- No spurious markers ------------------------------------------------

  it('no liquidation markers (margin rate is 0 by default)', () => {
    const liquidations = incrementalMarkers.filter((m) => m.comment === 'Margin liquidation');
    expect(liquidations).toHaveLength(0);
  });

  it('no order markers (only market entries, no limit/stop)', () => {
    const orders = incrementalMarkers.filter((m) => m.type === 'order');
    expect(orders).toHaveLength(0);
  });

  // --- Shape analysis -----------------------------------------------------
  // Note: plot() writes to outputs, not shapes. Shapes are only from plotshape/plotchar.

  it('no shapes from plot() calls (plot writes to outputs, not shapes)', () => {
    const allShapes = allResults.flatMap((r) => r.shapes ?? []);
    expect(allShapes).toHaveLength(0);
  });

  // --- Full marker dump for manual inspection -----------------------------

  it('logs all markers for inspection', () => {
    console.log('--- Strategy Marker Summary (incremental) ---');
    console.log(`Total markers: ${incrementalMarkers.length}`);
    for (const m of incrementalMarkers) {
      console.log(
        `[bar ${String(m.barIndex).padStart(3)}] ${m.type.padEnd(6)} ${m.direction.padEnd(6)} ${m.name.padEnd(12)} price=${m.price.toFixed(2)} comment=${m.comment ?? 'none'}`,
      );
    }
    console.log(`\n--- Batch result markers: ${batchMarkers.length} ---`);
  });
});
