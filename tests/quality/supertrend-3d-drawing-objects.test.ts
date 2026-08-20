import { parse } from '../../src/language/parser/index.js';
import { compile } from '../../src/language/compiler/index.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import type { Bar } from '../../src/data/bar.js';
import * as fs from 'fs';

const SOURCE = fs.readFileSync('./test_indicators/supertrend-3d.pine', 'utf-8');

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

describe('Supertrend 3D drawing objects', () => {
  let result: Awaited<ReturnType<ExecutionEngine['executeBars']>>;

  beforeAll(async () => {
    const { ast } = parse(SOURCE);
    const cr = compile(ast);
    const engine = new ExecutionEngine(cr);
    result = await engine.executeBars(barsToContext(createBars(120)));
  });

  it('parses and executes without errors', async () => {
    expect(result.success).toBe(true);
  });

  it('supertrend-3d overlay is false', async () => {
    expect(result.overlay).toBe(false);
  });

  it('supertrend-3d produces line objects on last bar', async () => {
    // The script draws lines inside `if barstate.islast`
    // result.lines should be an array of LineEntry objects
    expect(result.lines).toBeDefined();
    expect(Array.isArray(result.lines)).toBe(true);
    expect(result.lines!.length).toBeGreaterThan(0);

    // Verify line structure
    const firstLine = result.lines![0];
    expect(firstLine).toHaveProperty('x1');
    expect(firstLine).toHaveProperty('y1');
    expect(firstLine).toHaveProperty('x2');
    expect(firstLine).toHaveProperty('y2');
    expect(firstLine).toHaveProperty('color');
    expect(typeof firstLine.x1).toBe('number');
    expect(typeof firstLine.y1).toBe('number');
    expect(typeof firstLine.x2).toBe('number');
    expect(typeof firstLine.y2).toBe('number');
    expect(typeof firstLine.color).toBe('string');

    console.log(`Lines produced: ${result.lines!.length}`);
    console.log('Sample line:', JSON.stringify(firstLine, null, 2));
  });

  it('supertrend-3d produces linefill objects on last bar', async () => {
    // The script draws linefills inside `if barstate.islast`
    // result.linefills should be an array of LinefillEntry objects
    expect(result.linefills).toBeDefined();
    expect(Array.isArray(result.linefills)).toBe(true);
    expect(result.linefills!.length).toBeGreaterThan(0);

    // Verify linefill structure
    const firstLinefill = result.linefills![0];
    expect(firstLinefill).toHaveProperty('line1');
    expect(firstLinefill).toHaveProperty('line2');
    expect(firstLinefill).toHaveProperty('color');
    expect(typeof firstLinefill.color).toBe('string');

    // Verify line references are valid
    expect(firstLinefill.line1).toBeDefined();
    expect(firstLinefill.line2).toBeDefined();
    expect(typeof firstLinefill.line1.x1).toBe('number');
    expect(typeof firstLinefill.line2.x1).toBe('number');

    console.log(`Linefills produced: ${result.linefills!.length}`);
    console.log('Sample linefill:', JSON.stringify(firstLinefill, null, 2));
  });

  it('supertrend-3d produces label objects on last bar', async () => {
    // The script draws labels inside `if barstate.islast`
    // result.labels should be an array of LabelEntry objects
    expect(result.labels).toBeDefined();
    expect(Array.isArray(result.labels)).toBe(true);
    expect(result.labels!.length).toBeGreaterThan(0);

    // Verify label structure
    const firstLabel = result.labels![0];
    expect(firstLabel).toHaveProperty('time');
    expect(firstLabel).toHaveProperty('price');
    expect(firstLabel).toHaveProperty('text');
    expect(firstLabel).toHaveProperty('color');
    expect(typeof firstLabel.text).toBe('string');

    console.log(`Labels produced: ${result.labels!.length}`);
    console.log('Sample label:', JSON.stringify(firstLabel, null, 2));
  });
});
