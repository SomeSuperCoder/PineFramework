import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine, type ExecutionContext } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

function createTrendingBars(count: number, startPrice: number, seed: number = 42) {
  const bars: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = [];
  let price = startPrice;
  let s = seed;
  const rand = () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
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

describe('SuperTrend AI Perf Debug', () => {
  it('checks perf values on bar 0 and bar 50', () => {
    // Modified script that also plots data values
    const source = `
//@version=5
indicator("SuperTrend AI Debug")
length = input(10, 'ATR Length')
minMult = input.int(1, 'Factor Range')
maxMult = input.int(5, '')
step = input.float(.5, 'Step')
perfAlpha = input.float(10, 'Performance Memory')
maxIter = input.int(50, 'Maximum Iteration Steps')
maxData = input.int(10000, 'Historical Bars Calculation')

type supertrend
    float upper = hl2
    float lower = hl2
    float output
    float perf = 0
    float factor
    int trend = 0

type vector
    array<float> out

var holder = array.new<supertrend>(0)
var factors = array.new<float>(0)

if barstate.isfirst
    for i = 0 to int((maxMult - minMult) / step)
        factors.push(minMult + i * step)
        holder.push(supertrend.new())

atr = ta.atr(length)

k = 0
for factor in factors
    get_spt = holder.get(k)
    up = hl2 + atr * factor
    dn = hl2 - atr * factor
    get_spt.trend := close > get_spt.upper ? 1 : close < get_spt.lower ? 0 : get_spt.trend
    get_spt.upper := close[1] < get_spt.upper ? math.min(up, get_spt.upper) : up
    get_spt.lower := close[1] > get_spt.lower ? math.max(dn, get_spt.lower) : dn
    diff = nz(math.sign(close[1] - get_spt.output))
    get_spt.perf += 2/(perfAlpha+1) * (nz(close - close[1]) * diff - get_spt.perf)
    get_spt.output := get_spt.trend == 1 ? get_spt.lower : get_spt.upper
    get_spt.factor := factor
    k += 1

// Plot perf values for debug
plot(holder.get(0).perf, "perf_0")
plot(holder.get(1).perf, "perf_1")
plot(holder.get(2).perf, "perf_2")
plot(holder.get(3).perf, "perf_3")
plot(holder.get(4).perf, "perf_4")
plot(holder.get(5).perf, "perf_5")
plot(holder.get(6).perf, "perf_6")
plot(holder.get(7).perf, "perf_7")
plot(holder.get(8).perf, "perf_8")

// Also plot ATR 
plot(atr, "atr")
`;
    
    const { ast } = parse(source);
    const compiled = compile(ast);
    const bars = createTrendingBars(100, 80);
    const engine = new ExecutionEngine(compiled);
    const contexts: ExecutionContext[] = bars.map((bar, i) => ({
      barIndex: i, barCount: bars.length, timestamp: bar.timestamp,
      open: createSeries('open', bars.slice(0, i + 1).map(b => b.open)),
      high: createSeries('high', bars.slice(0, i + 1).map(b => b.high)),
      low: createSeries('low', bars.slice(0, i + 1).map(b => b.low)),
      close: createSeries('close', bars.slice(0, i + 1).map(b => b.close)),
      volume: createSeries('volume', bars.slice(0, i + 1).map(b => b.volume)),
    }));
    
    const result = engine.executeBars(contexts);
    expect(result.success).toBe(true);
    
    if (result.success) {
      // Show perf values at bar 0, 10, 50, 99
      const perfKeys = ['perf_0', 'perf_1', 'perf_2', 'perf_3', 'perf_4', 'perf_5', 'perf_6', 'perf_7', 'perf_8'];
      
      for (const barIdx of [0, 10, 50, 99]) {
        console.log(`\n=== Bar ${barIdx} ===`);
        const vals: number[] = [];
        for (const key of perfKeys) {
          const series = result.outputs.get(key);
          if (series && series.values[barIdx] !== null) {
            vals.push(series.values[barIdx] as number);
          }
        }
        console.log(`  Perf values: [${vals.map(v => v.toFixed(4)).join(', ')}]`);
        if (vals.length > 0) {
          const sorted = [...vals].sort((a, b) => a - b);
          const p25 = sorted[Math.floor(0.25 * (sorted.length - 1))];
          const p50 = sorted[Math.floor(0.5 * (sorted.length - 1))];
          const p75 = sorted[Math.floor(0.75 * (sorted.length - 1))];
          console.log(`  Sorted: [${sorted.map(v => v.toFixed(4)).join(', ')}]`);
          console.log(`  P25=${p25.toFixed(4)} P50=${p50.toFixed(4)} P75=${p75.toFixed(4)}`);
        }
      }
      
      // Check if perf values are distinct (not all equal)
      const lastBarSeries = result.outputs.get('perf_0')?.values || [];
      const nonNullLast = lastBarSeries.filter(v => v !== null);
      console.log(`\nperf_0 has ${nonNullLast.length}/${lastBarSeries.length} non-null values`);
      
      // Check uniqueness at bar 99
      const bar99Vals: number[] = [];
      for (const key of perfKeys) {
        const series = result.outputs.get(key);
        if (series && series.values[99] !== null) {
          bar99Vals.push(series.values[99] as number);
        }
      }
      const uniqueVals = new Set(bar99Vals.map(v => v.toFixed(6)));
      console.log(`Unique perf values at bar 99: ${uniqueVals.size} (of ${bar99Vals.length})`);
    }
  });
});
