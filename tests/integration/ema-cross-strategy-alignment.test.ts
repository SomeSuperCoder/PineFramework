import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import type { Bar } from '../../src/data/bar.js';
import type { ExecutionContext } from '../../src/language/runtime/execution-engine.js';

// ─── Strategy Source ────────────────────────────────────────────────────────
const strategySource = `
//@version=5
strategy("Simple EMA Cross Strategy", overlay=true, initial_capital=10000)

fastLength = input.int(9, title="Fast EMA Length")
slowLength = input.int(21, title="Slow EMA Length")

fastEMA = ta.ema(close, fastLength)
slowEMA = ta.ema(close, slowLength)

longCondition = ta.crossover(fastEMA, slowEMA)
shortCondition = ta.crossunder(fastEMA, slowEMA)

if longCondition
    strategy.entry("Long", strategy.long)

if shortCondition
    strategy.entry("Short", strategy.short)

if longCondition
    label.new(bar_index, low, "Long Cross",
              color=color.green, textcolor=color.white,
              style=label.style_label_up, size=size.small)

if shortCondition
    label.new(bar_index, high, "Short Cross",
              color=color.red, textcolor=color.white,
              style=label.style_label_down, size=size.small)
`;

// ─── Helpers ────────────────────────────────────────────────────────────────

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

  for (let i = 0; i < 100; i++) {
    let close: number;
    if (i < 30) {
      close = 100 + (i % 5) * 0.1; // near-flat with tiny noise
    } else if (i < 50) {
      close = 100 + (i - 30) * 3; // sharp uptrend: 100 → 157
    } else if (i < 70) {
      close = 160 - (i - 50) * 3; // sharp downtrend: 160 → 103
    } else {
      close = 100 + (i % 5) * 0.1; // near-flat again
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

/**
 * Compute EMA manually to find where crossover/crossunder actually occurs.
 */
function computeEMACrosspoints(
  closes: number[],
  fastLen: number,
  slowLen: number,
): { crossOver: number[]; crossUnder: number[] } {
  const kFast = 2 / (fastLen + 1);
  const kSlow = 2 / (slowLen + 1);

  const emaFast: number[] = [];
  const emaSlow: number[] = [];
  const crossOver: number[] = [];
  const crossUnder: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      emaFast[i] = closes[i];
      emaSlow[i] = closes[i];
    } else {
      emaFast[i] = closes[i] * kFast + emaFast[i - 1] * (1 - kFast);
      emaSlow[i] = closes[i] * kSlow + emaSlow[i - 1] * (1 - kSlow);
    }

    if (i > 0) {
      const prevDiff = emaFast[i - 1] - emaSlow[i - 1];
      const currDiff = emaFast[i] - emaSlow[i];
      if (prevDiff <= 0 && currDiff > 0) {
        crossOver.push(i);
      }
      if (prevDiff >= 0 && currDiff < 0) {
        crossUnder.push(i);
      }
    }
  }

  return { crossOver, crossUnder };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('EMA Cross Strategy - label and entry alignment', () => {
  it('strategy entry markers should align with EMA crossover/crossunder bars', () => {
    const bars = createCrossoverBars();
    const closes = bars.map((b) => b.close);

    // Compute where crossover/crossunder actually occurs
    const expected = computeEMACrosspoints(closes, 9, 21);

    console.log('Expected crossover bars:', expected.crossOver);
    console.log('Expected crossunder bars:', expected.crossUnder);

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

    // Entry markers for "Long" should be on crossover bars
    const longEntries = entryMarkers.filter((m) => m.name === 'Long');
    const shortEntries = entryMarkers.filter((m) => m.name === 'Short');

    console.log('\n--- Alignment Check ---');
    console.log(
      'Long entries at bars:',
      longEntries.map((m) => m.barIndex),
    );
    console.log('Expected crossovers at bars:', expected.crossOver);
    console.log(
      'Short entries at bars:',
      shortEntries.map((m) => m.barIndex),
    );
    console.log('Expected crossunders at bars:', expected.crossUnder);

    // Check alignment
    expect(longEntries.map((m) => m.barIndex).sort((a, b) => a - b)).toEqual(expected.crossOver);
    expect(shortEntries.map((m) => m.barIndex).sort((a, b) => a - b)).toEqual(expected.crossUnder);
  });

  it('label bar indices should match strategy marker bar indices', () => {
    const bars = createCrossoverBars();

    const { ast } = parse(strategySource);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);
    const contexts = barsToContext(bars);
    const result = engine.executeBars(contexts);

    // Map labels to bar indices
    const labelBarIndices = result.labels
      .map((label) => {
        const barIdx = bars.findIndex((b) => b.timestamp === label.time);
        return { barIdx, text: label.text };
      })
      .filter((l) => l.text === 'Long Cross' || l.text === 'Short Cross');

    // Map entry markers to bar indices
    const entryMarkers = result.strategyMarkers.filter((m) => m.type === 'entry');

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
    expect(longEntryBars).toEqual(longLabelBars);
    expect(shortEntryBars).toEqual(shortLabelBars);
  });
});
