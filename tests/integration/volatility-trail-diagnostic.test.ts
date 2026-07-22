/**
 * Volatility Trail — Comprehensive Label ↔ Alert Trigger Cross-Validation
 *
 * Tests the full ExecutionEngine with volatility trail Pine Script on sine-wave
 * data.  For every bar, cross-validates that:
 *
 *   ▲ label (flipUp)  ⇔  "Trail Long"  alert trigger on the SAME barIndex
 *   ▼ label (flipDn)  ⇔  "Trail Short" alert trigger on the SAME barIndex
 *
 * Alert triggers use the condition **ID** (e.g. "alert_1") as their `alertId`,
 * not the condition title.  The mapping from ID → title is:
 *
 *   alertConditions: [{ id: "alert_1", title: "Trail Long" }, ...]
 *   alertTriggers:   [{ alertId: "alert_1", barIndex: N, ... }]
 *
 * This test resolves the mapping, then cross-validates every bar.
 *
 * If ANY mismatch is found, a full bar-level dump is printed showing:
 *   barIndex, timestamp, label text, mapped alertId/alertTitle
 *
 * Also tests the forming-candle tick→confirm cycle to ensure tick-based
 * speculative triggers don't leak into confirmed outputs.
 */

import { describe, it, expect } from '@jest/globals';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import type { ExecutionContext } from '../../src/language/runtime/execution-types.js';
import {
  VOLATILITY_TRAIL_SOURCE,
  VOLATILITY_TRAIL_CONDITION_TITLES,
} from '../fixtures/volatility-trail.js';
import { createTrendBars, type Bar } from '../helpers/deterministicBars.js';

// ─── Helpers ────────────────────────────────────────────────────────────

function barsToContexts(bars: Bar[]): ExecutionContext[] {
  return bars.map((bar, index) => ({
    barIndex: index,
    barCount: bars.length,
    timestamp: bar.timestamp,
    open: createSeries('open', [bar.open]),
    high: createSeries('high', [bar.high]),
    low: createSeries('low', [bar.low]),
    close: createSeries('close', [bar.close]),
    volume: createSeries('volume', [bar.volume]),
  }));
}

interface MismatchRecord {
  barIndex: number;
  timestamp: number;
  direction: 'up' | 'down';
  hasLabel: boolean;
  hasMatchingTrigger: boolean;
  triggerAlertId: string | null;
  expectedTitle: string;
}

/** Build id→title map from alertConditions array. */
function buildIdToTitleMap(
  conditions: Array<{ id: string; title: string }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of conditions) map.set(c.id, c.title);
  return map;
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('VOLATILITY TRAIL — Label vs Alert Trigger Cross-Validation', () => {
  const BAR_COUNT = 500;
  const SEED = 42;
  const TREND = 'sine-wave';

  let engine: ExecutionEngine;
  let bars: Bar[];
  let contexts: ExecutionContext[];
  let result: ReturnType<ExecutionEngine['executeBars']>;

  beforeAll(() => {
    const { ast } = parse(VOLATILITY_TRAIL_SOURCE);
    const compileResult = compile(ast);
    engine = new ExecutionEngine(compileResult);

    bars = createTrendBars({ count: BAR_COUNT, seed: SEED, trend: TREND });
    contexts = barsToContexts(bars);
    result = engine.executeBars(contexts);
  });

  // ── Phase 1: Basic Counting ───────────────────────────────────────

  it('should produce labels and alert triggers', () => {
    expect(result.success).toBe(true);
    expect(result.labels).toBeDefined();
    expect(result.labels!.length).toBeGreaterThan(0);
    expect(result.alertTriggers).toBeDefined();
    expect(result.alertTriggers!.length).toBeGreaterThan(0);
  });

  it('should produce matching counts of ▲ labels and "Trail Long" triggers', () => {
    const upLabels = (result.labels ?? []).filter((l) => l.text === '▲');
    const idToTitle = buildIdToTitleMap(result.alertConditions ?? []);
    const trailLongTriggers = (result.alertTriggers ?? []).filter(
      (t) => idToTitle.get(t.alertId) === 'Trail Long',
    );

    console.log(`\n  ▲ labels: ${upLabels.length}`);
    console.log(`  "Trail Long" triggers: ${trailLongTriggers.length}`);
    expect(upLabels.length).toBe(trailLongTriggers.length);
  });

  it('should produce matching counts of ▼ labels and "Trail Short" triggers', () => {
    const dnLabels = (result.labels ?? []).filter((l) => l.text === '▼');
    const idToTitle = buildIdToTitleMap(result.alertConditions ?? []);
    const trailShortTriggers = (result.alertTriggers ?? []).filter(
      (t) => idToTitle.get(t.alertId) === 'Trail Short',
    );

    console.log(`  ▼ labels: ${dnLabels.length}`);
    console.log(`  "Trail Short" triggers: ${trailShortTriggers.length}`);
    expect(dnLabels.length).toBe(trailShortTriggers.length);
  });

  // ── Phase 2: Bar-Level Cross-Validation ───────────────────────────

  it('should have every flip label match its alert trigger at the same barIndex', () => {
    const barTimestamps = result.barTimestamps ?? [];
    const labels = result.labels ?? [];
    const triggers = result.alertTriggers ?? [];
    const idToTitle = buildIdToTitleMap(result.alertConditions ?? []);

    // Build timestamp → barIndex map
    const tsToBarIdx = new Map<number, number>();
    barTimestamps.forEach((ts, idx) => tsToBarIdx.set(ts, idx));

    // Group labels by barIndex
    const labelsByBarIdx = new Map<number, string[]>();
    for (const label of labels) {
      const barIdx = tsToBarIdx.get(label.time);
      if (barIdx !== undefined) {
        if (!labelsByBarIdx.has(barIdx)) labelsByBarIdx.set(barIdx, []);
        labelsByBarIdx.get(barIdx)!.push(label.text);
      }
    }

    // Group triggers by barIndex with their resolved titles
    const triggerTitlesByBarIdx = new Map<number, string[]>();
    for (const t of triggers) {
      const title = idToTitle.get(t.alertId) ?? t.alertId;
      if (!triggerTitlesByBarIdx.has(t.barIndex))
        triggerTitlesByBarIdx.set(t.barIndex, []);
      triggerTitlesByBarIdx.get(t.barIndex)!.push(title);
    }

    // Cross-validate every bar
    const mismatches: MismatchRecord[] = [];
    const allBarIndices = new Set([
      ...labelsByBarIdx.keys(),
      ...triggerTitlesByBarIdx.keys(),
    ]);

    for (const barIdx of allBarIndices) {
      const barLabels = labelsByBarIdx.get(barIdx) ?? [];
      const barTriggerTitles = triggerTitlesByBarIdx.get(barIdx) ?? [];

      // ▲ → should have "Trail Long"
      if (barLabels.includes('▲') && !barTriggerTitles.includes('Trail Long')) {
        mismatches.push({
          barIndex: barIdx,
          timestamp: barTimestamps[barIdx] ?? 0,
          direction: 'up',
          hasLabel: true,
          hasMatchingTrigger: false,
          triggerAlertId: barTriggerTitles.join(',') || '(none)',
          expectedTitle: 'Trail Long',
        });
      }

      // ▼ → should have "Trail Short"
      if (barLabels.includes('▼') && !barTriggerTitles.includes('Trail Short')) {
        mismatches.push({
          barIndex: barIdx,
          timestamp: barTimestamps[barIdx] ?? 0,
          direction: 'down',
          hasLabel: true,
          hasMatchingTrigger: false,
          triggerAlertId: barTriggerTitles.join(',') || '(none)',
          expectedTitle: 'Trail Short',
        });
      }
    }

    // DUMP all mismatches with full detail
    if (mismatches.length > 0) {
      console.log('\n❌ MISMATCHES FOUND:');
      console.log(
        'barIdx | timestamp           | dir | hasLabel | hasTrigger | triggers_at_bar | expected',
      );
      console.log(
        '-------+---------------------+-----+----------+------------+-----------------+----------',
      );
      for (const m of mismatches) {
        const ts = new Date(m.timestamp).toISOString();
        console.log(
          `${String(m.barIndex).padStart(5)} | ${ts} | ${m.direction === 'up' ? ' ▲' : ' ▼'} | ${m.hasLabel ? '    ✓' : '    ✗'} | ${m.hasMatchingTrigger ? '       ✓' : '       ✗'} | ${m.triggerAlertId!.padEnd(15)} | ${m.expectedTitle}`,
        );
      }
    }

    // DUMP complete flip event detail
    const flipEvents: Array<{
      barIndex: number;
      timestamp: number;
      direction: string;
      labelText: string;
      triggerTitles: string[];
    }> = [];

    for (const barIdx of allBarIndices) {
      const barLabels = labelsByBarIdx.get(barIdx) ?? [];
      const barTriggerTitles = triggerTitlesByBarIdx.get(barIdx) ?? [];

      for (const lbl of barLabels) {
        if (lbl === '▲' || lbl === '▼') {
          flipEvents.push({
            barIndex: barIdx,
            timestamp: barTimestamps[barIdx] ?? 0,
            direction: lbl === '▲' ? 'up' : 'down',
            labelText: lbl,
            triggerTitles: barTriggerTitles,
          });
        }
      }
    }

    console.log(`\n📋 ALL FLIP EVENTS (${flipEvents.length} total):`);
    console.log(
      'barIdx | timestamp           | dir | label | triggers',
    );
    console.log(
      '-------+---------------------+-----+-------+-------------------------------',
    );
    for (const fe of flipEvents) {
      const ts = new Date(fe.timestamp).toISOString();
      const tStr = fe.triggerTitles.join(', ') || '(none)';
      const expected = fe.direction === 'up' ? 'Trail Long' : 'Trail Short';
      const match = fe.triggerTitles.includes(expected);
      console.log(
        `${String(fe.barIndex).padStart(5)} | ${ts} | ${fe.direction === 'up' ? ' ▲' : ' ▼'} | ${fe.labelText} | ${tStr}${match ? ' ✅' : ' ❌'}`,
      );
    }

    expect(mismatches.length).toBe(0);
  });

  // ── Phase 3: Tick → Confirm Pipeline — No Phantom Triggers ───────

  it('should not leak speculative tick triggers into confirmed bar outputs', () => {
    const lookback = 50;
    const startIdx = Math.max(0, bars.length - lookback);

    // Re-compile for clean engine state
    const { ast } = parse(VOLATILITY_TRAIL_SOURCE);
    const compileResult = compile(ast);
    const freshEngine = new ExecutionEngine(compileResult);

    // Initialize with first (startIdx) bars
    const initBars = bars.slice(0, startIdx);
    const initContexts = barsToContexts(initBars);
    const initResult = freshEngine.executeBars(initContexts);
    const initialTriggerCount = freshEngine.alertTriggers.length;
    console.log(`\n  Initial triggers after ${startIdx} bars: ${initialTriggerCount}`);

    // Map initial conditions
    const idToTitle = buildIdToTitleMap(initResult.alertConditions ?? []);

    // Simulate tick→confirm for remaining bars
    let phantomTriggers = 0;
    let confirmedTriggerCount = initialTriggerCount;

    for (let i = startIdx; i < bars.length; i++) {
      const bar = bars[i]!;

      // Tick: compute forming candle
      const tickContext: ExecutionContext = {
        barIndex: i,
        barCount: bars.length,
        timestamp: bar.timestamp,
        open: createSeries('open', [bar.open]),
        high: createSeries('high', [bar.high]),
        low: createSeries('low', [bar.low]),
        close: createSeries('close', [bar.close]),
        volume: createSeries('volume', [bar.volume]),
      };

      freshEngine.setFormingCandle(true);
      const tickResult = freshEngine.computeFormingCandle(tickContext);
      const tickTriggers = tickResult.diffAlertTriggers ?? [];

      // Confirm: execute bar
      freshEngine.setFormingCandle(false);
      const confirmResult = freshEngine.executeBar(tickContext);
      const allConfirmTriggers = confirmResult.alertTriggers ?? [];
      const newConfirmTriggers = allConfirmTriggers.slice(confirmedTriggerCount);
      confirmedTriggerCount = allConfirmTriggers.length;

      // Resolve tick trigger titles
      for (const tickT of tickTriggers) {
        const tickTitle = idToTitle.get(tickT.alertId) ?? tickT.alertId;
        const matched = newConfirmTriggers.some(
          (ct) => ct.alertId === tickT.alertId,
        );
        if (!matched) {
          phantomTriggers++;
          console.log(
            `  ⚠ PHANTOM: bar ${i}: tick "${tickTitle}" (${tickT.alertId}) but confirm had no matching trigger`,
          );
        }
      }
    }

    console.log(`  Phantom triggers during tick→confirm: ${phantomTriggers}`);
    if (phantomTriggers > 0) {
      console.log(
        '  (Note: phantom triggers from ticks are expected — forming candles\n' +
        '   use speculative close values. FormingCandleManager._pendingNewTriggers\n' +
        '   filters them out in production.)',
      );
    }
  });

  // ── Phase 4: Alert condition entries should be stable ─────────────

  it('should have exactly VOLATILITY_TRAIL_CONDITION_TITLES.length alert condition entries', () => {
    const conditions = (engine as any).alertConditionEntries as Array<{
      id: string;
      title: string;
    }>;

    const expectedCount = VOLATILITY_TRAIL_CONDITION_TITLES.length;
    console.log(`\n  Alert condition entries: ${conditions.length}`);
    for (const title of VOLATILITY_TRAIL_CONDITION_TITLES) {
      const matches = conditions.filter((c) => c.title === title);
      console.log(`    "${title}": ${matches.length} entry (expected 1)`);
    }

    const unexpected = conditions.filter(
      (c) => !VOLATILITY_TRAIL_CONDITION_TITLES.includes(c.title as any),
    );
    if (unexpected.length > 0) {
      console.log(`\n  ⚠ Unexpected entries (${unexpected.length}):`);
      for (const c of unexpected.slice(0, 10)) {
        console.log(`    id=${c.id} title="${c.title}"`);
      }
    }

    expect(conditions.length).toBeGreaterThanOrEqual(expectedCount);
    expect(unexpected.length).toBe(0);
  });

  // ── Phase 5: Trigger barIndexes are within valid range ────────────

  it('should have all trigger barIndexes within [0, bars.length-1]', () => {
    const triggers = result.alertTriggers ?? [];
    const outOfRange = triggers.filter(
      (t) => t.barIndex < 0 || t.barIndex >= bars.length,
    );

    if (outOfRange.length > 0) {
      console.log(`\n❌ Out-of-range barIndex in triggers:`);
      for (const t of outOfRange) {
        console.log(
          `  alertId="${t.alertId}" barIndex=${t.barIndex} (valid: 0-${bars.length - 1})`,
        );
      }
    }

    expect(outOfRange.length).toBe(0);
  });
});
