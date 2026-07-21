import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

function createZigzagBars(count: number): Array<{
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}> {
  const bars: Array<any> = [];
  let s = 42;
  const rand = () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < count; i++) {
    const phase = (i % 30) / 30;
    const base = 100 + 10 * Math.sin(phase * Math.PI * 2) + (i / count) * 5;
    const open = base + (rand() - 0.5) * 2;
    const close = base + (rand() - 0.5) * 2;
    const high = Math.max(open, close) + 1 + rand() * 3;
    const low = Math.min(open, close) - 1 - rand() * 3;
    bars.push({ timestamp: 1700000000000 + i * 3600000, open, high, low, close, volume: 1000 });
  }
  return bars;
}

describe('HHLL Debug Labels & Lines', () => {
  const source = fs.readFileSync('./test_indicators/higher-high-lower-low.pine', 'utf-8');
  const { ast } = parse(source);
  const compiled = compile(ast);
  const engine = new ExecutionEngine(compiled);
  const bars = createZigzagBars(200);

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

  it('shows all labels with details', () => {
    console.log(`\n=== ALL ${result.labels?.length ?? 0} LABELS ===`);
    if (result.labels) {
      // Sort by bar index (using time as proxy since label has time)
      const sorted = [...result.labels].sort((a, b) => a.time - b.time);
      for (const label of sorted) {
        const barIdx = Math.round((label.time - 1700000000000) / 3600000);
        console.log(`  Bar ${barIdx}: text="${label.text}" price=${label.price.toFixed(2)} style=${label.style} color=${label.color}`);
      }

      // Check labels at last 15 bars
      const lastBar = 199;
      console.log(`\n=== LABELS IN LAST 15 BARS (bars 185-199) ===`);
      const lastLabels = sorted.filter(l => {
        const barIdx = Math.round((l.time - 1700000000000) / 3600000);
        return barIdx >= 185;
      });
      if (lastLabels.length === 0) {
        console.log('  NO labels in last 15 bars');
      } else {
        for (const label of lastLabels) {
          const barIdx = Math.round((label.time - 1700000000000) / 3600000);
          console.log(`  Bar ${barIdx}: text="${label.text}" price=${label.price.toFixed(2)}`);
        }
      }
    }
  });

  it('shows all lines with extend details', () => {
    console.log(`\n=== ALL ${result.lines?.length ?? 0} LINES ===`);
    if (result.lines) {
      const sorted = [...result.lines].sort((a, b) => a.x1 - b.x1);
      for (const line of sorted) {
        console.log(`  x1=${line.x1} y1=${line.y1.toFixed(2)} x2=${line.x2} y2=${line.y2.toFixed(2)} extend="${line.extend}" style=${line.style} width=${line.width}`);
      }

      // Check last line has extend.right
      if (sorted.length > 0) {
        const lastLine = sorted[sorted.length - 1];
        console.log(`\n=== LAST LINE ===`);
        console.log(`  x1=${lastLine.x1} x2=${lastLine.x2} extend="${lastLine.extend}"`);
        console.log(`  Expected extend to be "right" (the last SR segment should project forward)`);
      }
    }
  });

  it('shows findprevious debug output', () => {
    // Re-run with a smaller script to debug findprevious behavior
    const debugSrc = `//@version=6
indicator("debug_findprev", overlay=true)
lb = input.int(5, "Left Bars", minval=1)
rb = input.int(5, "Right Bars", minval=1)
ph = ta.pivothigh(lb, rb)
pl = ta.pivotlow(lb, rb)
hlFlag = not na(ph) ? 1 : (not na(pl) ? -1 : na)
zz = not na(ph) ? ph : (not na(pl) ? pl : na)

findprevious() =>
    ehl = hlFlag==1 ? -1 : 1
    loc1=0.0, loc2=0.0, loc3=0.0, loc4=0.0, xx=0
    for x=1 to 1000
        if hlFlag[x]==ehl and not na(zz[x])
            loc1:=zz[x], xx:=x+1, break
    ehl:=hlFlag
    for x=xx to 1000
        if hlFlag[x]==ehl and not na(zz[x])
            loc2:=zz[x], xx:=x+1, break
    ehl:=hlFlag==1 ? -1 : 1
    for x=xx to 1000
        if hlFlag[x]==ehl and not na(zz[x])
            loc3:=zz[x], xx:=x+1, break
    ehl:=hlFlag
    for x=xx to 1000
        if hlFlag[x]==ehl and not na(zz[x])
            loc4:=zz[x], break
    [loc1,loc2,loc3,loc4]

float a = na
float b = na
float c = na
float d = na
float e = na
if not na(hlFlag)
    [l1,l2,l3,l4] = findprevious()
    a := zz
    b := l1
    c := l2
    d := l3
    e := l4

// Track when findprevious() returns values
if not na(a)
    label.new(bar_index-rb, zz, xloc=xloc.bar_index, yloc=yloc.abovebar, text="zz="+str.tostring(zz), style=label.style_label_down, size=size.tiny)
`;

    const { ast: ast2 } = parse(debugSrc);
    const compiled2 = compile(ast2);
    const eng2 = new ExecutionEngine(compiled2);

    const contexts2: ExecutionContext[] = bars.map((bar, i) => ({
      barIndex: i,
      barCount: bars.length,
      timestamp: bar.timestamp,
      open: createSeries('open', bars.slice(0, i + 1).map((b) => b.open)),
      high: createSeries('high', bars.slice(0, i + 1).map((b) => b.high)),
      low: createSeries('low', bars.slice(0, i + 1).map((b) => b.low)),
      close: createSeries('close', bars.slice(0, i + 1).map((b) => b.close)),
      volume: createSeries('volume', bars.slice(0, i + 1).map((b) => b.volume)),
    }));

    const r = eng2.executeBars(contexts2);
    console.log(`\n=== FindPrevious Debug: ${r.labels?.length ?? 0} labels on engine ===`);
    if (r.labels) {
      const sorted2 = [...r.labels].sort((a: any, b: any) => a.time - b.time);
      for (const lbl of sorted2.slice(0, 20)) {
        const barIdx = Math.round((lbl.time - 1700000000000) / 3600000);
        console.log(`  Bar ${barIdx}: text="${lbl.text}" price=${lbl.price}`);
      }
    }
  });
});
