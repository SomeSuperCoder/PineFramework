/** Quick debug: trace exact res, sup, trend, and pivot values */
import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { barsToContext, createSeries } from '../../src/index.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';

describe('Debug res/sup', () => {
  const source = fs.readFileSync('./test_indicators/higher-high-lower-low.pine', 'utf-8');

  it('trace exact pivot values', () => {
    // MINIMAL dataset: just 20 bars, no pivots. Check baseline.
    const ts = 1700000000000;
    const bars: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = [];

    // 20 flat bars at 100
    for (let i = 0; i < 20; i++) {
      bars.push({
        timestamp: ts + i * 3600000,
        open: 100,
        high: 102,
        low: 98,
        close: 101,
        volume: 1000,
      });
    }

    // Make bar 10 a pivot low (HL): low=92, neighbors' lows > 92
    bars[10]!.low = 92;
    for (let j = 5; j < 10; j++) bars[j]!.low = 97;
    for (let j = 11; j <= 15; j++) bars[j]!.low = 97;

    console.log('Bar 10 low:', bars[10]!.low);
    console.log('Bars 5-9 lows:', bars.slice(5, 10).map(b => b.low));
    console.log('Bars 11-15 lows:', bars.slice(11, 16).map(b => b.low));

    const { ast } = parse(source);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);
    const contexts = barsToContext(bars);
    const result = engine.executeBars(contexts);

    // Check hlFlag at bar 10
    const hlFlagBinding = (engine as any).globalScope?.variables?.get?.('hlFlag');
    if (hlFlagBinding) {
      const v10 = hlFlagBinding.series.values[10];
      const v10s = v10 === null || v10 === undefined || typeof v10 === 'symbol' ? 'na' : String(v10);
      console.log(`hlFlag at bar 10: ${v10s}`);
      console.log(`hlFlag length: ${hlFlagBinding.series.length}`);
      // Show hlFlag around bar 10
      for (let i = 8; i <= 12; i++) {
        const v = hlFlagBinding.series.values[i];
        const vs = v === null || v === undefined || typeof v === 'symbol' ? 'na' : String(v);
        console.log(`  hlFlag[${i}] = ${vs}`);
      }
    }

    // Check zz at bar 10
    const zzBinding = (engine as any).globalScope?.variables?.get?.('zz');
    if (zzBinding) {
      const zz10 = zzBinding.series.values[10];
      const zz10s = zz10 === null || zz10 === undefined || typeof zz10 === 'symbol' ? 'na' : String(zz10);
      console.log(`zz at bar 10: ${zz10s}`);
    }

    // Check res/sup/trend
    const resB = (engine as any).globalScope?.variables?.get?.('res');
    const supB = (engine as any).globalScope?.variables?.get?.('sup');
    const trendB = (engine as any).globalScope?.variables?.get?.('trend');
    
    if (resB) {
      const vals = resB.series.values.map((v: any, i: number) => {
        const s = v === null || v === undefined || typeof v === 'symbol' ? 'na' : typeof v === 'number' ? v.toFixed(2) : String(v);
        return s !== 'na' ? `[${i}]=${s}` : null;
      }).filter(Boolean);
      console.log(`res non-na: ${vals}`);
    }
    if (supB) {
      const vals = supB.series.values.map((v: any, i: number) => {
        const s = v === null || v === undefined || typeof v === 'symbol' ? 'na' : typeof v === 'number' ? v.toFixed(2) : String(v);
        return s !== 'na' ? `[${i}]=${s}` : null;
      }).filter(Boolean);
      console.log(`sup non-na: ${vals}`);
    }
    if (trendB) {
      console.log(`trend: ${trendB.series.values.slice(-10).map((v: any) => v === null || typeof v === 'symbol' ? 'na' : v)}`);
    }

    console.log(`\nLabels: ${(result.labels ?? []).length}`);
    for (const l of result.labels ?? []) {
      console.log(`  ${l.text} @ ${l.price} time=${l.time}`);
    }
    console.log(`Lines: ${(result.lines ?? []).length}`);
    for (const l of result.lines ?? []) {
      console.log(`  x1=${l.x1} y1=${l.y1} x2=${l.x2}`);
    }
  });

  it('trace with single LH pivot and debug findprevious', () => {
    // 25 bars. One HL at 10 (price 92), one LH at 21 (price 108).
    // Check if LH correctly sets res.
    const ts = 1700000000000;
    const bars: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = [];

    for (let i = 0; i < 25; i++) {
      bars.push({
        timestamp: ts + i * 3600000,
        open: 100,
        high: 102,
        low: 98,
        close: 101,
        volume: 1000,
      });
    }

    // HL at bar 10
    bars[10]!.low = 92;
    for (let j = 5; j < 10; j++) bars[j]!.low = 97;
    for (let j = 11; j <= 15; j++) bars[j]!.low = 97;

    // LH at bar 21
    bars[21]!.high = 108;
    for (let j = 16; j < 21; j++) bars[j]!.high = 103;
    for (let j = 22; j < 25; j++) bars[j]!.high = 103;

    const { ast } = parse(source);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);
    const contexts = barsToContext(bars);
    const result = engine.executeBars(contexts);

    // Show series dumps
    for (const name of ['hlFlag', 'zz', 'a', 'b', 'c', 'd', 'e', 'res', 'sup']) {
      const b = (engine as any).globalScope?.variables?.get?.(name);
      if (b) {
        console.log(`${name}: ${b.series.values.slice(-15).map((v: any, i: number) => {
          const s = v === null || v === undefined || typeof v === 'symbol' ? 'na' : typeof v === 'number' ? v.toFixed(2) : `'${v}'`;
          return `${10+i}=${s}`;
        }).join(', ')}`);
      }
    }

    console.log(`\nLabels:`);
    for (const l of result.labels ?? []) console.log(`  ${l.text} @ ${l.price}`);
    console.log(`Lines:`);
    for (const l of result.lines ?? []) console.log(`  x1=${l.x1} y1=${l.y1}`);
  });
});
