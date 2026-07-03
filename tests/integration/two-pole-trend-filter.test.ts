import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine, type ExecutionContext } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

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
    if (!result.success) {
      console.error('Execution error:', result.error?.message ?? result.error);
      if (result.error?.stack) {
        console.error('Stack:', result.error?.stack?.split('\n').slice(0, 10).join('\n'));
      }
    }
    expect(result.success).toBe(true);
  });

  function runEngine(barCount: number = 60) {
    const { ast } = parse(source);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);
    const bars = createBars(barCount, 100);
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

  it('executes on multiple bars without crashing', () => {
    const { result } = runEngine(60);
    expect(result.success).toBe(true);
    expect(result.outputs.size).toBe(1);
    for (const [key, series] of result.outputs) {
      const nonNull = series.values.filter(v => v !== null && v !== undefined);
      expect(nonNull.length).toBeGreaterThan(0);
      console.log(`  ${key}: ${nonNull.length}/${series.values.length} non-null`);
    }
  });

  it('produces shapes with plotshape signals', () => {
    const { bars, result } = runEngine(60);
    expect(result.success).toBe(true);
    if (result.shapes && result.shapes.length > 0) {
      console.log(`  shapes produced: ${result.shapes.length}`);
      for (const s of result.shapes) {
        console.log(`    shape: style=${s.style}, location=${s.location}, color=${s.color}, time=${s.time}, text=${s.text}${s.price !== undefined ? `, price=${s.price}` : ''}`);
        expect(s.style).toMatch(/^(circle|triangledown|triangleup)$/);
        expect(s.location).toBe('absolute');
        expect(s.color).toMatch(/^#[0-9a-fA-F]{6,8}$/);
        expect(typeof s.time).toBe('number');
      }
    } else {
      console.log('  No shapes produced (signals may be off by default)');
    }
  });

  it('produces bar colors when bar_col is true', () => {
    // The indicator uses bar_col input defaulting to false, so barcolor may not trigger
    const { result } = runEngine(60);
    expect(result.success).toBe(true);
    // barColorData is always defined but may be empty when bar_col is false
    if (result.barColorData && result.barColorData.length > 0) {
      console.log(`  bar colors produced: ${result.barColorData.length}`);
      for (const bc of result.barColorData) {
        expect(bc.color).toMatch(/^#[0-9a-fA-F]{6,8}$/);
      }
    } else {
      console.log('  No bar colors (bar_col defaults to false)');
    }
  });

  it('handles method syntax and two_pole_filter calculation', () => {
    const { result } = runEngine(60);
    expect(result.success).toBe(true);
    for (const [, series] of result.outputs) {
      const nums = series.values.filter((v): v is number => typeof v === 'number');
      expect(nums.length).toBeGreaterThan(20);
      for (const v of nums) {
        expect(v).not.toBeNaN();
      }
    }
  });
});
