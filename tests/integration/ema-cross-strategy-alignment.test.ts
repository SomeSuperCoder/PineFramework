import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import type { Bar } from '../../src/data/bar.js';
import type { ExecutionContext } from '../../src/language/runtime/execution-engine.js';

// ─── Strategy Source ────────────────────────────────────────────────────────
const strategySource = fs.readFileSync('./test_indicators/simple_ema_cross_strategy.pine', 'utf-8');

// ─── Helpers ────────────────────────────────────────────────────────────────

function barsToContext(bars: Bar[]): ExecutionContext[] {
  // Each context only needs the current bar's values — executeBar uses getRelative(0)
  // which reads the last element. Historical values are maintained by the engine's
  // pushBarValues mechanism, not by the context series. This is O(n) memory, not O(n²).
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

/**
 * Create bars with a clear EMA crossover pattern.
 * - Bars 0-30: flat price at 100 (EMA warmup, fastEMA ≈ slowEMA)
 * - Bars 31-50: sharp uptrend (fastEMA crosses above slowEMA)
 * - Bars 51-70: sharp downtrend (fastEMA crosses below slowEMA)
 * - Bars 71-90: flat price again
 */
function createCrossoverBars(): Bar[] {
  const bars: Bar[] = [];
  const baseTime = 1700000000000;

  for (let i = 0; i < 120; i++) {
    let close: number;
    if (i < 30) {
      close = 100 + (i % 5) * 0.1;
    } else if (i < 60) {
      close = 100 + (i - 30) * 3;
    } else if (i < 90) {
      close = 160 - (i - 60) * 3;
    } else {
      close = 100 + (i % 5) * 0.1;
    }
    bars.push({
      timestamp: baseTime + i * 3600000,
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1000,
    });
  }
  return bars;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('EMA Cross Strategy - label and entry alignment', () => {
  it('strategy entry markers should align with label bars (same condition)', () => {
    const bars = createCrossoverBars();

    // Run the strategy
    const { ast } = parse(strategySource);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);
    const contexts = barsToContext(bars);
    const result = engine.executeBars(contexts);

    // Extract strategy markers
    const entryMarkers = result.strategyMarkers.filter((m) => m.type === 'entry');
    const closeMarkers = result.strategyMarkers.filter(
      (m) => m.type === 'close' || m.type === 'exit',
    );

    console.log('\nStrategy entry markers:');
    for (const m of entryMarkers) {
      console.log(`  bar=${m.barIndex} name=${m.name} dir=${m.direction} price=${m.price}`);
    }
    console.log('Strategy close markers:');
    for (const m of closeMarkers) {
      console.log(
        `  bar=${m.barIndex} name=${m.name} dir=${m.direction} comment=${m.comment ?? 'none'}`,
      );
    }

    // Extract labels (they use timestamp, not barIndex)
    console.log('\nLabels:');
    for (const label of result.labels) {
      const barIdx = bars.findIndex((b) => b.timestamp === label.time);
      console.log(`  bar=${barIdx} time=${label.time} text="${label.text}"`);
    }

    // Map labels to bar indices
    const labelBarIndices = result.labels
      .map((label) => {
        const barIdx = bars.findIndex((b) => b.timestamp === label.time);
        return { barIdx, text: label.text };
      })
      .filter((l) => l.text === 'Long Cross' || l.text === 'Short Cross');

    // Map entry markers to bar indices
    const longLabelBars = labelBarIndices
      .filter((l) => l.text === 'Long Cross')
      .map((l) => l.barIdx)
      .sort((a, b) => a - b);
    const shortLabelBars = labelBarIndices
      .filter((l) => l.text === 'Short Cross')
      .map((l) => l.barIdx)
      .sort((a, b) => a - b);

    const longEntryBars = entryMarkers
      .filter((m) => m.name === 'Long')
      .map((m) => m.barIndex)
      .sort((a, b) => a - b);
    const shortEntryBars = entryMarkers
      .filter((m) => m.name === 'Short')
      .map((m) => m.barIndex)
      .sort((a, b) => a - b);

    console.log('Long label bars:', longLabelBars);
    console.log('Long entry bars:', longEntryBars);
    console.log('Short label bars:', shortLabelBars);
    console.log('Short entry bars:', shortEntryBars);

    // Each label should have a matching entry on the same bar
    // (both are created by the same condition: longCondition/shortCondition)
    expect(longEntryBars).toEqual(longLabelBars);
    expect(shortEntryBars).toEqual(shortLabelBars);
  });

  it('entries should alternate: Long, then Short, then Long', () => {
    const bars = createCrossoverBars();

    const { ast } = parse(strategySource);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);
    const contexts = barsToContext(bars);
    const result = engine.executeBars(contexts);

    const entryMarkers = result.strategyMarkers.filter((m) => m.type === 'entry');
    const entries = entryMarkers.map((m) => ({
      name: m.name,
      direction: m.direction,
      barIndex: m.barIndex,
    }));

    console.log('\nAll entries:', entries);

    // Should have at least one Long and one Short entry
    const longEntries = entries.filter((e) => e.direction === 'long');
    const shortEntries = entries.filter((e) => e.direction === 'short');

    expect(longEntries.length).toBeGreaterThan(0);
    expect(shortEntries.length).toBeGreaterThan(0);

    // First entry should be Long (uptrend hits first crossover)
    expect(entries[0].direction).toBe('long');
    expect(entries[0].name).toBe('Long');

    // If there are multiple cycles, they should alternate
    // (Long -> Short -> Long -> Short...)
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].direction).not.toBe(entries[i - 1].direction);
    }
  });

  it('close markers should use entry name with "Exit" prefix and have reverse comment', () => {
    const bars = createCrossoverBars();

    const { ast } = parse(strategySource);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);
    const contexts = barsToContext(bars);
    const result = engine.executeBars(contexts);

    const closeMarkers = result.strategyMarkers.filter(
      (m) => m.type === 'close' || m.type === 'exit',
    );

    console.log(
      '\nClose markers:',
      closeMarkers.map((m) => ({ name: m.name, comment: m.comment, barIndex: m.barIndex })),
    );

    for (const c of closeMarkers) {
      expect(c.name).toMatch(/^Exit (Long|Short)$/);
      expect(c.comment).toBe('reverse');
    }
  });
});
