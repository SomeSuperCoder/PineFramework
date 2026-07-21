import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine, type ExecutionContext } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

function createTrendingBars(count: number, startPrice: number, seed: number = 42) {
  const bars: Array<{
    timestamp: number; open: number; high: number; low: number; close: number; volume: number;
  }> = [];
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
    const high = Math.max(open, close) + rand() * 1.5 + 0.5;
    const low = Math.min(open, close) - rand() * 1.5 - 0.5;
    bars.push({ timestamp: 1700000000000 + i * 3600000, open, high, low, close, volume: 1000 });
    price = close;
  }
  return bars;
}

describe('HHLL Line Debug', () => {
  it('checks S/R variables on every bar', () => {
    const source = fs.readFileSync('./test_indicators/higher-high-lower-low.pine', 'utf-8');
    const { ast } = parse(source);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);
    const bars = createTrendingBars(500, 100);
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

    const result = engine.executeBars(contexts);
    console.log('Labels:', result.labels?.length ?? 0);
    console.log('Lines:', result.lines?.length ?? 0);

    // Check key variables from the engine's outputs or scope
    // Look at scope for debug info
    for (const [key] of result.outputs) {
      console.log(`Output key: ${key}`);
    }

    // The script doesn't use plot(), so no plot outputs.
    // Let's check the lines more carefully.
    if (result.lines && result.lines.length > 0) {
      console.log('Lines found!');
      for (const l of result.lines.slice(0, 10)) {
        console.log('  Line:', JSON.stringify(l));
      }
    } else {
      console.log('No lines — checking bar-by-bar pivot output...');
    }
  });

  it('uses more volatile data to trigger pivots', () => {
    // Use strong zig-zag data guaranteed to produce alternating pivots
    const source = fs.readFileSync('./test_indicators/higher-high-lower-low.pine', 'utf-8');
    const { ast } = parse(source);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);

    // Create strong zig-zag pattern: 100 bars of 10-bar oscillations
    const bars: Array<{
      timestamp: number; open: number; high: number; low: number; close: number; volume: number;
    }> = [];
    for (let cycle = 0; cycle < 50; cycle++) {
      // Up phase: 5 bars rising
      for (let i = 0; i < 5; i++) {
        const phase = cycle * 10 + i;
        const base = 100 + (cycle * 20) + (i * 4);
        bars.push({
          timestamp: 1700000000000 + phase * 3600000,
          open: base - 1,
          high: base + 5,
          low: base - 2,
          close: base + 2,
          volume: 1000,
        });
      }
      // Down phase: 5 bars falling
      for (let i = 0; i < 5; i++) {
        const phase = cycle * 10 + 5 + i;
        const base = 100 + (cycle * 20) + 20 - (i * 4);
        bars.push({
          timestamp: 1700000000000 + phase * 3600000,
          open: base + 1,
          high: base + 2,
          low: base - 5,
          close: base - 2,
          volume: 1000,
        });
      }
    }

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

    const result = engine.executeBars(contexts);
    console.log('ZigZag data:');
    console.log('Labels:', result.labels?.length ?? 0);
    console.log('Lines:', result.lines?.length ?? 0);
    if (result.lines && result.lines.length > 0) {
      for (const l of result.lines.slice(0, 10)) {
        console.log('  Line:', JSON.stringify(l));
      }
    }
  });
});
