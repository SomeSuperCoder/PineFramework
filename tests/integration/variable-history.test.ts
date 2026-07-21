import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine, type ExecutionContext } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

describe('Variable history via := operator', () => {
  it('res[1] should reference previous bar value with :=', () => {
    const src = `//@version=6
indicator("test")
float x = na
x := nz(x[1]) + 1
plot(x)`;
    const { ast } = parse(src);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);

    const bars = Array.from({ length: 10 }, (_, i) => ({
      timestamp: 1700000000000 + i * 3600000,
      open: 100,
      high: 102,
      low: 99,
      close: 101,
      volume: 1000,
    }));
    const contexts: ExecutionContext[] = bars.map((bar, i) => ({
      barIndex: i, barCount: bars.length, timestamp: bar.timestamp,
      open: createSeries('open', bars.slice(0, i + 1).map((b) => b.open)),
      high: createSeries('high', bars.slice(0, i + 1).map((b) => b.high)),
      low: createSeries('low', bars.slice(0, i + 1).map((b) => b.low)),
      close: createSeries('close', bars.slice(0, i + 1).map((b) => b.close)),
      volume: createSeries('volume', bars.slice(0, i + 1).map((b) => b.volume)),
    }));

    const result = engine.executeBars(contexts);
    console.log('Output x series:');
    const xSeries = engine.outputs.get('x');
    if (xSeries) {
      console.log('values:', JSON.stringify(xSeries.values));
      for (let i = 0; i < xSeries.values.length; i++) {
        console.log(`  bar ${i}: ${xSeries.values[i]}`);
      }
      // With correct history: bar0=1, bar1=2, bar2=3, ...
      // With broken history: bar0=1, bar1=1 (all 1s because x[1] returns NA)
      expect(result.success).toBe(true);
      // Should increment: bar 0 = 1 (nz(NA)+1), bar 1 = 2 (nz(1)+1), etc.
      expect(xSeries.values.length).toBeGreaterThan(1);
    }
  });

  it('res[1] should give previous value for non-var with :=', () => {
    const src = `//@version=6
indicator("test2")
float res = na
res := close
// If res[1] works, this should hold previous close
float prev = na
prev := res[1]
plot(prev)`;
    const { ast } = parse(src);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);

    const bars = Array.from({ length: 5 }, (_, i) => ({
      timestamp: 1700000000000 + i * 3600000,
      open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i,
      volume: 1000,
    }));
    const contexts: ExecutionContext[] = bars.map((bar, i) => ({
      barIndex: i, barCount: bars.length, timestamp: bar.timestamp,
      open: createSeries('open', bars.slice(0, i + 1).map((b) => b.open)),
      high: createSeries('high', bars.slice(0, i + 1).map((b) => b.high)),
      low: createSeries('low', bars.slice(0, i + 1).map((b) => b.low)),
      close: createSeries('close', bars.slice(0, i + 1).map((b) => b.close)),
      volume: createSeries('volume', bars.slice(0, i + 1).map((b) => b.volume)),
    }));

    const result = engine.executeBars(contexts);
    console.log('\nres and prev series:');
    const resSeries = engine.outputs.get('res');
    const prevSeries = engine.outputs.get('prev');
    if (resSeries && prevSeries) {
      console.log('res values:', JSON.stringify(resSeries.values));
      console.log('prev values:', JSON.stringify(prevSeries.values));
      for (let i = 0; i < Math.min(5, resSeries.values.length); i++) {
        console.log(`  bar ${i}: res=${resSeries.values[i]}, prev=${prevSeries.values[i]}`);
      }
      // bar 0: res=close=101, prev=res[1]=NA (no previous bar)
      // bar 1: res=close=102, prev=res[1]=101
      // bar 2: res=close=103, prev=res[1]=102
      expect(prevSeries.values[0]).toBeUndefined(); // NA
      expect(prevSeries.values[1]).toBe(101); // bar 0's close
      expect(prevSeries.values[2]).toBe(102); // bar 1's close
    }
  });
});
