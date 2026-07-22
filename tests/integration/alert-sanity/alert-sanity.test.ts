/**
 * Alert Sanity Diagnostic
 *
 * Loads a full chart export (candles + all indicator results) and cross-validates
 * that alert triggers match their corresponding labels on the correct bars.
 *
 * The volatility trail indicator uses the SAME condition for labels and alerts:
 *   flipUp  → label.new(▲) + alertcondition("Trail Long")
 *   flipDn  → label.new(▼) + alertcondition("Trail Short")
 *
 * So ▲ must pair with alert_1 (Trail Long) at the same barIndex, and
 * ▼ must pair with alert_2 (Trail Short) at the same barIndex.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ExportData {
  exportedAt: number;
  candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>;
  indicators: Array<{
    indicatorId: string;
    source: string;
    symbol: string;
    interval: string;
    result: {
      plots: unknown[];
      shapes: Array<{ time: number; type: string; text?: string }>;
      labels: Array<{ time: number; price: number; text: string; color: string }>;
      alertConditions: Array<{ id: string; title: string; message: string }>;
      alertTriggers: Array<{ alertId: string; barIndex: number; timestamp: number }>;
    };
  }>;
}

function loadExport(): ExportData {
  const exportPath = join(__dirname, 'export.json');
  return JSON.parse(readFileSync(exportPath, 'utf-8')) as ExportData;
}

describe('Alert Sanity', () => {
  const data = loadExport();
  const candles = data.candles;
  const candleTimeToIdx = new Map(candles.map((c, i) => [c.time, i]));

  // Build for first (and only) indicator — extend if multi-indicator
  const ind = data.indicators[0];
  const result = ind.result;

  // Index labels by direction
  const upLabels = result.labels.filter((l) => l.text === '▲');
  const downLabels = result.labels.filter((l) => l.text === '▼');

  // Index triggers by alertId
  const alert1Triggers = result.alertTriggers.filter((t) => t.alertId === 'alert_1').sort((a, b) => a.barIndex - b.barIndex); // Trail Long
  const alert2Triggers = result.alertTriggers.filter((t) => t.alertId === 'alert_2').sort((a, b) => a.barIndex - b.barIndex); // Trail Short
  const alert3Triggers = result.alertTriggers.filter((t) => t.alertId === 'alert_3').sort((a, b) => a.barIndex - b.barIndex); // Bull Retest
  const alert4Triggers = result.alertTriggers.filter((t) => t.alertId === 'alert_4').sort((a, b) => a.barIndex - b.barIndex); // Bear Retest

  // Diamond shapes (retest markers)
  const bullDiamonds = result.shapes.filter((s) => s.text === '◆' && s.type === 'diamond');
  const bearDiamonds = result.shapes.filter((s) => s.text === '◆' && s.type === 'diamond');

  it('should have alert conditions matching the indicator source', () => {
    const conditions = result.alertConditions;
    expect(conditions).toHaveLength(4);
    expect(conditions.map((c) => c.title)).toEqual([
      'Trail Long',
      'Trail Short',
      'Bull Retest',
      'Bear Retest',
    ]);
  });

  it('should have matching counts of labels and direction triggers', () => {
    // ▲ label ↔ alert_1 (Trail Long) both fire on flipUp
    expect(upLabels.length).toBe(alert1Triggers.length);
    // ▼ label ↔ alert_2 (Trail Short) both fire on flipDn
    expect(downLabels.length).toBe(alert2Triggers.length);
  });

  it('should have no duplicate trigger (alertId, barIndex) pairs', () => {
    const seen = new Set<string>();
    for (const t of result.alertTriggers) {
      const key = `${t.alertId}:${t.barIndex}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('should have all trigger barIndices within candle range', () => {
    for (const t of result.alertTriggers) {
      expect(t.barIndex).toBeGreaterThanOrEqual(0);
      expect(t.barIndex).toBeLessThan(candles.length);
    }
  });

  it('should have triggers in chronological (ascending barIndex) order', () => {
    for (let i = 1; i < result.alertTriggers.length; i++) {
      expect(result.alertTriggers[i].barIndex).toBeGreaterThanOrEqual(
        result.alertTriggers[i - 1].barIndex,
      );
    }
  });

  it('each ▲ label should have a matching alert_1 trigger at the SAME barIndex', () => {
    // Both use flipUp — they must fire on the same bar
    const labelIndices = new Set(
      upLabels.map((l) => candleTimeToIdx.get(l.time)).filter((i): i is number => i !== undefined),
    );
    const triggerIndices = new Set(alert1Triggers.map((t) => t.barIndex));

    for (const li of labelIndices) {
      expect(triggerIndices.has(li)).toBe(true);
    }
    for (const ti of triggerIndices) {
      expect(labelIndices.has(ti)).toBe(true);
    }
  });

  it('each ▼ label should have a matching alert_2 trigger at the SAME barIndex', () => {
    const labelIndices = new Set(
      downLabels.map((l) => candleTimeToIdx.get(l.time)).filter((i): i is number => i !== undefined),
    );
    const triggerIndices = new Set(alert2Triggers.map((t) => t.barIndex));

    for (const li of labelIndices) {
      expect(triggerIndices.has(li)).toBe(true);
    }
    for (const ti of triggerIndices) {
      expect(labelIndices.has(ti)).toBe(true);
    }
  });

  describe('seed bar offset detection', () => {
    // These tests detect if the trigger barIndices are shifted by a constant
    // offset (seed bar count) relative to the label barIndices

    it('should detect if trigger barIndex has a systematic offset from labels', () => {
      if (upLabels.length === 0 || alert1Triggers.length === 0) return;

      // Try offsets 0..100 and find the one that maximises matches
      const labelIndices = new Set(
        upLabels.map((l) => candleTimeToIdx.get(l.time)).filter((i): i is number => i !== undefined),
      );

      let bestOffset = -1;
      let bestMatches = 0;

      for (let offset = 0; offset <= 100; offset++) {
        const shifted = new Set(alert1Triggers.map((t) => t.barIndex - offset));
        let matches = 0;
        for (const li of labelIndices) {
          if (shifted.has(li)) matches++;
        }
        if (matches > bestMatches) {
          bestMatches = matches;
          bestOffset = offset;
        }
      }

      console.log(`[detect] alert_1 offset from labels: best match at offset=${bestOffset} (${bestMatches}/${labelIndices.size} labels matched)`);
      // If bestOffset > 0 and bestMatches == labelIndices.size, the triggers are shifted
      // by `bestOffset` bars (likely the seed bar count = hullLen = 72)
      expect(bestOffset).toBe(0);
    });

    it('should detect offset for alert_2 triggers', () => {
      if (downLabels.length === 0 || alert2Triggers.length === 0) return;

      const labelIndices = new Set(
        downLabels.map((l) => candleTimeToIdx.get(l.time)).filter((i): i is number => i !== undefined),
      );

      let bestOffset = -1;
      let bestMatches = 0;

      for (let offset = 0; offset <= 100; offset++) {
        const shifted = new Set(alert2Triggers.map((t) => t.barIndex - offset));
        let matches = 0;
        for (const li of labelIndices) {
          if (shifted.has(li)) matches++;
        }
        if (matches > bestMatches) {
          bestMatches = matches;
          bestOffset = offset;
        }
      }

      console.log(`[detect] alert_2 offset from labels: best match at offset=${bestOffset} (${bestMatches}/${labelIndices.size} labels matched)`);
      expect(bestOffset).toBe(0);
    });
  });
});
