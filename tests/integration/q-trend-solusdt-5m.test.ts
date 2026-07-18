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

// Reference values for SOLUSDT 5m, July 17-18 2026 (Moscow time).
// Bars chosen at shape-producing bars (where plotshape() fires).
// Shapes require additional conditions (change_down or change_up must
// be true simultaneously with strong_buy/strong_sell and ls[1] guard).
interface ShapeSpec { text: string; style: string; location: string }
const REFERENCE: Array<{
  label: string; time: number;
  candle: { open: number; high: number; low: number; close: number };
  src: number; h: number; l: number; d: number;
  m: number; atr: number; epsilon: number; upper: number; lower: number;
  change_up: boolean; change_down: boolean; strong_buy: boolean; strong_sell: boolean;
  shape: ShapeSpec | null;
}> = [
  {
    label: '21:15 MSK',
    time: Date.UTC(2026, 6, 17, 18, 15, 0),
    candle: { open: 75.26, high: 75.26, low: 75.05, close: 75.09 },
    src: 75.09, h: 75.50, l: 73.47, d: 2.03,
    m: 75.13, atr: 0.16, epsilon: 0.16, upper: 75.29, lower: 74.97,
    change_up: false, change_down: true, strong_buy: false, strong_sell: true,
    shape: { text: 'STRONG', style: 'labeldown', location: 'abovebar' },
  },
  {
    label: '21:45 MSK',
    time: Date.UTC(2026, 6, 17, 18, 45, 0),
    candle: { open: 75.09, high: 75.36, low: 75.08, close: 75.29 },
    src: 75.29, h: 75.50, l: 73.47, d: 2.03,
    m: 75.28, atr: 0.15, epsilon: 0.15, upper: 75.43, lower: 75.13,
    change_up: true, change_down: false, strong_buy: false, strong_sell: false,
    shape: { text: 'BUY', style: 'labelup', location: 'belowbar' },
  },
  {
    label: '22:10 MSK',
    time: Date.UTC(2026, 6, 17, 19, 10, 0),
    candle: { open: 75.16, high: 75.16, low: 75.02, close: 75.05 },
    src: 75.05, h: 75.50, l: 73.47, d: 2.03,
    m: 75.13, atr: 0.15, epsilon: 0.15, upper: 75.28, lower: 74.97,
    change_up: false, change_down: true, strong_buy: false, strong_sell: true,
    shape: { text: 'STRONG', style: 'labeldown', location: 'abovebar' },
  },
];

describe('Q-Trend – SOLUSDT 5m (July 17 2026)', () => {
  let result: ReturnType<ExecutionEngine['executeBars']>;
  let bars: ReturnType<typeof loadBars>;
  let getVar: (name: string) => any[] | null;
  let getShape: (idx: number) => Array<{ text: string; style: string; location: string; }>;
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

    getShape = (idx: number) => {
      const bar = bars[idx];
      return (result.shapes || [])
        .filter((s: any) => s.time === bar.timestamp)
        .map((s: any) => ({ text: s.text, style: s.style, location: s.location }));
    };

    barIndexByTime = new Map(bars.map((b, i) => [b.timestamp, i]));
  });

  for (const ref of REFERENCE) {
    it(`${ref.label} – signal shape, variables, and candles match`, () => {
      const idx = barIndexByTime.get(ref.time);
      expect(idx).toBeDefined();

      const bar = bars[idx!];
      const diffs: string[] = [];
      const r = (v: number) => Number(v.toFixed(2));

      const checkNum = (name: string, engineVal: number, refVal: number) => {
        if (r(engineVal) !== refVal) {
          diffs.push(`${name}: engine=${engineVal} (rounded=${r(engineVal)}) expected=${refVal}`);
        }
      };

      // Candle
      checkNum('open', bar.open, ref.candle.open);
      checkNum('high', bar.high, ref.candle.high);
      checkNum('low', bar.low, ref.candle.low);
      checkNum('close', bar.close, ref.candle.close);

      // Indicator variables
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

      // Boolean signal variables
      for (const name of ['change_up', 'change_down', 'strong_buy', 'strong_sell'] as const) {
        const engineVal = getVar(name)?.[idx!];
        const refVal = ref[name];
        if (engineVal !== refVal) {
          diffs.push(`${name}: engine=${engineVal} expected=${refVal}`);
        }
      }

      // Shape check
      const shapes = getShape(idx!);
      if (ref.shape) {
        const matching = shapes.filter(s => s.text === ref.shape!.text);
        if (matching.length === 0) {
          diffs.push(`shape: expected text="${ref.shape.text}" but found no matching shape at this bar`);
          diffs.push(`  (all shapes at this bar: ${JSON.stringify(shapes)})`);
        } else {
          const match = matching[0];
          if (match.style !== ref.shape.style) {
            diffs.push(`shape.style: engine=${match.style} expected=${ref.shape.style}`);
          }
          if (match.location !== ref.shape.location) {
            diffs.push(`shape.location: engine=${match.location} expected=${ref.shape.location}`);
          }
        }
      } else if (shapes.length > 0) {
        diffs.push(`shape: expected no shape but found ${JSON.stringify(shapes)}`);
      }

      if (diffs.length > 0) {
        console.log(`\nMISMATCH at ${ref.label} (bar ${idx}):`);
        for (const d of diffs) console.log(`  ✗ ${d}`);
      }
      expect(diffs).toEqual([]);
    });
  }
});
