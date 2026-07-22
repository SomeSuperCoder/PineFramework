import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

describe('HHLL End-to-End Pivot Test', () => {
  const source = fs.readFileSync('./test_indicators/higher-high-lower-low.pine', 'utf-8');

  it('detects pivots and produces labels with controlled data', () => {
    const { ast } = parse(source);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);

    // Build 30 bars with explicit pivot highs and lows
    // Using lb=5, rb=5 defaults - pivots need 5 bars on each side
    const bars: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = [];
    const ts = 1700000000000;

    // Create base bars with gradual uptrend
    for (let i = 0; i < 30; i++) {
      const base = 100 + i * 0.5;
      bars.push({
        timestamp: ts + i * 3600000,
        open: base,
        high: base + 2,
        low: base - 1,
        close: base + 0.5,
        volume: 1000,
      });
    }

    // Bar 4 is the peak with 5 bars left context (bars 0-3 must be lower)
    // and 5 bars right context (bars 5-9 must be lower)
    bars[0].high = 108;
    bars[1].high = 110;
    bars[2].high = 112;
    bars[3].high = 115;
    bars[4].high = 120; // PEAK — should be pivot high (lb=5, rb=5 means check bars -5 to +5 relative to candidate)
    bars[5].high = 118;
    bars[6].high = 116;
    bars[7].high = 114;
    bars[8].high = 112;
    bars[9].high = 110;

    // Bar 14 is valley with 5 bars left (9-13 must be higher) and 5 right (15-19 must be higher)
    bars[9].low = 100;
    bars[10].low = 98;
    bars[11].low = 95;
    bars[12].low = 93;
    bars[13].low = 91;
    bars[14].low = 90; // VALLEY — should be pivot low
    bars[15].low = 92;
    bars[16].low = 94;
    bars[17].low = 96;
    bars[18].low = 98;
    bars[19].low = 100;

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

    const result = engine.executeBars(contexts);
    expect(result.success).toBe(true);

    console.log(`\n=== RESULTS with controlled pivot data ===`);
    console.log(`Labels: ${result.labels?.length ?? 0}`);
    for (const l of result.labels ?? []) {
      console.log(`  Label: text="${l.text}" price=${l.price.toFixed(2)} color=${l.color} barTime=${l.time}`);
    }
    console.log(`Lines: ${result.lines?.length ?? 0}`);
    for (const l of result.lines ?? []) {
      console.log(`  Line: x1=${l.x1} y1=${l.y1.toFixed(2)} x2=${l.x2} y2=${l.y2.toFixed(2)} color=${l.color}`);
    }

    // Should have at least some labels
    expect(result.labels?.length ?? 0).toBeGreaterThan(0);
  });

  it('debugs valuewhen', () => {
    const testSrc = `//@version=6
indicator("ValueWhenTest")
pl = ta.pivotlow(2, 2)
prevPl = ta.valuewhen(not na(pl), pl, 1)
plot(pl, "pl")
plot(prevPl, "prevPl")`;

    const { ast } = parse(testSrc);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);

    const bars: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = [];
    const ts = 1700000000000;

    for (let i = 0; i < 20; i++) {
      const base = 100 + i;
      bars.push({
        timestamp: ts + i * 3600000,
        open: base,
        high: base + 2,
        low: base - 2,
        close: base + 0.5,
        volume: 1000,
      });
    }

    // Pivot low at bar 4 (left=2, right=2)
    bars[2].low = 100;
    bars[3].low = 98;
    bars[4].low = 95; // pivot
    bars[5].low = 97;
    bars[6].low = 99;

    // Another at bar 9
    bars[7].low = 94;
    bars[8].low = 92;
    bars[9].low = 90; // pivot
    bars[10].low = 91;
    bars[11].low = 93;

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

    const result = engine.executeBars(contexts);
    expect(result.success).toBe(true);

    console.log(`\n=== valuewhen Debug ===`);
    for (const [key, series] of result.outputs) {
      const values = series.values;
      console.log(`Output "${key}":`);
      for (let i = 0; i < values.length; i++) {
        if (values[i] !== null && values[i] !== undefined) {
          console.log(`  bar[${i}] = ${values[i]}`);
        }
      }
    }
  });
});
