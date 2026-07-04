import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import type { Bar } from '../../src/data/bar.js';

function createBars(count: number, startPrice: number = 100) {
  const bars: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const open = price;
    const change = (Math.random() - 0.5) * 3;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * 2;
    const low = Math.min(open, close) - Math.random() * 2;
    bars.push({
      timestamp: Date.now() + i * 86400000,
      open,
      high,
      low,
      close,
      volume: Math.floor(Math.random() * 10000) + 1000,
    });
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
    const bar: Bar = {
      timestamp: Date.now(),
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 1000,
    };
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

  it('executes the full indicator on one bar without crashing', () => {
    const { ast } = parse(source);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);
    const bar: Bar = {
      timestamp: Date.now(),
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 1000,
    };
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

  it('executes the full indicator on multiple bars without crashing', () => {
    const { result } = runEngine();
    expect(result.success).toBe(true);
    expect(result.outputs.size).toBe(2);
    expect(result.fills.length).toBeGreaterThan(0);
    for (const [key, series] of result.outputs) {
      const nonNull = series.values.filter((v) => v !== null && v !== undefined);
      expect(nonNull.length).toBeGreaterThan(0);
      console.log(`  ${key}: ${nonNull.length}/${series.values.length} non-null`);
    }
  });

  it('verifies all visual data the indicator produces', () => {
    const { bars, result } = runEngine();

    // === 1) TWO SMA plot outputs with correct metadata ===
    const plotKeys = [...result.outputs.keys()];
    const smaLowKey = plotKeys.find((k) => k.includes('SMA Low'));
    const smaHighKey = plotKeys.find((k) => k.includes('SMA High'));
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
    const nonNullLowColors = lowColors.filter((c) => c !== null);
    const nonNullHighColors = highColors.filter((c) => c !== null);
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
    const nonNullFillColors = fillColors.filter((c) => c !== null);
    expect(nonNullFillColors.length).toBeGreaterThan(0);
    for (const c of nonNullFillColors) {
      expect(c).toMatch(/^#[0-9a-fA-F]{8}$/);
    }

    // === SIMULATE FRONTEND buildScriptResult TRANSFORMATIONS ===
    function stripMeta(s: string): string {
      return s
        .replace(/__lw:\d+/g, '')
        .replace(/__style:[^_]+/g, '')
        .trim();
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
      const plotKey = Object.keys(frontendOutputs).find(
        (k) => stripMeta(k).trim() === f.from.trim(),
      );
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
    console.log(
      `  frontend fillKey "${frontendFillKey}" found in fillColorData: ${!!frontendFillColorData[frontendFillKey]}`,
    );
    console.log(
      `  frontend fillColorData[frontendFillKey] length: ${frontendFillColorData[frontendFillKey]!.length}`,
    );

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
      if (
        v1 !== null &&
        v1 !== undefined &&
        typeof v1 === 'number' &&
        v2 !== null &&
        v2 !== undefined &&
        typeof v2 === 'number'
      ) {
        validCount++;
      }
    }
    expect(validCount).toBeGreaterThanOrEqual(2);
    console.log(`  valid data points for fill: ${validCount}`);

    console.log(`  fills: ${nonNullFillColors.length} non-null / ${fillColors.length} total`);
    console.log(`  fillColor from engine: ${fill.color}`);

    // === 4) LINES from line.new (BoS/MSS structure) ===
    console.log(`  lines produced: ${result.lines?.length ?? 0}`);
    if (result.lines && result.lines.length > 0) {
      for (const line of result.lines) {
        expect(typeof line.x1).toBe('number');
        expect(typeof line.y1).toBe('number');
        expect(typeof line.x2).toBe('number');
        expect(typeof line.y2).toBe('number');
        expect(line.color).toMatch(/^#[0-9a-fA-F]{6,8}$/);
        expect(line.style).toBe('style_dotted');
        expect(line.width).toBe(2);
        expect(line.xloc).toBe('bar_time');
      }
    }

    // === 5) LABELS from label.new (Buy/Sell signals) ===
    console.log(`  labels produced: ${result.labels?.length ?? 0}`);
    if (result.labels && result.labels.length > 0) {
      for (const label of result.labels) {
        console.log(
          `    label: text=${label.text}, time=${label.time}, price=${label.price}, color=${label.color}`,
        );
        expect(typeof label.time).toBe('number');
        expect(typeof label.price).toBe('number');
        expect(['Buy', 'Sell']).toContain(label.text);
        expect(label.color).toMatch(/^#[0-9a-fA-F]{6,8}$/);
        expect(label.textcolor).toBe('#FFFFFF');
        expect(['label.style_label_up', 'label.style_label_down']).toContain(label.style);
        expect(label.size).toBe('size.normal');
      }
    }

    // === 6) DIRECT line.new / label.new unit test ===
    {
      const lineTestSrc = `//@version=6
indicator("LineTest")
line.new(1, 2, 3, 4, color=color.red, style=line.style_dotted, width=2, xloc=xloc.bar_time)
label.new(5, 6, "Test", color=color.green, textcolor=color.white, style=label.style_label_down, size=size.normal)
plot(close, "c")`;
      const { ast: ltAst } = parse(lineTestSrc);
      const ltCompiled = compile(ltAst);
      const ltEngine = new ExecutionEngine(ltCompiled);
      const ltBars = createBars(5, 100);
      const ltContexts = ltBars.map((bar, i) => ({
        barIndex: i,
        barCount: ltBars.length,
        timestamp: bar.timestamp,
        open: createSeries(
          'open',
          ltBars.slice(0, i + 1).map((b) => b.open),
        ),
        high: createSeries(
          'high',
          ltBars.slice(0, i + 1).map((b) => b.high),
        ),
        low: createSeries(
          'low',
          ltBars.slice(0, i + 1).map((b) => b.low),
        ),
        close: createSeries(
          'close',
          ltBars.slice(0, i + 1).map((b) => b.close),
        ),
        volume: createSeries(
          'volume',
          ltBars.slice(0, i + 1).map((b) => b.volume),
        ),
      }));
      const ltResult = ltEngine.executeBars(ltContexts);
      expect(ltResult.success).toBe(true);
      expect(ltResult.lines).toBeDefined();
      expect(ltResult.lines!.length).toBe(5); // one line per bar since it's outside conditional
      for (const l of ltResult.lines!) {
        expect(l.x1).toBe(1);
        expect(l.y1).toBe(2);
        expect(l.x2).toBe(3);
        expect(l.y2).toBe(4);
        expect(l.color).toBe('#F44336'); // color.red
        expect(l.style).toBe('style_dotted');
        expect(l.width).toBe(2);
        expect(l.xloc).toBe('bar_time');
      }
      expect(ltResult.labels).toBeDefined();
      expect(ltResult.labels!.length).toBe(5); // one label per bar
      for (const lb of ltResult.labels!) {
        expect(lb.text).toBe('Test');
        expect(lb.color).toBe('#4CAF50'); // color.green
        expect(lb.textcolor).toBe('#FFFFFF'); // color.white
        expect(lb.style).toBe('label.style_label_down');
        expect(lb.size).toBe('size.normal');
      }
      console.log(
        `  direct line/label test: ${ltResult.lines!.length} lines, ${ltResult.labels!.length} labels`,
      );
    }

    // === 7) END-TO-END pivot → line.new pipeline ===
    const e2eSrc = `//@version=6
indicator("E2EPivot")
ph = ta.pivothigh(2, 2)
var float lvl = na
if not na(ph)
    lvl := ph
plot(lvl, "lvl")
if not na(lvl) and close > lvl
    line.new(0, lvl, 1, lvl, color=color.blue, style=line.style_dotted, width=2)`;
    const { ast: e2eAst } = parse(e2eSrc);
    const e2eCompiled = compile(e2eAst);
    const e2eEngine = new ExecutionEngine(e2eCompiled);
    const e2eBars: Array<{
      timestamp: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }> = [];
    const ts = Date.now();
    for (let i = 0; i < 15; i++) {
      e2eBars.push({
        timestamp: ts + i * 86400000,
        open: 100,
        high: 100,
        low: 100,
        close: 100,
        volume: 10000,
      });
    }
    e2eBars[2]!.high = 130;
    e2eBars[3]!.high = 140;
    e2eBars[4]!.high = 150;
    e2eBars[5]!.high = 142;
    e2eBars[6]!.high = 136;
    e2eBars[6]!.close = 155;
    const e2eContexts = e2eBars.map((bar, i) => ({
      barIndex: i,
      barCount: e2eBars.length,
      timestamp: bar.timestamp,
      open: createSeries(
        'open',
        e2eBars.slice(0, i + 1).map((b) => b.open),
      ),
      high: createSeries(
        'high',
        e2eBars.slice(0, i + 1).map((b) => b.high),
      ),
      low: createSeries(
        'low',
        e2eBars.slice(0, i + 1).map((b) => b.low),
      ),
      close: createSeries(
        'close',
        e2eBars.slice(0, i + 1).map((b) => b.close),
      ),
      volume: createSeries(
        'volume',
        e2eBars.slice(0, i + 1).map((b) => b.volume),
      ),
    }));
    const e2eResult = e2eEngine.executeBars(e2eContexts);
    expect(e2eResult.success).toBe(true);
    for (const [key, series] of e2eResult.outputs) {
      console.log(
        `  output ${JSON.stringify(key)}: ${series.values.map((v, i) => `[${i}]=${v}`).join(', ')}`,
      );
    }
    console.log(`  e2e lines: ${e2eResult.lines?.length ?? 0}`);
    if (e2eResult.lines) {
      for (const l of e2eResult.lines) console.log(`    line: y=${l.y1}, color=${l.color}`);
    }
    const lvlKey = [...e2eResult.outputs.keys()].find((k) => k.includes('lvl'));
    expect(lvlKey).toBeTruthy();
    expect(e2eResult.outputs.get(lvlKey!)!.values[6]).toBe(150);
    expect(e2eResult.lines?.length ?? 0).toBeGreaterThanOrEqual(1);

    // === 8) FULL TRENDCRAFT with controlled pivot data ===
    {
      const { ast } = parse(
        `//@version=6
indicator("PivotTest")
plot(ta.pivothigh(2, 2), "ph")
plot(ta.pivotlow(2, 2), "pl")`,
      );
      const compiled = compile(ast);
      const engine = new ExecutionEngine(compiled);
      // Create bars with known pivot at index 4
      const bars: Array<{
        timestamp: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      }> = [];
      for (let i = 0; i < 10; i++) {
        let h = 110,
          l = 90;
        if (i === 2) {
          h = 130;
          l = 80;
        }
        if (i === 3) {
          h = 135;
          l = 85;
        }
        if (i === 4) {
          h = 140;
          l = 82;
        } // pivot high
        if (i === 5) {
          h = 132;
          l = 78;
        } // pivot low
        if (i === 6) {
          h = 128;
          l = 88;
        }
        if (i === 7) {
          h = 125;
          l = 84;
        }
        bars.push({
          timestamp: Date.now() + i * 86400000,
          open: 100 + i,
          high: h,
          low: l,
          close: 100 + i + 1,
          volume: 10000,
        });
      }
      const contexts = bars.map((bar, i) => ({
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
      const result = engine.executeBars(contexts);
      expect(result.success).toBe(true);
      const phKey = [...result.outputs.keys()].find((k) => k.includes('ph'));
      const plKey = [...result.outputs.keys()].find((k) => k.includes('pl'));
      expect(phKey).toBeDefined();
      expect(plKey).toBeDefined();
      const phValues = result.outputs.get(phKey!)!.values;
      const plValues = result.outputs.get(plKey!)!.values;
      console.log(
        `  phValues length=${phValues.length}, values: ${phValues.map((v, i) => `[${i}]=${v}`).join(', ')}`,
      );
      console.log(
        `  plValues length=${plValues.length}, values: ${plValues.map((v, i) => `[${i}]=${v}`).join(', ')}`,
      );
      // At bar 6 (right=2 confirms pivot at bar 4), ph[6] should be 140
      expect(phValues.length).toBeGreaterThan(6);
      expect(phValues[6]).toBe(140);
      // At bar 7 (right=2 confirms pivot at bar 5), pl[7] should be 78
      expect(plValues.length).toBeGreaterThan(7);
      expect(plValues[7]).toBe(78);
    }

    // === 7) PIYOT DETECTION TEST with fully controlled data ===
    // Build a clean bar sequence where a pivot high is guaranteed
    const pivotTestBars: Array<{
      timestamp: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }> = [];
    const baseTs = Date.now();
    // Create 15 bars with controlled data
    // Pivot high at bar 4 with left=2, right=2 context
    for (let i = 0; i < 15; i++) {
      const open = 100 + i;
      const close = open + 1;
      let high = close + 2;
      const low = open - 2;
      if (i === 4) {
        high = 150;
      } // known pivot high
      else if (i >= 2 && i <= 6) {
        high = 120 + i * 2;
      } // make center 4 the peak
      pivotTestBars.push({
        timestamp: baseTs + i * 86400000,
        open,
        high,
        low,
        close,
        volume: 10000,
      });
    }
    // Override to make bar 4 the strict maximum
    pivotTestBars[2]!.high = 140;
    pivotTestBars[3]!.high = 145;
    pivotTestBars[4]!.high = 150; // pivot
    pivotTestBars[5]!.high = 148;
    pivotTestBars[6]!.high = 146;

    // Add a break bar: bar 6 close triggers break (high must stay <= 150 so pivot at bar 4 is confirmed)
    pivotTestBars[6]!.close = 155;
    pivotTestBars[7] = { ...pivotTestBars[7]!, close: 153 };

    // Also add a pivot low at bar 9 with left=2, right=2
    pivotTestBars[8]!.low = 85;
    pivotTestBars[9]!.low = 80;
    pivotTestBars[10]!.low = 70; // pivot
    pivotTestBars[11]!.low = 78;
    pivotTestBars[12]!.low = 82;

    const { ast: pivotAst } = parse(source);
    const compiledPivot = compile(pivotAst);
    const pivotEngine = new ExecutionEngine(compiledPivot);
    const pivotContexts = pivotTestBars.map((bar, i) => ({
      barIndex: i,
      barCount: pivotTestBars.length,
      timestamp: bar.timestamp,
      open: createSeries(
        'open',
        pivotTestBars.slice(0, i + 1).map((b) => b.open),
      ),
      high: createSeries(
        'high',
        pivotTestBars.slice(0, i + 1).map((b) => b.high),
      ),
      low: createSeries(
        'low',
        pivotTestBars.slice(0, i + 1).map((b) => b.low),
      ),
      close: createSeries(
        'close',
        pivotTestBars.slice(0, i + 1).map((b) => b.close),
      ),
      volume: createSeries(
        'volume',
        pivotTestBars.slice(0, i + 1).map((b) => b.volume),
      ),
    }));
    const pivotResult = pivotEngine.executeBars(pivotContexts);
    expect(pivotResult.success).toBe(true);
    console.log(
      `  with known pivot data: lines=${pivotResult.lines?.length ?? 0}, labels=${pivotResult.labels?.length ?? 0}`,
    );
    if (pivotResult.lines) {
      for (const l of pivotResult.lines)
        console.log(`    line: x1=${l.x1}, y1=${l.y1}, x2=${l.x2}, y2=${l.y2}, color=${l.color}`);
    }
    if (pivotResult.labels) {
      for (const lb of pivotResult.labels)
        console.log(
          `    label: time=${lb.time}, price=${lb.price}, text=${lb.text}, color=${lb.color}`,
        );
    }
  });
});
