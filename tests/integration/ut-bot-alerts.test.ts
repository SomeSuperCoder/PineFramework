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
  return { engine, bars, result: engine.executeBars(contexts) };
}

describe('UT Bot Alerts', () => {
  const source = fs.readFileSync('./test_indicators/ut-bot-alerts.pine', 'utf-8');

  it('parses successfully', () => {
    const result = parse(source);
    expect(result.ast).toBeDefined();
  });

  it('compiles successfully with overlay=true', () => {
    const { ast } = parse(source);
    const compiled = compile(ast);
    expect(compiled).toBeDefined();
    expect(compiled.ir.overlay).toBe(true);
  });

  it('executes on a single bar without crashing', () => {
    const { ast } = parse(source);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);
    const bar = { timestamp: Date.now(), open: 100, high: 101, low: 99, close: 100, volume: 1000 };
    const ctx: ExecutionContext = {
      barIndex: 0,
      barCount: 1,
      timestamp: bar.timestamp,
      open: createSeries('open', [bar.open]),
      high: createSeries('high', [bar.high]),
      low: createSeries('low', [bar.low]),
      close: createSeries('close', [bar.close]),
      volume: createSeries('volume', [bar.volume]),
    };
    const result = engine.executeBar(ctx);
    expect(result.success).toBe(true);
  });

  it('has no plot outputs (no plot() calls in script)', () => {
    const bars = createTrendingBars(300, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const keys = Array.from(result.outputs.keys());
    expect(keys.length).toBe(0);
  });

  it('produces shapes from plotshape Buy/Sell signals', () => {
    const bars = createTrendingBars(300, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    expect(result.shapes).toBeDefined();
    expect(result.shapes.length).toBeGreaterThan(0);
    for (const shape of result.shapes) {
      expect(shape.time).toBeDefined();
      expect(shape.color).toBeDefined();
      expect(shape.style).toBeDefined();
      expect(shape.location).toBeDefined();
    }
  });

  it('shapes have Buy or Sell text', () => {
    const bars = createTrendingBars(300, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    expect(result.shapes.length).toBeGreaterThan(0);
    const texts = result.shapes.map((s) => s.text);
    expect(texts.some((t) => t === 'Buy')).toBe(true);
    expect(texts.some((t) => t === 'Sell')).toBe(true);
  });

  it('Buy shapes are green and below bar', () => {
    const bars = createTrendingBars(300, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const buyShapes = result.shapes.filter((s) => s.text === 'Buy');
    expect(buyShapes.length).toBeGreaterThan(0);
    for (const shape of buyShapes) {
      expect(shape.color.toLowerCase()).toMatch(/green|#4caf50|#00ff00/);
      expect(shape.location).toBe('belowbar');
    }
  });

  it('Sell shapes are red and above bar', () => {
    const bars = createTrendingBars(300, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const sellShapes = result.shapes.filter((s) => s.text === 'Sell');
    expect(sellShapes.length).toBeGreaterThan(0);
    for (const shape of sellShapes) {
      expect(shape.color.toLowerCase()).toMatch(/red|#f44336|#ff0000/);
      expect(shape.location).toBe('abovebar');
    }
  });

  it('produces barColorData from barcolor calls', () => {
    const bars = createTrendingBars(300, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    expect(result.barColorData).toBeDefined();
    expect(result.barColorData!.length).toBeGreaterThan(0);
  });

  it('barColorData contains green and red colors', () => {
    const bars = createTrendingBars(300, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const colors = result.barColorData!.map((e) => (e.bodyColor ?? '').toLowerCase());
    const hasGreen = colors.some((c) => c.includes('4caf50') || c.includes('00ff00'));
    const hasRed = colors.some((c) => c.includes('f44336') || c.includes('ff0000'));
    expect(hasGreen).toBe(true);
    expect(hasRed).toBe(true);
  });

  it('produces alert triggers from alert() calls', () => {
    const bars = createTrendingBars(300, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    expect(result.alertTriggers).toBeDefined();
    expect(result.alertTriggers!.length).toBeGreaterThan(0);
  });

  it('alert triggers contain Buy and Sell messages', () => {
    const bars = createTrendingBars(300, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const triggerIds = result.alertTriggers!.map((t) => t.alertId);
    expect(triggerIds.some((id) => id.includes('UT Long'))).toBe(true);
    expect(triggerIds.some((id) => id.includes('UT Short'))).toBe(true);
  });
});
