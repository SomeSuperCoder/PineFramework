import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine, type ExecutionContext } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

function createTrendingBars(count: number, startPrice: number, seed: number = 42) {
  const bars: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = [];
  let price = startPrice;
  let s = seed;
  const rand = () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
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

describe('SuperTrend AI Debug', () => {
  // Test with a shorter script that uses array methods
  it('array methods work correctly', () => {
    const source = `
//@version=5
indicator("Array Test")
x = array.new<float>(0)
x.push(3.0)
x.push(1.0)
x.push(2.0)
r1 = x.min()   // should be 1
r2 = x.max()   // should be 3
r3 = x.avg()   // should be 2
r4 = x.percentile_linear_interpolation(50)  // should be 2
r5 = x.indexof(2.0)  // should be 2
x.clear()
r6 = x.size()  // should be 0
plot(r1, "min")
plot(r2, "max")
plot(r3, "avg")
plot(r4, "p50")
plot(r5, "idx")
plot(r6, "size")
    `;
    const { ast } = parse(source);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);
    const ctx: ExecutionContext = {
      barIndex: 0, barCount: 1, timestamp: Date.now(),
      open: createSeries('open', [100]), high: createSeries('high', [101]),
      low: createSeries('low', [99]), close: createSeries('close', [100]),
      volume: createSeries('volume', [1000]),
    };
    const result = engine.executeBar(ctx);
    expect(result.success).toBe(true);
    if (result.success) {
      console.log('Output keys:', Array.from(result.outputs.keys()));
      for (const [key, series] of result.outputs) {
        console.log(`  ${key}:`, series.values);
      }
    }
  });

  // Check the actual trailing stop values on full supertrend
  it('tracks trailing stop values on 20 bars', () => {
    const source = fs.readFileSync('./test_indicators/supertrend-ai-clustering.pine', 'utf-8');
    const { ast } = parse(source);
    const compiled = compile(ast);
    const bars = createTrendingBars(20, 80);
    const engine = new ExecutionEngine(compiled);
    const contexts: ExecutionContext[] = bars.map((bar, i) => ({
      barIndex: i, barCount: bars.length, timestamp: bar.timestamp,
      open: createSeries('open', bars.slice(0, i + 1).map(b => b.open)),
      high: createSeries('high', bars.slice(0, i + 1).map(b => b.high)),
      low: createSeries('low', bars.slice(0, i + 1).map(b => b.low)),
      close: createSeries('close', bars.slice(0, i + 1).map(b => b.close)),
      volume: createSeries('volume', bars.slice(0, i + 1).map(b => b.volume)),
    }));
    const result = engine.executeBars(contexts);
    expect(result.success).toBe(true);
    console.log('\n=== Trailing Stop Values ===');
    for (const [key, series] of result.outputs) {
      // Show first 5 and last 5 non-null
      const nonNullIndices = series.values.map((v, i) => v !== null ? i : -1).filter(i => i >= 0);
      console.log(`\n${key}:`);
      console.log(`  Non-null: ${nonNullIndices.length}/${series.values.length}`);
      if (nonNullIndices.length > 0) {
        console.log(`  First 5 values:`, nonNullIndices.slice(0, 5).map(i => `[${i}]${series.values[i]}`));
        console.log(`  Last 5 values:`, nonNullIndices.slice(-5).map(i => `[${i}]${series.values[i]}`));
      }
      // Show first 10 values regardless
      console.log(`  First 10 raw:`, series.values.slice(0, 10));
    }
  });
});
