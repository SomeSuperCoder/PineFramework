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
indicator("Test")

bullBias = close > open
bgcolor(bullBias ? color.new(color.green, 92) : color.new(color.red, 92))`;

const { ast } = parse(source);
const compileResult = compile(ast);
const engine = new ExecutionEngine(compileResult);
const bars = createBars(5);
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

console.log('Success:', lastResult!.success);
console.log('Bgcolor entries:', lastResult!.bgcolor.length);
for (const b of lastResult!.bgcolor) {
  console.log('  time:', b.time, 'color:', b.color);
}
