import { describe, it, expect } from 'vitest';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import { createTrendBars, prependBars } from '../helpers/deterministicBars.js';
import { EVERY_BAR_ALERT_SOURCE } from '../fixtures/every-bar-alert.js';

/**
 * Helper: run indicator source over bars, return engine + result.
 */
function runEngine(source: string, bars: ReturnType<typeof createTrendBars>) {
  const { ast } = parse(source);
  const compiled = compile(ast);
  const engine = new ExecutionEngine(compiled);
  const contexts = bars.map((bar, i) => ({
    barIndex: i,
    barCount: bars.length,
    timestamp: bar.timestamp,
    open: createSeries(
      'open',
      bars.slice(0, i + 1).map((b) => b.open),
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
      bars.slice(0, i + 1).map((b) => b.volume),
    ),
  }));
  const result = engine.executeBars(contexts);
  return { engine, bars, result };
}

describe('AlertTrigger index alignment', () => {
  // ---------------------------------------------------------------------------
  // 2.1 — Every bar produces triggers within bounds and matching timestamps.
  // ---------------------------------------------------------------------------
  it('every alert trigger barIndex is within bounds and matches bar timestamps', () => {
    const N = 500;
    const bars = createTrendBars({ count: N, seed: 42, trend: 'sine-wave' });
    const { result } = runEngine(EVERY_BAR_ALERT_SOURCE, bars);

    expect(result.success).toBe(true);
    expect(result.alertTriggers).toBeDefined();
    expect(result.alertTriggers!.length).toBeGreaterThan(0);

    for (const trigger of result.alertTriggers!) {
      // barIndex must be a valid index into the bars array
      expect(trigger.barIndex).toBeGreaterThanOrEqual(0);
      expect(trigger.barIndex).toBeLessThan(N);

      // The bar at that index must have the same timestamp as the trigger
      expect(bars[trigger.barIndex]!.timestamp).toBe(trigger.timestamp);
    }
  });

  // ---------------------------------------------------------------------------
  // 2.2 — barIndex zero-indexes from the first bar.
  // ---------------------------------------------------------------------------
  it('barIndex zero-indexes from the first bar', () => {
    const N = 500;
    const bars = createTrendBars({ count: N, seed: 42, trend: 'sine-wave' });
    const { result } = runEngine(EVERY_BAR_ALERT_SOURCE, bars);

    expect(result.success).toBe(true);

    // Since EVERY_BAR_ALERT triggers on close==close (always true),
    // we should have exactly N triggers (one per bar).
    expect(result.alertTriggers!.length).toBe(N);

    // First trigger should have barIndex 0, last should have barIndex N-1
    expect(result.alertTriggers![0]!.barIndex).toBe(0);
    expect(result.alertTriggers![N - 1]!.barIndex).toBe(N - 1);

    // Every trigger.barIndex should equal its position in the triggers array
    // (since every bar triggers exactly once in order).
    for (let i = 0; i < result.alertTriggers!.length; i++) {
      expect(result.alertTriggers![i]!.barIndex).toBe(i);
    }
  });

  // ---------------------------------------------------------------------------
  // 2.3 — Prepend re-execute: triggers stay valid when more bars are prepended.
  // ---------------------------------------------------------------------------
  it('survives prepend + re-execute with valid barIndex values', () => {
    const N = 500;
    const PREPEND = 200;

    // 1. Execute on initial 500 bars
    const initialBars = createTrendBars({ count: N, seed: 42, trend: 'sine-wave' });
    const { result: initialResult } = runEngine(EVERY_BAR_ALERT_SOURCE, initialBars);
    expect(initialResult.success).toBe(true);
    expect(initialResult.alertTriggers!.length).toBe(N);

    // 2. Prepend 200 bars → total 700
    const largerBars = prependBars(initialBars, PREPEND);
    expect(largerBars.length).toBe(N + PREPEND);

    // 3. Re-execute on the larger set
    const { result: reResult } = runEngine(EVERY_BAR_ALERT_SOURCE, largerBars);
    expect(reResult.success).toBe(true);
    expect(reResult.alertTriggers!.length).toBe(N + PREPEND);

    // 4. Verify all barIndex values are valid indices within the 700-bar array
    for (const trigger of reResult.alertTriggers!) {
      expect(trigger.barIndex).toBeGreaterThanOrEqual(0);
      expect(trigger.barIndex).toBeLessThan(N + PREPEND);
      expect(largerBars[trigger.barIndex]!.timestamp).toBe(trigger.timestamp);
    }

    // 5. The original first bar (index 0 in initial) should now be at index PREPEND
    //    The trigger for the first original bar should have barIndex = PREPEND
    const firstOriginalTrigger = reResult.alertTriggers!.find(
      (t) => t.timestamp === initialBars[0]!.timestamp,
    );
    expect(firstOriginalTrigger).toBeDefined();
    expect(firstOriginalTrigger!.barIndex).toBe(PREPEND);
  });
});
