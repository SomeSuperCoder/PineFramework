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
    open: createSeries('open', bars.slice(0, i + 1).map((b) => b.open)),
    high: createSeries('high', bars.slice(0, i + 1).map((b) => b.high)),
    low: createSeries('low', bars.slice(0, i + 1).map((b) => b.low)),
    close: createSeries('close', bars.slice(0, i + 1).map((b) => b.close)),
    volume: createSeries('volume', bars.slice(0, i + 1).map((b) => b.volume)),
  }));
  return { engine, bars, result: engine.executeBars(contexts) };
}

describe('Q-Trend', () => {
  const source = fs.readFileSync('./test_indicators/q-trend.pine', 'utf-8');

  it('parses successfully', () => {
    const result = parse(source);
    expect(result.ast).toBeDefined();
  });

  it('compiles successfully', () => {
    const { ast } = parse(source);
    const compiled = compile(ast);
    expect(compiled).toBeDefined();
  });

  it('executes on 500 bars without crashing', () => {
    const bars = createTrendingBars(500, 100);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
  });

  it('has overlay=true', () => {
    const { ast } = parse(source);
    const compiled = compile(ast);
    expect(compiled.ir.overlay).toBe(true);
  });
});
