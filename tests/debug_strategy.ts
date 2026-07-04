import { parse } from '../src/language/parser/parser.js';
import { compile } from '../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../src/language/runtime/execution-engine.js';
import { createSeries } from '../src/language/runtime/series.js';
import type { Bar } from '../src/data/bar.js';

function createBars(count: number, startPrice: number = 100): Bar[] {
  const bars: Bar[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const open = price;
    const change = (Math.random() - 0.5) * 10;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * 5;
    const low = Math.min(open, close) - Math.random() * 5;
    bars.push({ timestamp: Date.now() + i * 86400000, open, high, low, close, volume: 1000 });
    price = close;
  }
  return bars;
}

const source = `//@version=6
strategy("Test", overlay=true)

if close > open
    strategy.entry("Long", strategy.long)

if close < open
    strategy.close("Long")`;

const { ast } = parse(source);
const compileResult = compile(ast);
const engine = new ExecutionEngine(compileResult);
const bars = createBars(10);
const contexts = bars.map((bar, index) => ({
  barIndex: index,
  barCount: bars.length,
  timestamp: bar.timestamp,
  open: createSeries('open', [bar.open]),
  high: createSeries('high', [bar.high]),
  low: createSeries('low', [bar.low]),
  close: createSeries('close', [bar.close]),
  volume: createSeries('volume', [bar.volume]),
}));

let lastResult;
for (const ctx of contexts) {
  lastResult = engine.executeBar(ctx);
  if (!lastResult.success) {
    console.error('FAILED:', lastResult.error);
    break;
  }
}

console.log('Strategy markers:');
for (const m of lastResult!.strategyMarkers) {
  console.log('  type:', m.type, 'barIndex:', m.barIndex, 'timestamp:', m.timestamp);
}
