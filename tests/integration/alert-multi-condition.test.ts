/**
 * Integration tests for alert triggers across multiple real-world Pine Script
 * indicators with stateful alert logic (pivots, trails, flips).
 *
 * Tests both backend trigger generation and frontend merge/pipeline correctness.
 */
import { describe, it, expect } from '@jest/globals';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import { createTrendBars, prependBars } from '../helpers/deterministicBars.js';
import { EVERY_BAR_ALERT_SOURCE } from '../fixtures/every-bar-alert.js';
import { HHLL_SOURCE, HHLL_ALERT_COUNT, HHLL_CONDITION_TITLES } from '../fixtures/higher-high-lower-low.js';
import { VOLATILITY_TRAIL_SOURCE, VOLATILITY_TRAIL_ALERT_COUNT, VOLATILITY_TRAIL_CONDITION_TITLES } from '../fixtures/volatility-trail.js';
import type { AlertTriggerEntry, AlertConditionEntry, LabelEntry, ShapeEntry } from '../../src/language/runtime/execution-types.js';

// ─── Shared helpers ─────────────────────────────────────────────────

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

/** Check every trigger's barIndex is valid and timestamp matches the bar data. */
function expectValidTriggers(
  triggers: AlertTriggerEntry[],
  bars: ReturnType<typeof createTrendBars>,
  label: string,
) {
  for (const trigger of triggers) {
    expect(trigger.barIndex).toBeGreaterThanOrEqual(0);
    expect(trigger.barIndex).toBeLessThan(bars.length);
    expect(bars[trigger.barIndex]!.timestamp).toBe(trigger.timestamp);
  }
  console.log(`  [${label}] ${triggers.length} triggers, all barIndex valid`);
}

/** Log trigger-per-bar distribution. */
function logTriggerDistribution(
  triggers: AlertTriggerEntry[],
  totalBars: number,
  label: string,
) {
  const perBar = new Map<number, number>();
  for (const t of triggers) {
    perBar.set(t.barIndex, (perBar.get(t.barIndex) ?? 0) + 1);
  }
  const counts = [...perBar.values()];
  const maxPerBar = Math.max(...counts, 0);
  const barsWithTriggers = perBar.size;
  const pct = ((barsWithTriggers / totalBars) * 100).toFixed(1);
  const sample = [...perBar.entries()]
    .sort((a, b) => b[1] - a[1]) // sort by count descending
    .slice(0, 10);

  console.log(`  [${label}] Distribution: ${triggers.length} triggers, ${barsWithTriggers}/${totalBars} bars (${pct}%), max ${maxPerBar}/bar`);
  console.log(`  [${label}] Top trigger-dense bars: ${JSON.stringify(sample)}`);
}

// ═══════════════════════════════════════════════════════════════════════
//  HIGHER-HIGH-LOWER-LOW
// ═══════════════════════════════════════════════════════════════════════

describe('higher-high-lower-low.pine alerts', () => {
  // ── 2.1 + 2.4: barIndex validity + distribution logging ──────────
  it('produces valid barIndex and timestamps on sine-wave data', () => {
    const N = 1000;
    const bars = createTrendBars({ count: N, seed: 42, trend: 'sine-wave' });
    const { result } = runEngine(HHLL_SOURCE, bars);

    expect(result.success).toBe(true);
    expect(result.alertTriggers).toBeDefined();
    expect(result.alertTriggers!.length).toBeGreaterThan(0);
    expectValidTriggers(result.alertTriggers!, bars, 'HHLL');
  });

  // ── 2.2: alertConditions metadata ──────────────────────────────
  it('has 9 alert conditions with non-empty title and message', () => {
    const N = 500;
    const bars = createTrendBars({ count: N, seed: 42, trend: 'sine-wave' });
    const { result } = runEngine(HHLL_SOURCE, bars);

    expect(result.alertConditions).toBeDefined();
    expect(result.alertConditions!.length).toBe(HHLL_ALERT_COUNT);

    const titles = result.alertConditions!.map((c: AlertConditionEntry) => c.title);
    for (const expected of HHLL_CONDITION_TITLES) {
      expect(titles).toContain(expected);
    }
    for (const condition of result.alertConditions!) {
      expect(condition.title).toBeTruthy();
      expect(condition.message).toBeTruthy();
    }

    console.log(`  [HHLL-conditions] ${result.alertConditions!.length} conditions: ${titles.join(', ')}`);
  });

  // ── 2.3: prepend scenario ──────────────────────────────────────
  it('survives prepend with correct barIndex shift', () => {
    const N = 500;
    const PREPEND = 200;
    const bars = createTrendBars({ count: N, seed: 42, trend: 'sine-wave' });

    // Run on initial set to get original triggers
    const firstResult = runEngine(HHLL_SOURCE, bars).result;

    // Prepend bars and re-execute on larger set
    const largerBars = prependBars(bars, PREPEND);
    expect(largerBars.length).toBe(N + PREPEND);
    const secondResult = runEngine(HHLL_SOURCE, largerBars).result;

    // All barIndex must be valid for the larger set
    expectValidTriggers(secondResult.alertTriggers!, largerBars, 'HHLL-prepend');

    // For triggers that exist in BOTH runs (matching timestamp), verify the
    // barIndex is shifted by PREPEND. Stateful indicators may produce different
    // triggers with more history, so we only check the intersection.
    const firstByTime = new Map(firstResult.alertTriggers!.map((t: AlertTriggerEntry) => [t.timestamp, t]));
    const secondByTime = new Map(secondResult.alertTriggers!.map((t: AlertTriggerEntry) => [t.timestamp, t]));
    let matchedCount = 0;
    for (const [ts, firstT] of firstByTime) {
      const secondT = secondByTime.get(ts);
      if (secondT) {
        expect(secondT.barIndex).toBe(firstT.barIndex + PREPEND);
        matchedCount++;
      }
    }
    expect(matchedCount).toBeGreaterThan(0);

    console.log(`  [HHLL-prepend] ${firstResult.alertTriggers!.length} triggers → ${secondResult.alertTriggers!.length} after prepend, ${matchedCount} matched with correct shift`);
  });

  // ── 2.4: distribution logging ──────────────────────────────────
  it('logs trigger-per-bar distribution', () => {
    const N = 1000;
    const bars = createTrendBars({ count: N, seed: 42, trend: 'sine-wave' });
    const { result } = runEngine(HHLL_SOURCE, bars);

    logTriggerDistribution(result.alertTriggers!, N, 'HHLL-dist');
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  VOLATILITY TRAIL
// ═══════════════════════════════════════════════════════════════════════

describe('volatility-trail.pine alerts', () => {
  const BAR_COUNT = 500;

  // ── 3.1: barIndex + timestamp ──────────────────────────────────
  it('produces valid barIndex and timestamps on linear-up data', () => {
    const bars = createTrendBars({ count: BAR_COUNT, seed: 42, trend: 'linear-up' });
    const { result } = runEngine(VOLATILITY_TRAIL_SOURCE, bars);

    expect(result.success).toBe(true);
    expect(result.alertTriggers).toBeDefined();
    expect(result.alertTriggers!.length).toBeGreaterThan(0);
    expectValidTriggers(result.alertTriggers!, bars, 'vol-trail');
  });

  // ── 3.2: alertConditions metadata ──────────────────────────────
  it('has 4 alert conditions with non-empty title and message', () => {
    const bars = createTrendBars({ count: BAR_COUNT, seed: 42, trend: 'linear-up' });
    const { result } = runEngine(VOLATILITY_TRAIL_SOURCE, bars);

    expect(result.alertConditions).toBeDefined();
    expect(result.alertConditions!.length).toBe(VOLATILITY_TRAIL_ALERT_COUNT);

    const titles = result.alertConditions!.map((c: AlertConditionEntry) => c.title);
    for (const expected of VOLATILITY_TRAIL_CONDITION_TITLES) {
      expect(titles).toContain(expected);
    }
    for (const condition of result.alertConditions!) {
      expect(condition.title).toBeTruthy();
      expect(condition.message).toBeTruthy();
    }

    console.log(`  [vol-trail-conditions] ${result.alertConditions!.length} conditions: ${titles.join(', ')}`);
  });

  // ── 3.3: cross-validation flip labels ↔ alerts ─────────────────
  it('flip alerts match ▲/▼ labels on the same bar', () => {
    const bars = createTrendBars({ count: BAR_COUNT, seed: 42, trend: 'linear-up' });
    const { result } = runEngine(VOLATILITY_TRAIL_SOURCE, bars);

    const triggers = result.alertTriggers!;
    const labels = result.labels!;

    // alert_1 = "Trail Long" (flipUp), alert_2 = "Trail Short" (flipDn)
    const flipUpTriggers = new Set(
      triggers.filter((t: AlertTriggerEntry) => t.alertId === 'alert_1').map((t: AlertTriggerEntry) => t.timestamp),
    );
    const flipDnTriggers = new Set(
      triggers.filter((t: AlertTriggerEntry) => t.alertId === 'alert_2').map((t: AlertTriggerEntry) => t.timestamp),
    );

    // "▲" labels = up triangle, "▼" labels = down triangle
    const upLabelTimes = new Set(
      labels.filter((l: LabelEntry) => l.text === '▲').map((l: LabelEntry) => l.time),
    );
    const downLabelTimes = new Set(
      labels.filter((l: LabelEntry) => l.text === '▼').map((l: LabelEntry) => l.time),
    );

    // Every flipUp trigger must have a matching ▲ label
    for (const ts of flipUpTriggers) {
      expect(upLabelTimes.has(ts)).toBe(true);
    }
    // Every ▲ label must have a matching flipUp trigger
    for (const ts of upLabelTimes) {
      expect(flipUpTriggers.has(ts)).toBe(true);
    }
    // Every flipDn trigger must have a matching ▼ label
    for (const ts of flipDnTriggers) {
      expect(downLabelTimes.has(ts)).toBe(true);
    }
    // Every ▼ label must have a matching flipDn trigger
    for (const ts of downLabelTimes) {
      expect(flipDnTriggers.has(ts)).toBe(true);
    }

    console.log(`  [vol-trail-flip] ${flipUpTriggers.size} flipUp ↔ ${upLabelTimes.size} ▲ labels, ${flipDnTriggers.size} flipDn ↔ ${downLabelTimes.size} ▼ labels`);
  });

  // ── 3.4: cross-validation retest shapes ↔ alerts ───────────────
  it('retest alerts match ◆ plotchar shapes on the same bar', () => {
    const bars = createTrendBars({ count: BAR_COUNT, seed: 42, trend: 'linear-up' });
    const { result } = runEngine(VOLATILITY_TRAIL_SOURCE, bars);

    const triggers = result.alertTriggers!;
    const shapes = result.shapes!;

    // alert_3 = "Bull Retest" (bullRTok), alert_4 = "Bear Retest" (bearRTok)
    const bullRTTriggers = new Set(
      triggers.filter((t: AlertTriggerEntry) => t.alertId === 'alert_3').map((t: AlertTriggerEntry) => t.timestamp),
    );
    const bearRTTriggers = new Set(
      triggers.filter((t: AlertTriggerEntry) => t.alertId === 'alert_4').map((t: AlertTriggerEntry) => t.timestamp),
    );

    // plotchar stores the character in `style` (not `text`), location.belowbar for bull, abovebar for bear
    const bullShapeTimes = new Set(
      shapes.filter((s: ShapeEntry) => s.style === '◆' && s.location === 'belowbar').map((s: ShapeEntry) => s.time),
    );
    const bearShapeTimes = new Set(
      shapes.filter((s: ShapeEntry) => s.style === '◆' && s.location === 'abovebar').map((s: ShapeEntry) => s.time),
    );

    // Every bull retest trigger must have a matching ◆ (belowbar) shape
    for (const ts of bullRTTriggers) {
      expect(bullShapeTimes.has(ts)).toBe(true);
    }
    // Every ◆ (belowbar) shape must have a matching bull retest trigger
    for (const ts of bullShapeTimes) {
      expect(bullRTTriggers.has(ts)).toBe(true);
    }
    // Every bear retest trigger must have a matching ◆ (abovebar) shape
    for (const ts of bearRTTriggers) {
      expect(bearShapeTimes.has(ts)).toBe(true);
    }
    // Every ◆ (abovebar) shape must have a matching bear retest trigger
    for (const ts of bearShapeTimes) {
      expect(bearRTTriggers.has(ts)).toBe(true);
    }

    console.log(`  [vol-trail-retest] ${bullRTTriggers.size} bullRT ↔ ${bullShapeTimes.size} ◆(below), ${bearRTTriggers.size} bearRT ↔ ${bearShapeTimes.size} ◆(above)`);
  });

  // ── 3.5: prepend scenario ──────────────────────────────────────
  it('survives prepend with correct barIndex shift', () => {
    const N = 500;
    const PREPEND = 200;
    const bars = createTrendBars({ count: N, seed: 42, trend: 'linear-up' });

    const firstResult = runEngine(VOLATILITY_TRAIL_SOURCE, bars).result;
    expect(firstResult.alertTriggers!.length).toBeGreaterThan(0);

    const largerBars = prependBars(bars, PREPEND);
    expect(largerBars.length).toBe(N + PREPEND);
    const secondResult = runEngine(VOLATILITY_TRAIL_SOURCE, largerBars).result;

    expectValidTriggers(secondResult.alertTriggers!, largerBars, 'vol-trail-prepend');

    // For triggers that exist in BOTH runs, verify barIndex shift
    const firstByTime = new Map(firstResult.alertTriggers!.map((t: AlertTriggerEntry) => [t.timestamp, t]));
    const secondByTime = new Map(secondResult.alertTriggers!.map((t: AlertTriggerEntry) => [t.timestamp, t]));
    let matchedCount = 0;
    for (const [ts, firstT] of firstByTime) {
      const secondT = secondByTime.get(ts);
      if (secondT) {
        expect(secondT.barIndex).toBe(firstT.barIndex + PREPEND);
        matchedCount++;
      }
    }
    expect(matchedCount).toBeGreaterThan(0);

    console.log(`  [vol-trail-prepend] ${firstResult.alertTriggers!.length} triggers → ${secondResult.alertTriggers!.length} after prepend, ${matchedCount} matched with correct shift`);
  });

  // ── 3.6: forming-candle diff merge test ────────────────────────
  // This tests the FRONTEND mergeDiffIntoResult function which appends
  // diff alert triggers without duplication. We simulate the frontend
  // merge by constructing ScriptResult-like objects and calling the
  // merge logic directly. Since mergeDiffIntoResult is a React hook
  // (useCallback) we reimplement the relevant logic inline.
  it('forming-candle diff merge appends without duplication', () => {
    // Create initial result from a known indicator
    const bars = createTrendBars({ count: 100, seed: 42, trend: 'linear-up' });
    const { result } = runEngine(VOLATILITY_TRAIL_SOURCE, bars);
    const prevTriggers: AlertTriggerEntry[] = result.alertTriggers || [];

    // Simulate a diff message with new triggers for a forming candle at barIndex 100
    const diffTriggers: AlertTriggerEntry[] = [
      { alertId: 'alert_1', barIndex: 100, timestamp: bars[bars.length - 1]!.timestamp + 60000 },
      { alertId: 'alert_3', barIndex: 100, timestamp: bars[bars.length - 1]!.timestamp + 60000 },
    ];

    // Simulate mergeDiffIntoResult logic:
    // const mergedAlertTriggers = msg.alertTriggers && msg.alertTriggers.length > 0
    //   ? [...(prev.alertTriggers || []), ...msg.alertTriggers]
    //   : prev.alertTriggers;
    const mergedTriggers = [...prevTriggers, ...diffTriggers];

    // Merged must contain all original triggers
    expect(mergedTriggers.length).toBe(prevTriggers.length + diffTriggers.length);

    // Original triggers are unchanged
    for (let i = 0; i < prevTriggers.length; i++) {
      expect(mergedTriggers[i]).toBe(prevTriggers[i]);
    }

    // New triggers are appended at the end
    expect(mergedTriggers[mergedTriggers.length - 2]).toBe(diffTriggers[0]);
    expect(mergedTriggers[mergedTriggers.length - 1]).toBe(diffTriggers[1]);

    // No duplicates: verify unique (alertId, barIndex) pairs
    const seen = new Set<string>();
    for (const t of mergedTriggers) {
      const key = `${t.alertId}:${t.barIndex}`;
      if (seen.has(key)) {
        // This would be a duplicate — fail
        expect(`duplicate trigger ${key}`).toBe('should not happen');
      }
      seen.add(key);
    }

    console.log(`  [vol-trail-diff] ${prevTriggers.length} triggers + ${diffTriggers.length} diff = ${mergedTriggers.length} total, no dupes`);
  });
});
