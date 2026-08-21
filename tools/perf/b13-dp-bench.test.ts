/* B13 perf probe: DP sensitivity for indicator compute (supertrend-3d, 2000 bars). */
import { parse } from '../../src/language/parser/index.js';
import { compile } from '../../src/language/compiler/index.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import { configureDecimal, DECIMAL_PRECISION } from '../../src/language/runtime/numbers/decimal-config.js';
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

function snapshot(result: any): string {
  // serialize every output series value to full precision
  const parts: string[] = [];
  const outputs: Map<string, any> = result.outputs ?? new Map();
  for (const k of [...outputs.keys()].sort()) {
    const series = outputs.get(k);
    const arr = typeof series?.toArray === 'function' ? series.toArray() : series;
    if (Array.isArray(arr)) {
      parts.push(k + '=' + arr.map((x: any) => (typeof x === 'number' ? x.toPrecision(17) : String(x))).join(','));
    }
  }
  return parts.join('|');
}

import { test } from 'vitest';

test('b13 dp bench', async () => { await main(); }, 1_700_000);

async function main() {
  const BAR_COUNT = Number(process.argv[2] ?? 400);
  const REPS = Number(process.argv[3] ?? 5);
  // JIT warmup (untimed)
  configureDecimalSafe(20);
  await runOnce(60);
  const dps = [20, 15, 12, 10];
  const results: Record<number, { times: number[]; snap: string }> = {} as any;
  for (const dp of dps) {
    configureDecimalSafe(dp);
    const times: number[] = [];
    let snap = '';
    for (let r = 0; r < REPS; r++) {
      const { ms, result } = await runOnce(BAR_COUNT);
      times.push(ms);
      if (r === 0) snap = snapshot(result);
    }
    results[dp] = { times, snap };
    console.log(`DP=${dp} times=${times.map((t) => t.toFixed(1)).join(',')}ms`);
  }
  // drift vs DP=20
  const base = results[20].snap;
  for (const dp of dps.slice(1)) {
    const s = results[dp].snap;
    if (s === base) { console.log(`DP=${dp}: output IDENTICAL to DP=20`); continue; }
    // max abs diff per number
    let maxDiff = 0;
    const a = [...base.matchAll(/(-?\d+(\.\d+)?([eE][+-]?\d+)?)/g)].map((m) => parseFloat(m[1]));
    const b = [...s.matchAll(/(-?\d+(\.\d+)?([eE][+-]?\d+)?)/g)].map((m) => parseFloat(m[1]));
    console.log(`DP=${dp}: output DIFFERS (len ${a.length} vs ${b.length})`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) maxDiff = Math.max(maxDiff, Math.abs(a[i] - b[i]));
    console.log(`DP=${dp}: max abs diff = ${maxDiff.toExponential(3)}`);
  }
}

function configureDecimalSafe(dp: number) {
  Decimal.set({ precision: dp, rounding: 4 });
  // keep module constant in sync for anything reading it
  void DECIMAL_PRECISION;
  void configureDecimal;
}

main().catch((e) => { console.error(e); process.exit(1); });
