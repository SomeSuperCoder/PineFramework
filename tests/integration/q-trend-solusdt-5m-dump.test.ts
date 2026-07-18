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
  return raw.result.list.reverse().map((k: any[]) => ({
    timestamp: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
  }));
}

describe('Q-Trend SOLUSDT 5m – debug dump', () => {
  it('dumps all intermediate values around the divergence', () => {
    const bars = loadBars();
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

    engine.executeBars(contexts);

    const getVar = (name: string): any[] | null => {
      const b = (engine as any).globalScope.variables.get(name);
      return b ? b.series.values : null;
    };

    // Reference times (UTC)
    const refTimes = [
      Date.UTC(2026, 6, 17, 18, 20, 0),  // 21:20 MSK
      Date.UTC(2026, 6, 17, 18, 45, 0),  // 21:45 MSK
      Date.UTC(2026, 6, 17, 19, 5, 0),   // 22:05 MSK
    ];
    const refBarIndices = refTimes.map(t => bars.findIndex(b => b.timestamp === t));

    const srcV = getVar('src')!;
    const hV = getVar('h')!;
    const lV = getVar('l')!;
    const dV = getVar('d')!;
    const mV = getVar('m')!;
    const atrV = getVar('atr')!;
    const epsV = getVar('epsilon')!;
    const cuV = getVar('change_up')!;
    const cdV = getVar('change_down')!;

    // Find the first bar where m diverges by checking the delta pattern
    // We look for bars where m changes and check if the change is epsilon-scaled
    console.log('bar,ts_utc,m,change_up,change_down,epsilon,src,h,l');
    const startBar = Math.max(0, Math.min(...refBarIndices) - 30);
    const endBar = Math.min(bars.length - 1, Math.max(...refBarIndices) + 5);
    for (let i = startBar; i <= endBar; i++) {
      const ts = new Date(bars[i].timestamp).toISOString().replace('T', ' ').substring(0, 16);
      const m = typeof mV[i] === 'number' ? mV[i].toFixed(4) : 'NA';
      const eps = typeof epsV[i] === 'number' ? epsV[i].toFixed(4) : 'NA';
      const src = typeof srcV[i] === 'number' ? srcV[i].toFixed(4) : 'NA';
      const h = typeof hV[i] === 'number' ? hV[i].toFixed(4) : 'NA';
      const l = typeof lV[i] === 'number' ? lV[i].toFixed(4) : 'NA';
      const cu = cuV[i] === true ? 'T' : 'F';
      const cd = cdV[i] === true ? 'T' : 'F';
      const mark = refBarIndices.includes(i) ? ' <--- REF' : '';
      console.log(`${i},${ts},${m},${cu},${cd},${eps},${src},${h},${l}${mark}`);
    }
  }, 30000);
});
