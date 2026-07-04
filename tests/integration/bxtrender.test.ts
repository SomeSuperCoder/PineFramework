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

function runEngine(source: string, bars: ReturnType<typeof createTrendingBars>) {
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
  return { engine, bars, result: engine.executeBars(contexts) };
}

describe('B-Xtrender @Puppytherapy', () => {
  const source = fs.readFileSync('./test_indicators/bxtrender.pine', 'utf-8');

  it('parses successfully', () => {
    const result = parse(source);
    expect(result.ast).toBeDefined();
  });

  it('compiles successfully with overlay=false', () => {
    const { ast } = parse(source);
    const compiled = compile(ast);
    expect(compiled).toBeDefined();
    expect(compiled.ir.overlay).toBe(false);
  });

  it('executes on a single bar without crashing', () => {
    const { ast } = parse(source);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);
    const bar = { timestamp: Date.now(), open: 100, high: 101, low: 99, close: 100, volume: 1000 };
    const ctx: ExecutionContext = {
      barIndex: 0,
      barCount: 1,
      timestamp: bar.timestamp,
      open: createSeries('open', [bar.open]),
      high: createSeries('high', [bar.high]),
      low: createSeries('low', [bar.low]),
      close: createSeries('close', [bar.close]),
      volume: createSeries('volume', [bar.volume]),
    };
    const result = engine.executeBar(ctx);
    expect(result.success).toBe(true);
  });

  it('produces 6 output series (6 plot calls)', () => {
    const bars = createTrendingBars(300, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const keys = Array.from(result.outputs.keys());
    expect(keys.length).toBe(6);
  });

  it('has expected output key names', () => {
    const bars = createTrendingBars(300, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const keys = Array.from(result.outputs.keys());
    expect(keys.some((k) => k.includes('B-Xtrender Osc.'))).toBe(true);
    expect(keys.some((k) => k.includes('B-Xtrender Shadow'))).toBe(true);
    expect(keys.some((k) => k.includes('B-Xtrender Color'))).toBe(true);
    expect(keys.some((k) => k.includes('B-Xtrender Trend'))).toBe(true);
  });

  it('produces non-null values after warm-up period', () => {
    const bars = createTrendingBars(300, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const warmup = 30;
    for (const [, series] of result.outputs) {
      let nonNullCount = 0;
      for (let i = warmup; i < series.values.length; i++) {
        if (series.values[i] !== null && series.values[i] !== undefined) {
          nonNullCount++;
        }
      }
      expect(nonNullCount).toBeGreaterThan(0);
    }
  });

  it('short-term histogram oscillates around zero', () => {
    const bars = createTrendingBars(300, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const oscKey = Array.from(result.outputs.keys()).find((k) => k.includes('B-Xtrender Osc.'));
    expect(oscKey).toBeDefined();
    const series = result.outputs.get(oscKey!)!;
    const warmup = 50;
    let positiveCount = 0;
    let negativeCount = 0;
    for (let i = warmup; i < series.values.length; i++) {
      const v = series.values[i];
      if (typeof v === 'number') {
        if (v > 0) positiveCount++;
        if (v < 0) negativeCount++;
      }
    }
    expect(positiveCount).toBeGreaterThan(0);
    expect(negativeCount).toBeGreaterThan(0);
  });

  it('T3 moving average is smoother than raw shortTermXtrender', () => {
    const bars = createTrendingBars(300, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const oscKey = Array.from(result.outputs.keys()).find((k) => k.includes('B-Xtrender Osc.'));
    const colorKey = Array.from(result.outputs.keys()).find((k) => k.includes('B-Xtrender Color'));
    expect(oscKey).toBeDefined();
    expect(colorKey).toBeDefined();
    const rawSeries = result.outputs.get(oscKey!)!;
    const t3Series = result.outputs.get(colorKey!)!;
    const warmup = 60;
    let rawVolatility = 0;
    let t3Volatility = 0;
    for (let i = warmup + 1; i < rawSeries.values.length; i++) {
      const rv = rawSeries.values[i];
      const rvPrev = rawSeries.values[i - 1];
      const tv = t3Series.values[i];
      const tvPrev = t3Series.values[i - 1];
      if (typeof rv === 'number' && typeof rvPrev === 'number')
        rawVolatility += Math.abs(rv - rvPrev);
      if (typeof tv === 'number' && typeof tvPrev === 'number')
        t3Volatility += Math.abs(tv - tvPrev);
    }
    expect(t3Volatility).toBeLessThan(rawVolatility);
  });

  it('produces shapes from plotshape calls', () => {
    const bars = createTrendingBars(300, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    expect(result.shapes).toBeDefined();
    expect(result.shapes.length).toBeGreaterThan(0);
    for (const shape of result.shapes) {
      expect(shape.time).toBeDefined();
      expect(shape.color).toBeDefined();
    }
  });

  it('plotshape shapes have circle style', () => {
    const bars = createTrendingBars(300, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    for (const shape of result.shapes) {
      expect(shape.style).toBe('circle');
    }
  });

  it('plotshape shapes use location.absolute', () => {
    const bars = createTrendingBars(300, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    for (const shape of result.shapes) {
      expect(shape.location).toBe('absolute');
    }
  });

  it('shapes have overlay=false for non-overlay indicator', () => {
    const bars = createTrendingBars(300, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    expect(result.shapes.length).toBeGreaterThan(0);
    for (const shape of result.shapes) {
      expect(shape.overlay).toBe(false);
    }
  });

  it('produces plot colors for colored plots', () => {
    const bars = createTrendingBars(300, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    expect(result.plotColors).toBeDefined();
    const plotColorKeys = Array.from(result.plotColors!.keys());
    expect(plotColorKeys.length).toBeGreaterThan(0);
  });
});
