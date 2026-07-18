import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

function loadBars() {
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

describe('Q-Trend change event trace', () => {
  it('lists all change events and the m value before and after', () => {
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

    const mV = getVar('m')!;
    const cuV = getVar('change_up')!;
    const cdV = getVar('change_down')!;
    const epsV = getVar('epsilon')!;
    const srcV = getVar('src')!;
    const hV = getVar('h')!;

    // Find all change events
    console.log('=== ALL CHANGE EVENTS ===');
    console.log('bar,ts_utc,old_m,new_m,epsilon,type,src,m_plus_eps,m_minus_eps,h');
    for (let i = 0; i < bars.length; i++) {
      const type = cuV[i] ? 'UP' : cdV[i] ? 'DOWN' : null;
      if (!type) continue;

      const oldM = i > 0 ? mV[i - 1] : 'NA';
      const newM = mV[i];
      const ts = new Date(bars[i].timestamp).toISOString().replace('T', ' ').substring(0, 16);
      const eps = typeof epsV[i] === 'number' ? epsV[i].toFixed(4) : 'NA';
      const src = typeof srcV[i] === 'number' ? srcV[i].toFixed(4) : 'NA';
      const m = typeof mV[i] === 'number' ? mV[i].toFixed(4) : 'NA';
      const hV2 = typeof hV[i] === 'number' ? hV[i].toFixed(4) : 'NA';

      let oldMStr = typeof oldM === 'number' ? oldM.toFixed(4) : 'NA';
      const mPrev = i > 0 ? mV[i - 1] : null;
      const newMStr = typeof newM === 'number' ? newM.toFixed(4) : 'NA';
      const mPlusEps = typeof mV[i] === 'number' && typeof epsV[i] === 'number' ? (mV[i] + epsV[i]).toFixed(4) : 'NA';
      const mMinusEps = typeof mV[i] === 'number' && typeof epsV[i] === 'number' ? (mV[i] - epsV[i]).toFixed(4) : 'NA';

      console.log(`${i},${ts},${oldMStr},${newMStr},${eps},${type},${src},${mPlusEps},${mMinusEps},${hV2}`);
    }
  }, 30000);
});
