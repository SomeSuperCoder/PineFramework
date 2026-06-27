import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine, type ExecutionContext } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import type { Bar } from '../../src/data/bar.js';

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

describe('TrendCraft ICT SwiftEdge Indicator', () => {
  const source = fs.readFileSync('./test_indicators/trendcraft-ict-swiftedge.pine', 'utf-8');

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

  it('resolves syminfo.tickerid at runtime', () => {
    const testSource = `//@version=6
indicator("SymInfo Test")
x = syminfo.tickerid
plot(x, "ticker")`;
    const { ast } = parse(testSource);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);
    const bar: Bar = { timestamp: Date.now(), open: 100, high: 101, low: 99, close: 100, volume: 1000 };
    const ctx: ExecutionContext = { barIndex: 0, barCount: 1, timestamp: bar.timestamp, open: createSeries('open', [bar.open]), high: createSeries('high', [bar.high]), low: createSeries('low', [bar.low]), close: createSeries('close', [bar.close]), volume: createSeries('volume', [bar.volume]) };
    const result = engine.executeBar(ctx);
    expect(result.success).toBe(true);
  });

  it('executes the full indicator on one bar without crashing', () => {
    const { ast } = parse(source);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);
    const bar: Bar = { timestamp: Date.now(), open: 100, high: 101, low: 99, close: 100, volume: 1000 };
    const ctx: ExecutionContext = { barIndex: 0, barCount: 1, timestamp: bar.timestamp, open: createSeries('open', [bar.open]), high: createSeries('high', [bar.high]), low: createSeries('low', [bar.low]), close: createSeries('close', [bar.close]), volume: createSeries('volume', [bar.volume]) };
    const result = engine.executeBar(ctx);
    if (!result.success) {
      console.error('Execution error:', result.error);
    }
    expect(result.success).toBe(true);
  });

  function runEngine() {
    const { ast } = parse(source);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);
    const bars = createBars(50, 100);
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

  it('executes the full indicator on multiple bars without crashing', () => {
    const { result } = runEngine();
    expect(result.success).toBe(true);
    expect(result.outputs.size).toBe(2);
    expect(result.fills.length).toBeGreaterThan(0);
    for (const [key, series] of result.outputs) {
      const nonNull = series.values.filter(v => v !== null && v !== undefined);
      expect(nonNull.length).toBeGreaterThan(0);
      console.log(`  ${key}: ${nonNull.length}/${series.values.length} non-null`);
    }
  });

  it('verifies all visual data the indicator produces', () => {
    const { bars, result } = runEngine();

    // === 1) TWO SMA plot outputs with correct metadata ===
    const plotKeys = [...result.outputs.keys()];
    const smaLowKey = plotKeys.find(k => k.includes('SMA Low'));
    const smaHighKey = plotKeys.find(k => k.includes('SMA High'));
    expect(smaLowKey).toBeDefined();
    expect(smaHighKey).toBeDefined();
    expect(smaLowKey).toContain('__lw:2');
    expect(smaHighKey).toContain('__lw:2');

    // === 2) Per-bar plot colors emitted for each SMA ===
    expect(result.plotColors).toBeDefined();
    expect(result.plotColors!.size).toBe(2);
    expect(result.plotColors!.has(smaLowKey!)).toBe(true);
    expect(result.plotColors!.has(smaHighKey!)).toBe(true);
    const lowColors = result.plotColors!.get(smaLowKey!)!;
    const highColors = result.plotColors!.get(smaHighKey!)!;
    expect(lowColors.length).toBe(50);
    expect(highColors.length).toBe(50);
    const nonNullLowColors = lowColors.filter(c => c !== null);
    const nonNullHighColors = highColors.filter(c => c !== null);
    expect(nonNullLowColors.length).toBeGreaterThan(0);
    expect(nonNullHighColors.length).toBeGreaterThan(0);
    for (const c of nonNullLowColors) {
      expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
    }

    // === 3) FILL with per-bar colors ===
    expect(result.fills.length).toBe(1);
    const fill = result.fills[0]!;
    expect(fill.from).toContain('SMA Low');
    expect(fill.to).toContain('SMA High');
    expect(fill.color).toMatch(/^#[0-9a-fA-F]{6,8}$/);
    expect(result.fillColorData).toBeDefined();
    expect(result.fillColorData!.size).toBe(1);
    const fillKey = `${fill.from}::${fill.to}`;
    expect(result.fillColorData!.has(fillKey)).toBe(true);
    const fillColors = result.fillColorData!.get(fillKey)!;
    expect(fillColors.length).toBe(50);
    const nonNullFillColors = fillColors.filter(c => c !== null);
    expect(nonNullFillColors.length).toBeGreaterThan(0);
    for (const c of nonNullFillColors) {
      expect(c).toMatch(/^#[0-9a-fA-F]{8}$/);
    }

    // === SIMULATE FRONTEND buildScriptResult TRANSFORMATIONS ===
    function stripMeta(s: string): string {
      return s.replace(/__lw:\d+/g, '').replace(/__style:[^_]+/g, '').trim();
    }

    // Build outputs as frontend does
    const frontendOutputs: Record<string, (number | string | boolean | null)[]> = {};
    for (const [key, series] of result.outputs) {
      frontendOutputs[key] = Array.from(series.values);
    }

    // Build fills as frontend does
    const frontendFills = result.fills.map((f) => ({
      from: stripMeta(f.from),
      to: stripMeta(f.to),
      color: f.color,
    }));

    // Verify stripped fill keys match plot series titles
    for (const f of frontendFills) {
      const plotKey = Object.keys(frontendOutputs).find(k => stripMeta(k).trim() === f.from.trim());
      expect(plotKey).toBeDefined();
    }

    // Build fillColorData as frontend does
    const frontendFillColorData: Record<string, (string | null)[]> = {};
    if (result.fillColorData) {
      for (const [key, colors] of result.fillColorData) {
        const parts = key.split('::');
        const transformedKey = parts.map(stripMeta).join('::');
        frontendFillColorData[transformedKey] = [...colors];
      }
    }

    // Verify fillColorData fillKey matches the frontend fill's from::to
    const frontendFillKey = `${frontendFills[0]!.from}::${frontendFills[0]!.to}`;
    expect(frontendFillColorData[frontendFillKey]).toBeDefined();
    console.log(`  frontend fillKey "${frontendFillKey}" found in fillColorData: ${!!frontendFillColorData[frontendFillKey]}`);
    console.log(`  frontend fillColorData[frontendFillKey] length: ${frontendFillColorData[frontendFillKey]!.length}`);

    // === VERIFY OUTPUT VALUES ARE USABLE BY AreaRenderer ===
    // The AreaRenderer builds points from fromData[i]?.value
    // It skips bars where value is null or undefined
    // It should find at least 2 valid points to draw a polygon
    const smaLowValues = frontendOutputs[smaLowKey!];
    const smaHighValues = frontendOutputs[smaHighKey!];
    let validCount = 0;
    for (let i = 0; i < smaLowValues.length; i++) {
      const v1 = smaLowValues[i];
      const v2 = smaHighValues[i];
      if (v1 !== null && v1 !== undefined && typeof v1 === 'number' &&
          v2 !== null && v2 !== undefined && typeof v2 === 'number') {
        validCount++;
      }
    }
    expect(validCount).toBeGreaterThanOrEqual(2);
    console.log(`  valid data points for fill: ${validCount}`);

    console.log(`  fills: ${nonNullFillColors.length} non-null / ${fillColors.length} total`);
    console.log(`  fillColor from engine: ${fill.color}`);
  });
});
