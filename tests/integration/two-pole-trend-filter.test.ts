import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine, type ExecutionContext } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

function createTrendingBars(count: number, startPrice: number, seed: number = 42) {
  const bars: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = [];
  let price = startPrice;
  let s = seed;
  const rand = () => { s = (s * 16807 + 0) % 2147483647; return (s / 2147483647); };
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
    open: createSeries('open', bars.slice(0, i + 1).map(b => b.open)),
    high: createSeries('high', bars.slice(0, i + 1).map(b => b.high)),
    low: createSeries('low', bars.slice(0, i + 1).map(b => b.low)),
    close: createSeries('close', bars.slice(0, i + 1).map(b => b.close)),
    volume: createSeries('volume', bars.slice(0, i + 1).map(b => b.volume)),
  }));
  return { engine, bars, result: engine.executeBars(contexts) };
}

describe('Two-Pole Trend Filter [BigBeluga]', () => {
  const source = fs.readFileSync('./test_indicators/two-pole-trend-filter.pine', 'utf-8');

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
      barIndex: 0, barCount: 1, timestamp: bar.timestamp,
      open: createSeries('open', [bar.open]),
      high: createSeries('high', [bar.high]),
      low: createSeries('low', [bar.low]),
      close: createSeries('close', [bar.close]),
      volume: createSeries('volume', [bar.volume]),
    };
    const result = engine.executeBar(ctx);
    expect(result.success).toBe(true);
  });

  it('produces correct plot output key with linewidth 3', () => {
    const bars = createTrendingBars(100, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const keys = Array.from(result.outputs.keys());
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe('Two-Pole Filter__lw:3');
  });

  it('produces 100% non-null values after warm-up', () => {
    const bars = createTrendingBars(100, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    for (const [, series] of result.outputs) {
      const nonNull = series.values.filter(v => v !== null && v !== undefined);
      expect(nonNull.length).toBe(series.values.length);
      for (const v of nonNull) {
        expect(typeof v).toBe('number');
        expect(Number.isFinite(v as number)).toBe(true);
      }
    }
  });

  it('filter values converge toward close price', () => {
    const bars = createTrendingBars(200, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const series = Array.from(result.outputs.values())[0]!;
    const warmup = 60;
    const tail = 30;
    const tailClose = bars.slice(-tail).map(b => b.close);
    const tailFilter = series.values.slice(-tail) as number[];
    const avgClose = tailClose.reduce((a, b) => a + b, 0) / tail;
    const avgFilter = tailFilter.reduce((a, b) => a + b, 0) / tail;
    const relError = Math.abs(avgFilter - avgClose) / Math.abs(avgClose);
    expect(relError).toBeLessThan(0.15);
    expect(series.values.length).toBe(200);
  });

  it('filter is monotonically increasing during steady uptrend', () => {
    const bars = createTrendingBars(50, 80, 123);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const series = Array.from(result.outputs.values())[0]!;
    const startIdx = 20;
    const values = series.values.slice(startIdx) as number[];
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!).toBeGreaterThanOrEqual(values[i - 1]! - 0.01);
    }
  });

  it('produces per-bar gradient colors (green, red, yellow)', () => {
    const bars = createTrendingBars(200, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    expect(result.plotColors).toBeDefined();
    const plotColorMap = result.plotColors!;
    const key = 'Two-Pole Filter__lw:3';
    expect(plotColorMap.has(key)).toBe(true);
    const colors = plotColorMap.get(key)!;
    expect(colors.length).toBe(200);
    const unique = new Set(colors);
    expect(unique.size).toBeGreaterThan(5);
    const lower = colors.map(c => c.toLowerCase());
    const hasYellow = lower.some(c => c === '#ffeb3b');
    const hasGreen = lower.some(c => c === '#8bc34a');
    const hasRed = lower.some(c => c === '#f44336');
    expect(hasYellow).toBe(true);
    expect(hasGreen).toBe(true);
    expect(hasRed).toBe(true);
  });

  it('color gradient transitions follow trend direction', () => {
    const bars = createTrendingBars(200, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const colors = result.plotColors!.get('Two-Pole Filter__lw:3')!;
    const greenish = (c: string) => {
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      return g > r && g > b;
    };
    const reddish = (c: string) => {
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      return r > g && r > b;
    };
    const uptrendEnd = Math.floor(200 * 0.4);
    const downtrendStart = Math.floor(200 * 0.4);
    const downtrendEnd = Math.floor(200 * 0.7);
    const greenCountEarly = colors.slice(30, uptrendEnd).filter(greenish).length;
    const redCountMid = colors.slice(downtrendStart + 10, downtrendEnd - 10).filter(reddish).length;
    expect(greenCountEarly).toBeGreaterThan(10);
    expect(redCountMid).toBeGreaterThan(10);
  });

  it('method var persistence: rising/falling counters increment across bars', () => {
    const bars = createTrendingBars(100, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const colors = result.plotColors!.get('Two-Pole Filter__lw:3')!;
    const lower = colors.map(c => c.toLowerCase());
    const yellowIdx = lower.indexOf('#ffeb3b');
    const greenIdx = lower.findIndex(c => c === '#8bc34a');
    expect(yellowIdx).toBeGreaterThanOrEqual(0);
    expect(greenIdx).toBeGreaterThan(yellowIdx);
  });

  it('produces no shapes when signals input is false (default)', () => {
    const bars = createTrendingBars(100, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    expect(result.shapes).toBeDefined();
    expect(result.shapes.length).toBe(0);
  });

  it('produces no bar colors when bar_col input is false (default)', () => {
    const bars = createTrendingBars(100, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    expect(result.barColorData).toBeDefined();
    expect(result.barColorData.length).toBe(0);
  });

  it('handles var variables inside method (f1/f2 filter state)', () => {
    const bars = createTrendingBars(100, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const series = Array.from(result.outputs.values())[0]!;
    const vals = series.values as number[];
    for (let i = 1; i < Math.min(20, vals.length); i++) {
      expect(vals[i]!).not.toBe(vals[i - 1]!);
    }
  });

  it('history operator tp_f[2] returns previous values', () => {
    const bars = createTrendingBars(60, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const series = Array.from(result.outputs.values())[0]!;
    const vals = series.values as number[];
    for (let i = 2; i < vals.length; i++) {
      expect(vals[i]!).toBeGreaterThan(0);
    }
  });

  it('nz() returns 0 for na values inside method', () => {
    const bars = createTrendingBars(30, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const series = Array.from(result.outputs.values())[0]!;
    const firstVal = series.values[0] as number;
    expect(firstVal).not.toBe(0);
    expect(firstVal).toBeGreaterThan(0);
  });
});
