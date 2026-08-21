/* F3 perf probe: supertrend-3d, single-DP timed loop for CPU profiling. Args: barCount reps */
import { parse } from '../../src/language/parser/index.js';
import { compile } from '../../src/language/compiler/index.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import { Decimal } from 'decimal.js';
import * as fs from 'fs';

const SOURCE = fs.readFileSync('./test_indicators/supertrend-3d.pine', 'utf-8');

function createBars(count: number, startPrice = 100) {
  const bars: any[] = [];
  let price = startPrice;
  let s = 42;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < count; i++) {
    const open = price;
    const change = (rand() - 0.5) * 4;
    const close = open + change;
    const high = Math.max(open, close) + rand() * 2;
    const low = Math.min(open, close) - rand() * 2;
    bars.push({ timestamp: 1700000000000 + i * 3600000, open, high, low, close, volume: Math.floor(rand() * 10000) + 1000 });
    price = close;
  }
  return bars;
}

function barsToContext(bars: any[]) {
  return bars.map((bar, index) => ({
    barIndex: index,
    barCount: bars.length,
    timestamp: bar.timestamp,
    open: createSeries('open', [bar.open]),
    high: createSeries('high', [bar.high]),
    low: createSeries('low', [bar.low]),
    close: createSeries('close', [bar.close]),
    volume: createSeries('volume', [bar.volume]),
  }));
}

async function runOnce(barCount: number) {
  const { ast } = parse(SOURCE);
  const compileResult = compile(ast);
  const engine = new ExecutionEngine(compileResult);
  const contexts = barsToContext(createBars(barCount));
  const t0 = performance.now();
  const result = await engine.executeBars(contexts);
  const ms = performance.now() - t0;
  if (!result.success) throw new Error('exec failed: ' + result.error);
  return { ms, result };
}

async function main() {
  const BAR_COUNT = Number(process.argv[2] ?? 2000);
  const REPS = Number(process.argv[3] ?? 3);
  Decimal.set({ precision: 20, rounding: 4 });
  await runOnce(60); // warmup
  const times: number[] = [];
  for (let r = 0; r < REPS; r++) {
    const { ms } = await runOnce(BAR_COUNT);
    times.push(ms);
  }
  console.log(`bars=${BAR_COUNT} times=${times.map((t) => t.toFixed(1)).join(',')}`);
  // output snapshot for before/after parity
  const { result } = await runOnce(BAR_COUNT);
  const parts: string[] = [];
  for (const k of [...result.outputs.keys()].sort()) {
    const s = result.outputs.get(k);
    const arr = Array.isArray(s) ? s : (s?.values ?? s);
    if (Array.isArray(arr)) parts.push(k + '=' + arr.map((x: any) => (typeof x === 'number' ? x.toPrecision(17) : String(x))).join(','));
  }
  console.log('SNAPSHOT|' + parts.join('|'));
}
main().catch((e) => { console.error(e); process.exit(1); });
