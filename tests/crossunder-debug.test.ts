import { parse } from '../src/language/parser/parser.js';
import { compile } from '../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../src/language/runtime/execution-engine.js';
import { createSeries } from '../src/language/runtime/series.js';

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

const source = `
//@version=5
strategy("Test Crossunder", overlay=true)
fastLength = input.int(9)
slowLength = input.int(21)
fastEMA = ta.ema(close, fastLength)
slowEMA = ta.ema(close, slowLength)
longCondition = ta.crossover(fastEMA, slowEMA)
shortCondition = ta.crossunder(fastEMA, slowEMA)
plot(longCondition ? 1 : 0, "longCond")
plot(shortCondition ? 1 : 0, "shortCond")
`;

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
  return { engine, result: engine.executeBars(contexts) };
}

test('crossunder debug', () => {
  const bars = createTrendingBars(100, 100);
  const { engine, result } = runEngine(source, bars);

  // Check crossPrevValues state
  const engineAny = engine as any;
  console.log('crossPrevValues:', engineAny.crossPrevValues);
  console.log('atrState:', engineAny.atrState);

  // Check plot outputs
  for (const [key, series] of result.outputs) {
    const vals = series.values.filter((v: any) => v !== null);
    if (vals.length > 0) {
      console.log(`Output ${key}: ${vals.length} non-null, last 5:`, vals.slice(-5));
    }
  }

  expect(true).toBe(true);
});
