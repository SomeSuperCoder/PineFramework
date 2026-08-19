import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ScriptSession } from '../src/session/ScriptSession.js';
import type { Bar } from 'pine-framework';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * QQE MOD stdev parity — TradingView ground-truth regression test.
 *
 * Director provided 3 reference bars from TradingView (SOLUSDT SPOT 1h Bybit):
 *   Bar 1 (05:00): close=75.29, st14=0.2164, st20=0.2567, st50=0.3909, stM=0.2567
 *   Bar 2 (10:00): close=76.11, st14=0.2257, st20=0.2287, st50=0.4109, stM=0.2287
 *   Bar 3 (12:00): close=75.96, st14=0.2434, st20=0.2147, st50=0.4248, stM=0.2147
 *
 * Our Bybit API fetch shows slightly different close values (different candle
 * alignment), so stdev values will also differ. The test asserts the ENGINE's
 * values are within tolerance of TV's values — proving the engine calculates
 * stdev correctly even if data alignment differs slightly.
 *
 * Workflow: this test starts RED (engine values don't match yet).
 * Engineer fixes the engine → re-run → GREEN.
 */

// Load the SOLUSDT 1h fixture (200 bars ending Aug 18 2026 12:00 UTC)
const fixturePath = path.resolve(__dirname, '../../test_indicators/fixtures/solusdt-1h-aug2026.json');
const rawBars: string[][] = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

// Convert Bybit format [ts, open, high, low, close, vol, turnover] → Bar
const bars: Bar[] = rawBars.map((row) => ({
  timestamp: parseInt(row[0], 10),
  open: parseFloat(row[1]),
  high: parseFloat(row[2]),
  low: parseFloat(row[3]),
  close: parseFloat(row[4]),
  volume: parseFloat(row[5]),
}));

// Load the ORIGINAL qqe-mod.pine (not the diagnostic)
const qqeModSource = fs.readFileSync(
  path.resolve(__dirname, '../../test_indicators/qqe-mod.pine'),
  'utf-8',
);

// Target bar indices (in our 200-bar fixture, oldest-first order)
// These correspond to Aug 18 2026 05:00, 10:00, 12:00 UTC
const TARGET_BARS = [
  { index: 192, label: '05:00', tv: { close: 75.29, st14: 0.2164, st20: 0.2567, st50: 0.3909, stM: 0.2567 } },
  { index: 197, label: '10:00', tv: { close: 76.11, st14: 0.2257, st20: 0.2287, st50: 0.4109, stM: 0.2287 } },
  { index: 199, label: '12:00', tv: { close: 75.96, st14: 0.2434, st20: 0.2147, st50: 0.4248, stM: 0.2147 } },
];

// Relative tolerance for stdev comparison (accounts for slight data alignment diffs)
// The close values differ by ~0.3-0.6%, so stdev values may differ similarly.
// A 10% tolerance is generous for initial parity; tighten once the engine matches.
const STDEV_TOLERANCE = 0.10; // 10% relative tolerance

/**
 * Find the plot title in outputs that matches a pattern.
 * The engine keys plots by their PineScript title.
 */
function findPlotValues(
  outputs: Record<string, (number | string | boolean | null)[]>,
  titlePattern: string,
): (number | null)[] | null {
  for (const [key, values] of Object.entries(outputs)) {
    if (key.includes(titlePattern)) {
      return values.map((v) => (typeof v === 'number' ? v : null));
    }
  }
  return null;
}

describe('QQE MOD stdev parity — TradingView ground truth', () => {
  let outputs: Record<string, (number | string | boolean | null)[]>;

  beforeAll(() => {
    const session = new ScriptSession(qqeModSource, 'SOLUSDT', '60', bars);
    const result = session.initialize();
    outputs = result.outputs;
  });

  it('engine produces stdev outputs for all target bars', () => {
    // Diagnostic: dump all output keys
    console.log('\n  Engine output keys:', Object.keys(outputs));
    for (const [k, v] of Object.entries(outputs)) {
      if (k.toLowerCase().includes('stdev') || k.toLowerCase().includes('rsi') || k.toLowerCase().includes('qqe')) {
        console.log(`    ${k}: len=${v.length}, last5=${v.slice(-5)}`);
      }
    }

    const st14 = findPlotValues(outputs, 'stdev(close,14)');
    const st20 = findPlotValues(outputs, 'stdev(close,20)');
    const st50 = findPlotValues(outputs, 'stdev(close,50)');
    const stM = findPlotValues(outputs, 'stdev(close-50,20)');

    expect(st14).not.toBeNull();
    expect(st20).not.toBeNull();
    expect(st50).not.toBeNull();
    expect(stM).not.toBeNull();

    // All arrays must be at least as long as our target bar indices
    expect(st14!.length).toBeGreaterThan(199);
    expect(st20!.length).toBeGreaterThan(199);
    expect(st50!.length).toBeGreaterThan(199);
    expect(stM!.length).toBeGreaterThan(199);
  });

  for (const target of TARGET_BARS) {
    it(`bar ${target.label} (index ${target.index}): stdev values within ${STDEV_TOLERANCE * 100}% of TV`, () => {
      const st14 = findPlotValues(outputs, 'stdev(close,14)')!;
      const st20 = findPlotValues(outputs, 'stdev(close,20)')!;
      const st50 = findPlotValues(outputs, 'stdev(close,50)')!;
      const stM = findPlotValues(outputs, 'stdev(close-50,20)')!;

      const i = target.index;
      const engine = {
        st14: st14[i],
        st20: st20[i],
        st50: st50[i],
        stM: stM[i],
      };
      const tv = target.tv;

      // Log actual vs expected for debugging
      console.log(`\n  Bar ${target.label}:`);
      console.log(`    st14: engine=${engine.st14?.toFixed(6)}  tv=${tv.st14}  diff=${engine.st14 != null ? Math.abs(engine.st14 - tv.st14).toFixed(6) : 'N/A'}`);
      console.log(`    st20: engine=${engine.st20?.toFixed(6)}  tv=${tv.st20}  diff=${engine.st20 != null ? Math.abs(engine.st20 - tv.st20).toFixed(6) : 'N/A'}`);
      console.log(`    st50: engine=${engine.st50?.toFixed(6)}  tv=${tv.st50}  diff=${engine.st50 != null ? Math.abs(engine.st50 - tv.st50).toFixed(6) : 'N/A'}`);
      console.log(`    stM:  engine=${engine.stM?.toFixed(6)}  tv=${tv.stM}   diff=${engine.stM != null ? Math.abs(engine.stM - tv.stM).toFixed(6) : 'N/A'}`);

      // Assert each stdev value is within relative tolerance of TV's value
      // Guard against null/undefined (engine didn't produce a value)
      expect(engine.st14).not.toBeNull();
      expect(engine.st20).not.toBeNull();
      expect(engine.st50).not.toBeNull();
      expect(engine.stM).not.toBeNull();

      // Relative tolerance check: |engine - tv| / tv <= tolerance
      // Use absolute tolerance for values close to zero (tv.st14 could be ~0.2)
      const absTolerance = 0.02; // absolute tolerance for small values
      const checkTolerance = (actual: number, expected: number, name: string) => {
        const absDiff = Math.abs(actual - expected);
        const relDiff = expected !== 0 ? absDiff / Math.abs(expected) : absDiff;
        const withinAbs = absDiff <= absTolerance;
        const withinRel = relDiff <= STDEV_TOLERANCE;
        if (!withinAbs && !withinRel) {
          throw new Error(
            `${name}: engine=${actual.toFixed(6)} vs tv=${expected} — ` +
            `absDiff=${absDiff.toFixed(6)} (tol=${absTolerance}), ` +
            `relDiff=${(relDiff * 100).toFixed(2)}% (tol=${STDEV_TOLERANCE * 100}%)`
          );
        }
      };

      checkTolerance(engine.st14!, tv.st14, 'st14');
      checkTolerance(engine.st20!, tv.st20, 'st20');
      checkTolerance(engine.st50!, tv.st50, 'st50');
      checkTolerance(engine.stM!, tv.stM, 'stM');
    });
  }
});
