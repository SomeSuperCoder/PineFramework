import { parse } from '../../src/language/parser/index.js';
import { compile } from '../../src/language/compiler/index.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import type { Bar } from '../../src/data/bar.js';
import * as fs from 'fs';

const SOURCE = fs.readFileSync('./test_indicators/supertrend.pine', 'utf-8');

function createBars(count: number): Bar[] {
  const bars: Bar[] = [];
  let price = 66000;
  let s = 42;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = open + (rand() - 0.5) * 500;
    const high = Math.max(open, close) + rand() * 200;
    const low = Math.min(open, close) - rand() * 200;
    bars.push({ timestamp: 1700000000000 + i * 3600000, open, high, low, close, volume: 1000 });
    price = close;
  }
  return bars;
}

function barsToContext(bars: Bar[]) {
  return bars.map((bar, index) => ({
    barIndex: index, barCount: bars.length, timestamp: bar.timestamp,
    open: createSeries('open', [bar.open]),
    high: createSeries('high', [bar.high]),
    low: createSeries('low', [bar.low]),
    close: createSeries('close', [bar.close]),
    volume: createSeries('volume', [bar.volume]),
  }));
}

describe('Official Supertrend compatibility', () => {
  it('parses and executes without errors', async () => {
    const { ast } = parse(SOURCE);
    const cr = compile(ast);
    const engine = new ExecutionEngine(cr);
    const result = await engine.executeBars(barsToContext(createBars(120)));
    expect(result.success).toBe(true);
  });

  it('direction alternates between uptrend and downtrend', async () => {
    const { ast } = parse(SOURCE);
    const cr = compile(ast);
    const engine = new ExecutionEngine(cr);
    const result = await engine.executeBars(barsToContext(createBars(120)));

    const upKey = Array.from(result.outputs.keys()).find(k => k.includes('Up Trend'));
    const downKey = Array.from(result.outputs.keys()).find(k => k.includes('Down Trend'));
    expect(upKey).toBeDefined();
    expect(downKey).toBeDefined();

    const upCount = result.outputs.get(upKey!)!.values.filter(v => v !== null && v !== undefined).length;
    const downCount = result.outputs.get(downKey!)!.values.filter(v => v !== null && v !== undefined).length;
    console.log(`Up Trend: ${upCount}, Down Trend: ${downCount}`);

    expect(upCount).toBeGreaterThan(0);
    expect(downCount).toBeGreaterThan(0);
  });
});
