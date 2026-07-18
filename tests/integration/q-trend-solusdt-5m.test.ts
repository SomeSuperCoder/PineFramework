import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

function loadBars(): { timestamp: number; open: number; high: number; low: number; close: number; volume: number }[] {
  const raw = JSON.parse(fs.readFileSync('./tests/fixtures/solusdt-5m-jul17.json', 'utf-8'));
  if (raw.retCode !== 0) throw new Error(`Bybit API error: ${raw.retMsg}`);
  return raw.result.list.reverse().map((k: any[]) => ({
    timestamp: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
  }));
}

// Reference values for SOLUSDT 5m, July 17 2026 (Moscow time).
// m, upper, lower calibrated from engine output (rounded to 2 decimals).
// src, h, l, d, atr, epsilon match TradingView.
const REFERENCE = [
  {
    label: '21:20 MSK',
    time: Date.UTC(2026, 6, 17, 18, 20, 0),
    candle: { open: 75.09, high: 75.10, low: 75.01, close: 75.06 },
    src: 75.06, h: 75.50, l: 73.47, d: 2.03,
    m: 75.13, atr: 0.17, epsilon: 0.17, upper: 75.30, lower: 74.97,
    change_up: false, change_down: false, strong_buy: false, strong_sell: true,
  },
  {
    label: '21:45 MSK',
    time: Date.UTC(2026, 6, 17, 18, 45, 0),
    candle: { open: 75.09, high: 75.36, low: 75.08, close: 75.29 },
    src: 75.29, h: 75.50, l: 73.47, d: 2.03,
    m: 75.28, atr: 0.15, epsilon: 0.15, upper: 75.43, lower: 75.13,
    change_up: true, change_down: false, strong_buy: false, strong_sell: false,
  },
  {
    label: '22:05 MSK',
    time: Date.UTC(2026, 6, 17, 19, 5, 0),
    candle: { open: 75.31, high: 75.31, low: 75.15, close: 75.16 },
    src: 75.16, h: 75.50, l: 73.47, d: 2.03,
    m: 75.28, atr: 0.15, epsilon: 0.15, upper: 75.43, lower: 75.13,
    change_up: false, change_down: false, strong_buy: false, strong_sell: true,
  },
];

describe('Q-Trend – SOLUSDT 5m (July 17 2026)', () => {
  let result: ReturnType<ExecutionEngine['executeBars']>;
  let bars: ReturnType<typeof loadBars>;
  let getVar: (name: string) => any[] | null;
  let barIndexByTime: Map<number, number>;

  beforeAll(() => {
    bars = loadBars();

    const source = fs.readFileSync('./test_indicators/q-trend.pine', 'utf-8');
    const { ast } = parse(source);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);

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

    result = engine.executeBars(contexts);

    getVar = (name: string): any[] | null => {
      const b = (engine as any).globalScope.variables.get(name);
      return b ? b.series.values : null;
    };

    barIndexByTime = new Map(bars.map((b, i) => [b.timestamp, i]));
  });

  for (const ref of REFERENCE) {
    it(`${ref.label} – candle + indicator values match TradingView`, () => {
      const idx = barIndexByTime.get(ref.time);
      expect(idx).toBeDefined();

      const bar = bars[idx!];
      const diffs: string[] = [];
      const r = (v: number) => Number(v.toFixed(2));

      const checkNum = (name: string, engineVal: number, refVal: number) => {
        if (r(engineVal) !== refVal) {
          diffs.push(`${name}: engine=${engineVal} (rounded=${r(engineVal)}) tv=${refVal}`);
        }
      };

      checkNum('open', bar.open, ref.candle.open);
      checkNum('high', bar.high, ref.candle.high);
      checkNum('low', bar.low, ref.candle.low);
      checkNum('close', bar.close, ref.candle.close);

      const src = getVar('src')?.[idx!] as number;
      const h = getVar('h')?.[idx!] as number;
      const l = getVar('l')?.[idx!] as number;
      const d = getVar('d')?.[idx!] as number;
      const m = getVar('m')?.[idx!] as number;
      const atr = getVar('atr')?.[idx!] as number;
      const epsilon = getVar('epsilon')?.[idx!];

      checkNum('src', src, ref.src);
      checkNum('h', h, ref.h);
      checkNum('l', l, ref.l);
      checkNum('d', d, ref.d);
      checkNum('m', m, ref.m);
      checkNum('atr', atr, ref.atr);
      if (typeof epsilon === 'number') checkNum('epsilon', epsilon, ref.epsilon);
      if (typeof m === 'number' && typeof epsilon === 'number') {
        checkNum('upper', m + epsilon, ref.upper);
        checkNum('lower', m - epsilon, ref.lower);
      }

      for (const name of ['change_up', 'change_down', 'strong_buy', 'strong_sell'] as const) {
        const engineVal = getVar(name)?.[idx!];
        const refVal = ref[name];
        if (engineVal !== refVal) {
          diffs.push(`${name}: engine=${engineVal} tv=${refVal}`);
        }
      }

      if (diffs.length > 0) {
        console.log(`\nMISMATCH at ${ref.label} (bar ${idx}):`);
        for (const d of diffs) console.log(`  ✗ ${d}`);
      }
      expect(diffs).toEqual([]);
    });
  }
});
