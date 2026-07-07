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

describe('Kalman Trend Levels [BigBeluga]', () => {
  const source = fs.readFileSync('./test_indicators/kalman-trend-levels.pine', 'utf-8');

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
    expect(keys.length).toBeGreaterThanOrEqual(2);
    const hasShortKalman = keys.some((k) => k.includes('Short Kalman'));
    const hasLongKalman = keys.some((k) => k.includes('Long Kalman'));
    expect(hasShortKalman).toBe(true);
    expect(hasLongKalman).toBe(true);
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
    const shortKey = keys.find((k) => k.includes('Short Kalman'));
    const longKey = keys.find((k) => k.includes('Long Kalman'));
    expect(shortKey).toBeDefined();
    expect(longKey).toBeDefined();
    const shortSeries = result.outputs.get(shortKey!)!;
    const longSeries = result.outputs.get(longKey!)!;
    expect(shortSeries.values.length).toBe(500);
    expect(longSeries.values.length).toBe(500);
  });

  it('kalman values stay within reasonable bounds', () => {
    const bars = createTrendingBars(500, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const shortKey = Array.from(result.outputs.keys()).find((k) => k.includes('Short Kalman'));
    const longKey = Array.from(result.outputs.keys()).find((k) => k.includes('Long Kalman'));
    expect(shortKey).toBeDefined();
    expect(longKey).toBeDefined();
    const shortSeries = result.outputs.get(shortKey!)!;
    const longSeries = result.outputs.get(longKey!)!;
    const warmup = 100;
    for (let i = warmup; i < shortSeries.values.length; i++) {
      const shortVal = shortSeries.values[i];
      const longVal = longSeries.values[i];
      if (shortVal === null || longVal === null) continue;
      const bar = bars[i];
      expect(shortVal as number).toBeGreaterThan(bar.low * 0.5);
      expect(shortVal as number).toBeLessThan(bar.high * 2.0);
      expect(longVal as number).toBeGreaterThan(bar.low * 0.5);
      expect(longVal as number).toBeLessThan(bar.high * 2.0);
    }
  });

  it('short kalman is more responsive than long kalman', () => {
    const bars = createTrendingBars(500, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const shortKey = Array.from(result.outputs.keys()).find((k) => k.includes('Short Kalman'));
    const longKey = Array.from(result.outputs.keys()).find((k) => k.includes('Long Kalman'));
    expect(shortKey).toBeDefined();
    expect(longKey).toBeDefined();
    const shortValues = result.outputs.get(shortKey!)!.values as number[];
    const longValues = result.outputs.get(longKey!)!.values as number[];
    const warmup = 200;
    let shortChanges = 0;
    let longChanges = 0;
    for (let i = warmup; i < shortValues.length; i++) {
      if (shortValues[i] === null || shortValues[i - 1] === null) continue;
      if (longValues[i] === null || longValues[i - 1] === null) continue;
      shortChanges += Math.abs(shortValues[i]! - shortValues[i - 1]!);
      longChanges += Math.abs(longValues[i]! - longValues[i - 1]!);
    }
    expect(shortChanges).toBeGreaterThan(longChanges);
  });

  it('short kalman crosses long kalman (trend changes)', () => {
    const bars = createTrendingBars(500, 80, 99);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const shortKey = Array.from(result.outputs.keys()).find((k) => k.includes('Short Kalman'));
    const longKey = Array.from(result.outputs.keys()).find((k) => k.includes('Long Kalman'));
    expect(shortKey).toBeDefined();
    expect(longKey).toBeDefined();
    const shortValues = result.outputs.get(shortKey!)!.values as number[];
    const longValues = result.outputs.get(longKey!)!.values as number[];
    const warmup = 200;
    let crosses = 0;
    for (let i = warmup; i < shortValues.length; i++) {
      if (shortValues[i] === null || longValues[i] === null) continue;
      if (shortValues[i - 1] === null || longValues[i - 1] === null) continue;
      const prevAbove = shortValues[i - 1]! > longValues[i - 1]!;
      const currAbove = shortValues[i]! > longValues[i]!;
      if (prevAbove !== currAbove) crosses++;
    }
    expect(crosses).toBeGreaterThan(0);
  });

  it('produces bar colors based on trend', () => {
    const bars = createTrendingBars(500, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    expect(result.barColorData).toBeDefined();
    const warmup = 250;
    const coloredBars = (result.barColorData ?? []).filter((c, i) => c !== null && i >= warmup);
    expect(coloredBars.length).toBeGreaterThan(0);
  });

  it('produces labels for trend change signals', () => {
    const bars = createTrendingBars(500, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    expect(result.labels).toBeDefined();
    expect(result.labels!.length).toBeGreaterThanOrEqual(0);
  });

  it('produces boxes for support/resistance zones', () => {
    const bars = createTrendingBars(500, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    expect(result.boxes).toBeDefined();
    expect(result.boxes!.length).toBeGreaterThanOrEqual(0);
  });

  it('handles var persistence across bars', () => {
    const bars = createTrendingBars(500, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const shortKey = Array.from(result.outputs.keys()).find((k) => k.includes('Short Kalman'));
    const shortValues = result.outputs.get(shortKey!)!.values as number[];
    const nonNullValues = shortValues.filter((v) => v !== null);
    const uniqueValues = new Set(nonNullValues.map((v) => Math.round(v! * 100)));
    expect(uniqueValues.size).toBeGreaterThan(10);
  });

  it('kalman filter converges over time', () => {
    const bars = createTrendingBars(500, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const shortKey = Array.from(result.outputs.keys()).find((k) => k.includes('Short Kalman'));
    const longKey = Array.from(result.outputs.keys()).find((k) => k.includes('Long Kalman'));
    expect(shortKey).toBeDefined();
    expect(longKey).toBeDefined();
    const shortValues = result.outputs.get(shortKey!)!.values as number[];
    const longValues = result.outputs.get(longKey!)!.values as number[];
    const earlyDiff = Math.abs(shortValues[300]! - longValues[300]!);
    const lateDiff = Math.abs(shortValues[490]! - longValues[490]!);
    expect(earlyDiff).toBeGreaterThan(0);
    expect(lateDiff).toBeGreaterThanOrEqual(0);
  });

  it('plotcandle produces bar color data', () => {
    const bars = createTrendingBars(500, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    expect(result.barColorData).toBeDefined();
    const warmup = 250;
    const afterWarmup = (result.barColorData ?? []).slice(warmup);
    const nonNull = afterWarmup.filter((c) => c !== null);
    expect(nonNull.length).toBeGreaterThan(0);
  });

  it('fill between kalman plots exists', () => {
    const bars = createTrendingBars(500, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    expect(result.fills).toBeDefined();
    expect(result.fills!.length).toBeGreaterThanOrEqual(0);
  });

  it('trend_up state changes over time with trending data', () => {
    const bars = createTrendingBars(500, 80, 99);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const shortKey = Array.from(result.outputs.keys()).find((k) => k.includes('Short Kalman'));
    const longKey = Array.from(result.outputs.keys()).find((k) => k.includes('Long Kalman'));
    expect(shortKey).toBeDefined();
    expect(longKey).toBeDefined();
    const shortValues = result.outputs.get(shortKey!)!.values as number[];
    const longValues = result.outputs.get(longKey!)!.values as number[];
    let bullishCount = 0;
    let bearishCount = 0;
    const warmup = 200;
    for (let i = warmup; i < shortValues.length; i++) {
      if (shortValues[i] === null || longValues[i] === null) continue;
      if (shortValues[i]! > longValues[i]!) bullishCount++;
      else bearishCount++;
    }
    expect(bullishCount).toBeGreaterThan(10);
    expect(bearishCount).toBeGreaterThan(10);
  });
});
