import { describe, it, expect } from '@jest/globals';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import { createTrendBars, prependBars } from '../helpers/deterministicBars.js';
import { EVERY_BAR_ALERT_SOURCE, thresholdAlertSource } from '../fixtures/every-bar-alert.js';
import { HHLL_SOURCE } from '../fixtures/higher-high-lower-low.js';
import { Viewport } from '../../frontend/src/chart/Viewport.js';
import type { CandlestickData, AlertTriggerData } from '../../frontend/src/chart/types.js';

// ─── Helpers ──────────────────────────────────────────────────────

function runEngine(source: string, bars: ReturnType<typeof createTrendBars>) {
  const { ast } = parse(source);
  const compiled = compile(ast);
  const engine = new ExecutionEngine(compiled);
  const contexts = bars.map((bar, i) => ({
    barIndex: i,
    barCount: bars.length,
    timestamp: bar.timestamp,
    open: createSeries('open', bars.slice(0, i + 1).map((b) => b.open)),
    high: createSeries('high', bars.slice(0, i + 1).map((b) => b.high)),
    low: createSeries('low', bars.slice(0, i + 1).map((b) => b.low)),
    close: createSeries('close', bars.slice(0, i + 1).map((b) => b.close)),
    volume: createSeries('volume', bars.slice(0, i + 1).map((b) => b.volume)),
  }));
  const result = engine.executeBars(contexts);
  return { engine, bars, result };
}

function barsToCandles(bars: ReturnType<typeof createTrendBars>): CandlestickData[] {
  return bars.map((b) => ({
    time: Math.floor(b.timestamp / 1000),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));
}

// ─── Tests ────────────────────────────────────────────────────────

describe('Alert trigger end-to-end pipeline', () => {
  // -----------------------------------------------------------------------
  // 5.1 — Full pipeline: known price cross → triggers match expected bars
  // -----------------------------------------------------------------------
  it('produces triggers only for bars where close > threshold', () => {
    const THRESHOLD = 105;
    const N = 500;
    const bars = createTrendBars({ count: N, seed: 42, trend: 'linear-up' });
    const { result } = runEngine(thresholdAlertSource(THRESHOLD), bars);

    expect(result.success).toBe(true);
    expect(result.alertTriggers).toBeDefined();

    // Verify every trigger corresponds to a bar with close > threshold
    for (const trigger of result.alertTriggers!) {
      const bar = bars[trigger.barIndex]!;
      expect(bar.close).toBeGreaterThan(THRESHOLD);
      expect(bar.timestamp).toBe(trigger.timestamp);
    }

    // Verify no trigger for bars where close <= threshold
    // (the every-bar-alert trigger fires exactly once per bar, so every trigger-having bar
    //  should have close > threshold, and bars with close <= threshold should have no trigger)
    for (let i = 0; i < bars.length; i++) {
      const hasTrigger = result.alertTriggers!.some((t) => t.barIndex === i);
      if (bars[i]!.close > THRESHOLD) {
        expect(hasTrigger).toBe(true);
      }
    }

    console.log(
      `[5.1] ${result.alertTriggers!.length} triggers out of ${N} bars (close > ${THRESHOLD})`,
    );
  });

  // -----------------------------------------------------------------------
  // 5.1 (cont.) — Simulate frontend state: Viewport + CandlestickData
  // -----------------------------------------------------------------------
  it('trigger barIndex maps to valid pixel positions in a realistic viewport', () => {
    const N = 500;
    const bars = createTrendBars({ count: N, seed: 42, trend: 'linear-up' });
    const candles = barsToCandles(bars);
    const { result } = runEngine(thresholdAlertSource(105), bars);

    expect(result.success).toBe(true);

    // Simulate frontend state: viewport scrolled to end
    const viewport = new Viewport(8);
    viewport.setTotalBars(N);
    viewport.scrollTo(N - 1, 800);
    const visible = viewport.getVisibleRange();
    // visible.start is the first fully visible bar; bars before it have negative pixels

    for (const trigger of result.alertTriggers!) {
      expect(trigger.barIndex).toBeGreaterThanOrEqual(0);
      expect(trigger.barIndex).toBeLessThan(candles.length);

      const pixelX = viewport.barIndexToPixel(trigger.barIndex);
      // Bars before visible.start will have negative pixels — that is correct
      // (they are scrolled off to the left). Bars at or after visible.start
      // must have non-negative pixel positions.
      if (trigger.barIndex >= visible.start) {
        expect(pixelX).toBeGreaterThanOrEqual(0);
      }
      // Sanity: no pixel should exceed a generous upper bound
      expect(pixelX).toBeLessThan(2000);
    }

    console.log(
      `[5.1b] ${result.alertTriggers!.length} triggers mapped, visible range [${visible.start}, ${visible.end})`,
    );
  });

  // -----------------------------------------------------------------------
  // 5.2 — Prepend scenario: triggers still valid after re-execute on larger set
  // -----------------------------------------------------------------------
  it('handles prepend + re-execute with valid viewport mapping', () => {
    const N = 500;
    const PREPEND = 200;

    // Use EVERY_BAR_ALERT (triggers on every bar) so we can reliably find
    // the trigger for a specific bar by timestamp.
    const initialBars = createTrendBars({ count: N, seed: 42, trend: 'linear-up' });
    const { result: firstResult } = runEngine(EVERY_BAR_ALERT_SOURCE, initialBars);
    const firstTriggerCount = firstResult.alertTriggers!.length;
    expect(firstTriggerCount).toBe(N);

    // Prepend 200 bars and re-execute
    const largerBars = prependBars(initialBars, PREPEND);
    expect(largerBars.length).toBe(N + PREPEND);
    const { result: secondResult } = runEngine(EVERY_BAR_ALERT_SOURCE, largerBars);

    // All barIndex values must be valid for the larger set
    for (const trigger of secondResult.alertTriggers!) {
      expect(trigger.barIndex).toBeGreaterThanOrEqual(0);
      expect(trigger.barIndex).toBeLessThan(N + PREPEND);
      expect(largerBars[trigger.barIndex]!.timestamp).toBe(trigger.timestamp);
    }

    // The original first bar's trigger should now have barIndex = PREPEND
    const origFirstBarTrigger = secondResult.alertTriggers!.find(
      (t) => t.timestamp === initialBars[0]!.timestamp,
    );
    expect(origFirstBarTrigger).toBeDefined();
    expect(origFirstBarTrigger!.barIndex).toBe(PREPEND);

    // Verify viewport mapping for triggers within the visible range
    const viewport = new Viewport(8);
    viewport.setTotalBars(N + PREPEND);
    viewport.scrollTo(N + PREPEND - 1, 800);
    const visible = viewport.getVisibleRange();
    for (const trigger of secondResult.alertTriggers!) {
      const px = viewport.barIndexToPixel(trigger.barIndex);
      if (trigger.barIndex >= visible.start) {
        expect(px).toBeGreaterThanOrEqual(0);
      }
    }

    console.log(
      `[5.2] ${firstTriggerCount} triggers on 500 bars → ${secondResult.alertTriggers!.length} triggers on ${N + PREPEND} bars after prepend`,
    );
  });

  // -----------------------------------------------------------------------
  // 5.3 — real higher-high-lower-low.pine script on 1000 bars
  // -----------------------------------------------------------------------
  it('higher-high-lower-low.pine produces valid triggers on 1000 bars', () => {
    const source = HHLL_SOURCE;
    const bars = createTrendBars({ count: 1000, seed: 42, trend: 'sine-wave' });
    const { result } = runEngine(source, bars);

    expect(result.success).toBe(true);
    expect(result.alertTriggers).toBeDefined();
    expect(result.alertTriggers!.length).toBeGreaterThan(0);

    // All barIndex values must be valid
    for (const trigger of result.alertTriggers!) {
      expect(trigger.barIndex).toBeGreaterThanOrEqual(0);
      expect(trigger.barIndex).toBeLessThan(1000);
      expect(bars[trigger.barIndex]!.timestamp).toBe(trigger.timestamp);
    }

    // Compute and log trigger-per-bar distribution
    const triggersPerBar = new Map<number, number>();
    for (const trigger of result.alertTriggers!) {
      triggersPerBar.set(trigger.barIndex, (triggersPerBar.get(trigger.barIndex) ?? 0) + 1);
    }

    const counts = [...triggersPerBar.values()];
    const maxPerBar = Math.max(...counts);
    const barsWithTriggers = triggersPerBar.size;
    const pctWithTriggers = ((barsWithTriggers / 1000) * 100).toFixed(1);

    console.log(`[5.3] higher-high-lower-low.pine on 1000 bars:
  Total triggers: ${result.alertTriggers!.length}
  Bars with at least 1 trigger: ${barsWithTriggers} (${pctWithTriggers}%)
  Max triggers on a single bar: ${maxPerBar}
  Trigger counts per bar distribution: ${JSON.stringify(
    [...triggersPerBar.entries()].slice(0, 20).map(([bar, count]) => ({ bar, count })),
  )}${triggersPerBar.size > 20 ? `\n  ... (${triggersPerBar.size - 20} more bars with triggers, not shown)` : ''}`);

    // With 9 alertcondition() calls, some bars will have multiple triggers
    expect(maxPerBar).toBeGreaterThan(1);

    // Verify viewport mapping as an additional sanity check
    const candles = barsToCandles(bars);
    const viewport = new Viewport(8);
    viewport.setTotalBars(1000);
    viewport.scrollTo(500, 800);
    const visible = viewport.getVisibleRange();
    for (const trigger of result.alertTriggers!) {
      expect(trigger.barIndex).toBeLessThan(candles.length);
      const px = viewport.barIndexToPixel(trigger.barIndex);
      if (trigger.barIndex >= visible.start) {
        expect(px).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
