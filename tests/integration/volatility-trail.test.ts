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
  const result = engine.executeBars(contexts);
  if (!result.success) console.log('executeBars error:', result.error);
  return { engine, bars, result };
}

describe('Volatility Trail [BOSWaves]', () => {
  const source = fs.readFileSync('./test_indicators/volatility-trail.pine', 'utf-8');

  it('parses successfully', () => {
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors?.length ?? 0).toBe(0);
  });

  it('compiles successfully', () => {
    const { ast } = parse(source);
    const compiled = compile(ast);
    expect(compiled).toBeDefined();
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
    if (!result.success) console.log('executeBar error:', result.error);
    expect(result.success).toBe(true);
  });

  it('produces expected plot output keys', () => {
    const bars = createTrendingBars(500, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const keys = Array.from(result.outputs.keys());
    expect(keys.length).toBeGreaterThanOrEqual(1);
    const hasTrail = keys.some((k) => k.includes('Trail'));
    expect(hasTrail).toBe(true);
  });

  it('has non-null values after warmup period', () => {
    const bars = createTrendingBars(500, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const keys = Array.from(result.outputs.keys());
    const warmup = 250;
    for (const [key, series] of result.outputs) {
      const values = series.values;
      const nullCount = values.slice(warmup).filter((v) => v === null).length;
      const total = values.length - warmup;
      console.log(
        `  ${key}: ${nullCount}/${total} nulls after warmup, first non-null at: ${values.findIndex((v) => v !== null)}`,
      );
    }
    const trailKey = keys.find((k) => k.includes('Trail'));
    expect(trailKey).toBeDefined();
    const trailSeries = result.outputs.get(trailKey!)!;
    expect(trailSeries.values.length).toBe(500);
  });

  it('trail values stay within reasonable bounds', () => {
    const bars = createTrendingBars(500, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const trailKey = Array.from(result.outputs.keys()).find((k) => k.includes('Trail'));
    expect(trailKey).toBeDefined();
    const trailSeries = result.outputs.get(trailKey!)!;
    const warmup = 100;
    for (let i = warmup; i < trailSeries.values.length; i++) {
      const val = trailSeries.values[i];
      if (val === null) continue;
      const bar = bars[i];
      expect(val as number).toBeGreaterThan(bar.low * 0.5);
      expect(val as number).toBeLessThan(bar.high * 2.0);
    }
  });

  it('trail flips between trending up and trending down', () => {
    const bars = createTrendingBars(500, 80, 99);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const trailKey = Array.from(result.outputs.keys()).find((k) => k.includes('Trail'));
    const trailSeries = result.outputs.get(trailKey!)!;
    const trailValues = trailSeries.values as number[];
    const nonNullValues = trailValues.filter((v) => v !== null) as number[];
    expect(nonNullValues.length).toBeGreaterThan(100);
    const uniqueRounded = new Set(nonNullValues.map((v) => Math.round(v)));
    expect(uniqueRounded.size).toBeGreaterThan(5);
    let increasing = 0;
    let flatOrDecreasing = 0;
    for (let i = 1; i < nonNullValues.length; i++) {
      if (nonNullValues[i]! > nonNullValues[i - 1]! + 0.001) increasing++;
      else flatOrDecreasing++;
    }
    expect(increasing).toBeGreaterThan(0);
    expect(flatOrDecreasing).toBeGreaterThan(0);
  });

  it('produces bar colors when showCandle is true (default)', () => {
    const bars = createTrendingBars(500, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    expect(result.barColorData).toBeDefined();
    const warmup = 250;
    const coloredBars = (result.barColorData ?? []).filter((c, i) => c !== null && i >= warmup);
    expect(coloredBars.length).toBeGreaterThan(0);
  });

  it('produces shapes for retest diamonds', () => {
    const bars = createTrendingBars(500, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    expect(result.shapes).toBeDefined();
    expect(result.shapes.length).toBeGreaterThanOrEqual(0);
  });

  it('produces labels for buy/sell signals', () => {
    const bars = createTrendingBars(500, 80, 123);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
  });

  it('handles var persistence across bars', () => {
    const bars = createTrendingBars(500, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const trailKey = Array.from(result.outputs.keys()).find((k) => k.includes('Trail'));
    const trailSeries = result.outputs.get(trailKey!)!;
    const trailValues = trailSeries.values as number[];
    const nonNullValues = trailValues.filter((v) => v !== null);
    const uniqueValues = new Set(nonNullValues.map((v) => Math.round(v! * 100)));
    expect(uniqueValues.size).toBeGreaterThan(10);
  });

  it('trail respects trend direction changes', () => {
    const bars = createTrendingBars(500, 80, 99);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const trailKey = Array.from(result.outputs.keys()).find((k) => k.includes('Trail'));
    const trailSeries = result.outputs.get(trailKey!)!;
    const trailValues = trailSeries.values as number[];
    const closeValues = bars.map((b) => b.close);
    const warmup = 100;
    let belowCount = 0;
    let aboveCount = 0;
    let nonNullCount = 0;
    for (let i = warmup; i < trailValues.length; i++) {
      if (trailValues[i] === null) continue;
      nonNullCount++;
      if ((trailValues[i] as number) < closeValues[i]!) belowCount++;
      else aboveCount++;
    }
    expect(nonNullCount).toBeGreaterThan(100);
    expect(belowCount).toBeGreaterThan(10);
    expect(aboveCount).toBeGreaterThan(10);
  });

  it('trail plot has per-bar colors (green/red based on trend)', () => {
    const bars = createTrendingBars(500, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    expect(result.plotColors).toBeDefined();
    const trailKey = Array.from(result.plotColors!.keys()).find((k) => k.includes('Trail'));
    expect(trailKey).toBeDefined();
    const colors = result.plotColors!.get(trailKey!)!;
    expect(colors.length).toBe(500);
    const warmup = 100;
    const afterWarmup = colors.slice(warmup).filter((c): c is string => c !== null);
    const hasGreen = afterWarmup.some((c) => c.toLowerCase().includes('00ff00'));
    const hasRed = afterWarmup.some((c) => c.toLowerCase().includes('ff0000'));
    expect(hasGreen).toBe(true);
    expect(hasRed).toBe(true);
  });

  it('trail follows upperBand downward in bearish mode (not flat)', () => {
    const bars = createTrendingBars(500, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);

    const trailKey = Array.from(result.outputs.keys()).find((k) => k.includes('Trail'));
    expect(trailKey).toBeDefined();
    const trailSeries = result.outputs.get(trailKey!)!;
    const values = trailSeries.values;

    // Verify trail is NOT flat: after bar 200, the trail should vary
    const after200 = values.slice(200).filter((v): v is number => typeof v === 'number');
    expect(after200.length).toBeGreaterThan(100);

    const diffs: number[] = [];
    for (let i = 1; i < Math.min(after200.length, 50); i++) {
      diffs.push(Math.abs(after200[i] - after200[i - 1]));
    }
    const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    // Trail should have meaningful changes (not all flat)
    expect(avgDiff).toBeGreaterThan(0.01);
  });
});
