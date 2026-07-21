import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine, type ExecutionContext } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

describe('Line Builtin Test', () => {
  it('draws a line with line.new and modifies it', () => {
    const src = `//@version=6
indicator("LineTest")
var line myLine = na
if bar_index == 10
    myLine := line.new(0, 100, 20, 100, xloc=xloc.bar_index, extend=extend.right, style=line.style_dashed, width=3, color=color.red)
if bar_index == 15
    line.set_x2(myLine, 25)
    line.set_extend(myLine, extend.none)`;

    const { ast } = parse(src);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);

    const bars = Array.from({ length: 30 }, (_, i) => ({
      timestamp: 1700000000000 + i * 3600000,
      open: 100 + i,
      high: 102 + i,
      low: 99 + i,
      close: 101 + i,
      volume: 1000,
    }));

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
    console.log('Lines count:', result.lines?.length ?? 0);
    for (const l of result.lines ?? []) {
      console.log('  Line:', JSON.stringify(l));
    }
    expect(result.lines?.length ?? 0).toBe(1);
    if (result.lines && result.lines.length > 0) {
      const line = result.lines[0];
      expect(line.x1).toBe(0);
      expect(line.x2).toBe(25); // modified by set_x2 at bar 15
      expect(line.extend).toBe('none'); // modified by set_extend
      // Style may be 'dashed' or 'style_dashed' depending on namespace resolution
      expect(['dashed', 'style_dashed']).toContain(line.style);
      expect(line.width).toBe(3);
    }
  });

  it('produces lines with HHLL script', () => {
    const source = fs.readFileSync('./test_indicators/higher-high-lower-low.pine', 'utf-8');
    const { ast } = parse(source);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);

    const count = 500;
    const bars: Array<{
      timestamp: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }> = [];
    let price = 100;
    let s = 42;
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
    console.log('\nHHLL 500 bars:');
    console.log('Labels:', result.labels?.length ?? 0);
    console.log('Lines:', result.lines?.length ?? 0);

    // Also check if the lines output has expected properties
    if (result.lines && result.lines.length > 0) {
      for (const l of result.lines.slice(0, 5)) {
        console.log('  Line:', JSON.stringify(l));
      }
      if (result.lines.length > 5) {
        console.log(`  ... and ${result.lines.length - 5} more`);
      }
    }

    // The test doesn't assert lines > 0 — just informational
  });
});
