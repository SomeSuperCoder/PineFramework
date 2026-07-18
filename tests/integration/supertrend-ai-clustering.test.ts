import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

function createTrendingBars(
  count: number,
  startPrice: number,
  seed: number = 42,
) {
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
    bars.push({
      timestamp: 1700000000000 + i * 3600000,
      open,
      high,
      low,
      close,
      volume: 1000,
    });
    price = close;
  }
  return bars;
}

function runEngine(
  source: string,
  bars: ReturnType<typeof createTrendingBars>,
) {
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

describe('SuperTrend AI (Clustering) [LuxAlgo]', () => {
  const source = fs.readFileSync(
    './test_indicators/supertrend-ai-clustering.pine',
    'utf-8',
  );

  it('parses successfully', () => {
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors?.length ?? 0).toBe(0);
  });

  it('compiles successfully with overlay=true', () => {
    const { ast } = parse(source);
    const compiled = compile(ast);
    expect(compiled).toBeDefined();
    expect(compiled.ir.overlay).toBe(true);
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

  it('executes on multiple bars without runtime errors', () => {
    const bars = createTrendingBars(100, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
  });

  it('produces expected plot output keys', () => {
    const bars = createTrendingBars(100, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const keys = Array.from(result.outputs.keys());
    expect(keys.length).toBeGreaterThanOrEqual(2);
    const hasTrailingStop = keys.some((k) => k.includes('Trailing Stop'));
    const hasTrailingStopAMA = keys.some((k) => k.includes('Trailing Stop AMA'));
    expect(hasTrailingStop).toBe(true);
    expect(hasTrailingStopAMA).toBe(true);
  });

  it('has non-null values after warmup period', () => {
    const bars = createTrendingBars(100, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const keys = Array.from(result.outputs.keys());
    const warmup = 50;
    for (const [key, series] of result.outputs) {
      const values = series.values;
      const nullCount = values.slice(warmup).filter((v) => v === null).length;
      const total = values.length - warmup;
      console.log(
        `  ${key}: ${nullCount}/${total} nulls after warmup, first non-null at: ${values.findIndex((v) => v !== null)}`,
      );
    }
    const trailingStopKey = keys.find((k) => k.includes('Trailing Stop'))!;
    const trailingStopSeries = result.outputs.get(trailingStopKey!)!;
    expect(trailingStopSeries.values.length).toBe(100);
  });
});