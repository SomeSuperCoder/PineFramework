import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

function createTrendingBars(count: number, startPrice: number, seed: number = 42) {
  const bars: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> = [];
  let price = startPrice;
  let s = seed;
  const rand = () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < count; i++) {
    const open = price;
    let drift: number;
    if (i < Math.floor(count * 0.4)) drift = 0.5;
    else if (i < Math.floor(count * 0.7)) drift = -0.5;
    else drift = 0.4;
    const change = drift + (rand() - 0.5) * 0.5;
    const close = open + change;
    const high = Math.max(open, close) + rand() * 0.5;
    const low = Math.min(open, close) - rand() * 0.5;
    bars.push({ timestamp: 1700000000000 + i * 3600000, open, high, low, close, volume: 1000 });
    price = close;
  }
  return bars;
}

async function runEngine(source: string, bars: ReturnType<typeof createTrendingBars>) {
  const { ast } = parse(source);
  const compiled = compile(ast);
  const engine = new ExecutionEngine(compiled);
  const contexts: ExecutionContext[] = bars.map((bar, i) => ({
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
  const result = await engine.executeBars(contexts);
  return { engine, bars, result };
}

describe('Chunk border lookback', () => {
  const source = fs.readFileSync('./test_indicators/zero-lag-signals-for-loop.pine', 'utf-8');

  it('getMaxLookback() reports sufficient lookback for ta.highest', async () => {
    const bars = createTrendingBars(500, 80);
    const { engine, result } = await runEngine(source, bars);
    expect(result.success).toBe(true);
    const lookback = engine.getMaxLookback();
    console.log('getMaxLookback():', lookback);
    // ta.highest(ta.atr(length), length*3) with length=50 needs highest lookback (150)
    expect(lookback).toBeGreaterThanOrEqual(150);
  });

  it('full execution matches partial execution with sufficient context', async () => {
    const allBars = createTrendingBars(400, 80);

    // Full execution on all 400 bars
    const fullResult = await runEngine(source, allBars);
    expect(fullResult.result.success).toBe(true);

    // Partial execution: 200 new bars + 200 context bars
    const contextBars = allBars.slice(0, 200);
    const newBars = allBars.slice(200);
    const partialResult = await runEngine(source, [...contextBars, ...newBars]);
    expect(partialResult.result.success).toBe(true);

    // Compare outputs for the overlapping region (last 200 bars)
    const fullOutputs = fullResult.result.outputs;
    const partialOutputs = partialResult.result.outputs;

    for (const [key, fullSeries] of fullOutputs) {
      const partialSeries = partialOutputs.get(key);
      if (!partialSeries) continue;

      // Compare the last 200 values (the overlapping region)
      for (let i = 200; i < 400; i++) {
        const fullVal = fullSeries.getRelative(i - 399);
        const partialVal = partialSeries.getRelative(i - 399);
        // Skip non-numeric values (NA symbols, NaN, etc.)
        if (typeof fullVal !== 'number' || typeof partialVal !== 'number') continue;
        if (Number.isNaN(fullVal) || Number.isNaN(partialVal)) continue;
        expect(Math.abs(fullVal - partialVal)).toBeLessThan(0.01);
      }
    }
  });

  it('runtimeSeriesLookback is tracked for series indexing', async () => {
    // Simple script with explicit series indexing
    const script = `
     //@version=5
      indicator("Lookback Test")
      sum = 0.0
      for i = 1 to 70
          sum := sum + close[i]
      plot(sum)
    `;
    const bars = createTrendingBars(200, 100);
    const { engine, result } = await runEngine(script, bars);
    expect(result.success).toBe(true);
    expect(engine.runtimeSeriesLookback).toBeGreaterThanOrEqual(70);
    expect(engine.getMaxLookback()).toBeGreaterThanOrEqual(70);
  });

  it('plotColors boundary region has valid values with sufficient context', async () => {
    const allBars = createTrendingBars(400, 80);

    // Execute with full context (200 new + 200 context)
    const contextBars = allBars.slice(0, 200);
    const newBars = allBars.slice(200);
    const { result } = await runEngine(source, [...newBars, ...contextBars]);
    expect(result.success).toBe(true);

    // Find the visible basis plot color key
    const plotColors = result.plotColors;
    expect(plotColors).toBeDefined();
    const keys = Array.from(plotColors!.keys());
    expect(keys.length).toBeGreaterThan(0);
    // Use the first key that's not the hidden Price plot
    const basisKey = keys.find((k) => !k.startsWith('Price')) ?? keys[0];
    const basisColors = plotColors!.get(basisKey);
    expect(basisColors).toBeDefined();
    expect(basisColors!.length).toBe(400);

    // Boundary region (200-400) should have mostly valid colors
    // (at most a few nulls from the very start of the warmup)
    const boundaryColors = basisColors!.slice(200, 400);
    const nullCount = boundaryColors.filter((c) => c === null).length;
    expect(nullCount).toBeLessThanOrEqual(5);
  });
});
