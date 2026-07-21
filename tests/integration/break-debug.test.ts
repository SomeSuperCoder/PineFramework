import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine, type ExecutionContext } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

// Generate bars with clear zigzag pattern for reliable pivot detection
function createZigzagBars(count: number): Array<{
  timestamp: number; open: number; high: number; low: number; close: number; volume: number;
}> {
  const bars: Array<any> = [];
  let s = 42;
  const rand = () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };

  // Create a wave: peaks at bars 20, 50, 80, ... troughs at 35, 65, 95, ...
  for (let i = 0; i < count; i++) {
    const phase = (i % 30) / 30; // 0 to 1 over 30 bars
    // Base price oscillates between 90 and 110
    const base = 100 + 10 * Math.sin(phase * Math.PI * 2) + (i / count) * 5; // slight overall uptrend
    const open = base + (rand() - 0.5) * 2;
    const close = base + (rand() - 0.5) * 2;
    const high = Math.max(open, close) + 1 + rand() * 3;
    const low = Math.min(open, close) - 1 - rand() * 3;
    bars.push({ timestamp: 1700000000000 + i * 3600000, open, high, low, close, volume: 1000 });
  }
  return bars;
}

describe('Break and Pivot Tests', () => {
  it('break exits a for loop', () => {
    const src = `//@version=6
indicator("BreakTest")
result = 0
for x=1 to 100
    result := result + 1
    if result >= 5
        break
plot(result)`;

    const { ast } = parse(src);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);

    const bars = Array.from({ length: 3 }, (_, i) => ({
      timestamp: 1700000000000 + i * 3600000,
      open: 100, high: 102, low: 99, close: 101, volume: 1000,
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
    const output = result.outputs.get('plot');
    expect(output?.values[output.values.length - 1]).toBe(5);
  });

  it('pivot detection works with zigzag data', () => {
    const src = `//@version=6
indicator("PivotTest")
ph = ta.pivothigh(5, 5)
pl = ta.pivotlow(5, 5)
plot(ph, "ph")
plot(pl, "pl")`;

    const { ast } = parse(src);
    const compiled = compile(ast);
    const bars = createZigzagBars(200);
    const engine = new ExecutionEngine(compiled);

    const contexts: ExecutionContext[] = bars.map((bar, i) => ({
      barIndex: i, barCount: bars.length, timestamp: bar.timestamp,
      open: createSeries('open', bars.slice(0, i + 1).map((b) => b.open)),
      high: createSeries('high', bars.slice(0, i + 1).map((b) => b.high)),
      low: createSeries('low', bars.slice(0, i + 1).map((b) => b.low)),
      close: createSeries('close', bars.slice(0, i + 1).map((b) => b.close)),
      volume: createSeries('volume', bars.slice(0, i + 1).map((b) => b.volume)),
    }));

    const result = engine.executeBars(contexts);
    expect(result.success).toBe(true);

    const phSeries = result.outputs.get('ph');
    const plSeries = result.outputs.get('pl');

    const phCount = phSeries?.values.filter(v => v !== null && typeof v === 'number').length ?? 0;
    const plCount = plSeries?.values.filter(v => v !== null && typeof v === 'number').length ?? 0;
    
    console.log(`PivotHighs: ${phCount}, PivotLows: ${plCount} out of ${bars.length} bars`);

    // With zigzag data and lb=5, rb=5, we should get many pivots
    expect(phCount + plCount).toBeGreaterThan(10);
  });

  it('debug HHLL S/R full pipeline including res/sup/trend/line drawing', () => {
    const src = `//@version=6
indicator("HHLLDebug", overlay=true)
lb = 5
rb = 5
ph = ta.pivothigh(lb, rb)
pl = ta.pivotlow(lb, rb)
hlFlag = not na(ph) ? 1 : (not na(pl) ? -1 : na)
zz = not na(ph) ? ph : (not na(pl) ? pl : na)
zz := (not true and not na(pl) and hlFlag==-1 and ta.valuewhen(hlFlag!=0, hlFlag, 1)==-1 and pl > ta.valuewhen(not na(zz), zz, 1)) ? na : zz
zz := (not true and not na(ph) and hlFlag== 1 and ta.valuewhen(hlFlag!=0, hlFlag, 1)== 1 and ph < ta.valuewhen(not na(zz), zz, 1)) ? na : zz
hlFlag := hlFlag==-1 and ta.valuewhen(hlFlag!=0, hlFlag, 1)==1  and zz > ta.valuewhen(not na(zz), zz, 1) ? na : hlFlag
hlFlag := hlFlag== 1 and ta.valuewhen(hlFlag!=0, hlFlag, 1)==-1 and zz < ta.valuewhen(not na(zz), zz, 1) ? na : hlFlag
zz := na(hlFlag) ? na : zz
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
a = na
b = na
c = na
d = na
e = na
if not na(hlFlag)
    [l1,l2,l3,l4] = findprevious()
    a := zz
    b := l1
    c := l2
    d := l3
    e := l4
isHH_raw = not na(zz) and (a>b and a>c and c>b and c>d)
isLL_raw = not na(zz) and (a<b and a<c and c<b and c<d)
isHL_raw = not na(zz) and ((a>=c and (b>c and b>d and d>c and d>e)) or (a<b and a>c and b<d))
isLH_raw = not na(zz) and ((a<=c and (b<c and b<d and d<c and d<e)) or (a>b and a<c and b>d))
// === Dynamic S/R drawing (same as full script) ===
float res = na
float sup = na
res := isLH_raw ? zz : res[1]
sup := isHL_raw ? zz : sup[1]
int trend = na
trend := close>res ? 1 : (close<sup ? -1 : nz(trend[1]))
res := ((trend==1 and isHH_raw) or (trend==-1 and isLH_raw)) ? zz : res
sup := ((trend==1 and isHL_raw) or (trend==-1 and isLL_raw)) ? zz : sup
rechange = res != res[1]
suchange = sup != sup[1]
// draw lines
var line resLine = na
var line supLine = na
if true
    if rechange and not na(res)
        if not na(resLine)
            line.set_x2(resLine, bar_index), line.set_extend(resLine, extend.none)
        resLine := line.new(bar_index-rb, res, bar_index, res, xloc=xloc.bar_index, extend=extend.right, style=line.style_dotted, width=3, color=color.red)
    if suchange and not na(sup)
        if not na(supLine)
            line.set_x2(supLine, bar_index), line.set_extend(supLine, extend.none)
        supLine := line.new(bar_index-rb, sup, bar_index, sup, xloc=xloc.bar_index, extend=extend.right, style=line.style_dotted, width=3, color=color.blue)
plot(rechange ? 1 : 0, "re", display=display.none)
plot(suchange ? 1 : 0, "se", display=display.none)
plot(res, "res", display=display.none)
plot(sup, "sup", display=display.none)`;

    function createZigzagBars(count: number): Array<any> {
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

    const { ast } = parse(src);
    const compiled = compile(ast);
    const bars = createZigzagBars(500);
    const engine = new ExecutionEngine(compiled);

    const contexts: ExecutionContext[] = bars.map((bar, i) => ({
      barIndex: i, barCount: bars.length, timestamp: bar.timestamp,
      open: createSeries('open', bars.slice(0, i + 1).map((b) => b.open)),
      high: createSeries('high', bars.slice(0, i + 1).map((b) => b.high)),
      low: createSeries('low', bars.slice(0, i + 1).map((b) => b.low)),
      close: createSeries('close', bars.slice(0, i + 1).map((b) => b.close)),
      volume: createSeries('volume', bars.slice(0, i + 1).map((b) => b.volume)),
    }));

    const result = engine.executeBars(contexts);
    expect(result.success).toBe(true);

    const reS = result.outputs.get('re')!;
    const seS = result.outputs.get('se')!;
    const resS = result.outputs.get('res')!;
    const supS = result.outputs.get('sup')!;

    // Count how many times rechange/suchange fire
    let reCount = 0;
    for (let i = 0; i < reS.values.length; i++) {
      if (reS.values[i] === 1) reCount++;
    }
    let seCount = 0;
    for (let i = 0; i < seS.values.length; i++) {
      if (seS.values[i] === 1) seCount++;
    }

    // Count non-NA res values
    let resCount = 0;
    for (let i = 0; i < resS.values.length; i++) {
      if (typeof resS.values[i] === 'number' && !isNaN(resS.values[i])) resCount++;
    }

    console.log(`rechange=true count: ${reCount}, suchange=true count: ${seCount}`);
    console.log(`non-na res values: ${resCount}`);
    console.log(`Lines: ${result.lines?.length ?? 0}`);

    // Show first few rechange bars with the corresponding res value
    for (let i = 0; i < Math.min(reS.values.length, 30); i++) {
      if (reS.values[i] === 1 || seS.values[i] === 1) {
        console.log(`  Bar ${i}: rechange=${reS.values[i]}, suchange=${seS.values[i]}, res=${resS.values[i]}, sup=${supS.values[i]}`);
      }
    }
  });

  it('multiple sequential break calls in findprevious', () => {
    // Simulate the EXACT findprevious pattern from the HHLL script
    const src = `//@version=6
indicator("FindPrevSeqTest")

// Create a sequence of alternating pivots: high(110), low(95), high(115), low(90), high(120)
flag = na
zz = na
if bar_index == 10
    flag := 1    // high
    zz := 110
if bar_index == 20
    flag := -1   // low
    zz := 95
if bar_index == 30
    flag := 1    // high
    zz := 115
if bar_index == 40
    flag := -1   // low
    zz := 90
if bar_index == 50
    flag := 1    // high
    zz := 120

// Exact findprevious logic from HHLL
findprevious() =>
    ehl = flag==1 ? -1 : 1
    loc1=0.0, loc2=0.0, loc3=0.0, loc4=0.0, xx=0
    for x=1 to 100
        if flag[x]==ehl and not na(zz[x])
            loc1:=zz[x], xx:=x+1, break
    ehl:=flag
    for x=xx to 100
        if flag[x]==ehl and not na(zz[x])
            loc2:=zz[x], xx:=x+1, break
    ehl:=flag==1 ? -1 : 1
    for x=xx to 100
        if flag[x]==ehl and not na(zz[x])
            loc3:=zz[x], xx:=x+1, break
    ehl:=flag
    for x=xx to 100
        if flag[x]==ehl and not na(zz[x])
            loc4:=zz[x], break
    [loc1,loc2,loc3,loc4]

// Test at bar 50: current flag=1 (high), zz=120
// Expected findprevious results:
//   ehl=-1 → search for flag[x]==-1 (low) → nearest is bar 40, zz=90 → loc1=90, xx=11
//   ehl=1  → search for flag[x]==1 (high) after xx=11 → nearest is bar 30, zz=115 → loc2=115, xx=21
//   ehl=-1 → search for flag[x]==-1 (low) after xx=21 → nearest is bar 20, zz=95 → loc3=95, xx=31
//   ehl=1  → search for flag[x]==1 (high) after xx=31 → nearest is bar 10, zz=110 → loc4=110
// Result: [90, 115, 95, 110]
//
// With BROKEN break: all loops iterate to 100, loc1=last match found, xx=101 (or similar)
// Then searches 2,3,4 start at xx=101 and find nothing → [last_low, 0, 0, 0] or similar wrong result

a = na
b = na
c = na
d = na
e = na
if not na(flag)
    [l1,l2,l3,l4] = findprevious()
    a := zz
    b := l1
    c := l2
    d := l3
    e := l4

plot(a, "a")
plot(b, "b")
plot(c, "c")
plot(d, "d")
plot(e, "e")`;

    const { ast } = parse(src);
    const compiled = compile(ast);

    const bars = Array.from({ length: 60 }, (_, i) => ({
      timestamp: 1700000000000 + i * 3600000,
      open: 100, high: 105, low: 95, close: 101, volume: 1000,
    }));

    const engine = new ExecutionEngine(compiled);
    const contexts: ExecutionContext[] = bars.map((bar, i) => ({
      barIndex: i, barCount: bars.length, timestamp: bar.timestamp,
      open: createSeries('open', bars.slice(0, i + 1).map((b) => b.open)),
      high: createSeries('high', bars.slice(0, i + 1).map((b) => b.high)),
      low: createSeries('low', bars.slice(0, i + 1).map((b) => b.low)),
      close: createSeries('close', bars.slice(0, i + 1).map((b) => b.close)),
      volume: createSeries('volume', bars.slice(0, i + 1).map((b) => b.volume)),
    }));

    const result = engine.executeBars(contexts);
    expect(result.success).toBe(true);

    const aSeries = result.outputs.get('a');
    const bSeries = result.outputs.get('b');
    const cSeries = result.outputs.get('c');
    const dSeries = result.outputs.get('d');
    const eSeries = result.outputs.get('e');

    // At bar 50: flag=1, zz=120
    // findprevious() should return [90, 115, 95, 110]
    // a=zz=120
    // b=l1=90, c=l2=115, d=l3=95, e=l4=110
    
    console.log(`Bar 50: a=${aSeries?.values[50]}, b=${bSeries?.values[50]}, c=${cSeries?.values[50]}, d=${dSeries?.values[50]}, e=${eSeries?.values[50]}`);

    expect(aSeries?.values[50]).toBe(120); // zz at current bar
    expect(bSeries?.values[50]).toBe(90);  // nearest low pivot (40)
    expect(cSeries?.values[50]).toBe(115); // high after that (30)
    expect(dSeries?.values[50]).toBe(95);  // low after that (20)
    expect(eSeries?.values[50]).toBe(110); // high after that (10)
  });
});
