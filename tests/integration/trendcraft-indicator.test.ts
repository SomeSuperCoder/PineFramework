import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine, type ExecutionContext } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import type { Bar } from '../../src/data/bar.js';

function createBars(count: number, startPrice: number = 100) {
  const bars: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const open = price;
    const change = (Math.random() - 0.5) * 3;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * 2;
    const low = Math.min(open, close) - Math.random() * 2;
    bars.push({ timestamp: Date.now() + i * 86400000, open, high, low, close, volume: Math.floor(Math.random() * 10000) + 1000 });
    price = close;
  }
  return bars;
}

describe('TrendCraft ICT SwiftEdge Indicator', () => {
  const source = fs.readFileSync('./test_indicators/trendcraft-ict-swiftedge.pine', 'utf-8');

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

  it('resolves syminfo.tickerid at runtime', () => {
    const testSource = `//@version=6
indicator("SymInfo Test")
x = syminfo.tickerid
plot(x, "ticker")`;
    const { ast } = parse(testSource);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);
    const bar: Bar = { timestamp: Date.now(), open: 100, high: 101, low: 99, close: 100, volume: 1000 };
    const ctx: ExecutionContext = { barIndex: 0, barCount: 1, timestamp: bar.timestamp, open: createSeries('open', [bar.open]), high: createSeries('high', [bar.high]), low: createSeries('low', [bar.low]), close: createSeries('close', [bar.close]), volume: createSeries('volume', [bar.volume]) };
    const result = engine.executeBar(ctx);
    expect(result.success).toBe(true);
  });

  it('executes the full indicator on one bar without crashing', () => {
    const { ast } = parse(source);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);
    const bar: Bar = { timestamp: Date.now(), open: 100, high: 101, low: 99, close: 100, volume: 1000 };
    const ctx: ExecutionContext = { barIndex: 0, barCount: 1, timestamp: bar.timestamp, open: createSeries('open', [bar.open]), high: createSeries('high', [bar.high]), low: createSeries('low', [bar.low]), close: createSeries('close', [bar.close]), volume: createSeries('volume', [bar.volume]) };
    const result = engine.executeBar(ctx);
    if (!result.success) {
      console.error('Execution error:', result.error);
    }
    expect(result.success).toBe(true);
  });

  it('executes the full indicator on multiple bars without crashing', () => {
    const { ast } = parse(source);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);
    const bars = createBars(50, 100);
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
    const result = engine.executeBars(contexts);
    expect(result.success).toBe(true);
    expect(result.outputs.size).toBe(2);
    expect(result.fills.length).toBeGreaterThan(0);
    for (const [key, series] of result.outputs) {
      const nonNull = series.values.filter(v => v !== null && v !== undefined);
      expect(nonNull.length).toBeGreaterThan(0);
      console.log(`  ${key}: ${nonNull.length}/${series.values.length} non-null`);
    }
  });
});
