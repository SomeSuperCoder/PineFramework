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

describe('Q-Trend debug trace bar 199-205', () => {
  it('traces m, m[1], change_up, change_down at warmup transition', () => {
    const bars = loadBars();
    const source = fs.readFileSync('./test_indicators/q-trend.pine', 'utf-8');
    const { ast } = parse(source);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);

    // Monkey-patch executeTernaryExpression to trace m's ternary
    const interpreter = (engine as any).interpreter;
    const origExecuteTernary = interpreter.executeTernaryExpression.bind(interpreter);
    interpreter.executeTernaryExpression = (expr: any, scope: any, context: any) => {
      // Find if this ternary involves m by checking the parent assignment
      const result = origExecuteTernary(expr, scope, context);

      // Check if this ternary is part of m assignment by looking at the call site
      // We'll just log bars 199-205 specifically
      if (context.barIndex >= 199 && context.barIndex <= 205) {
        try {
          const mVal = (engine as any).globalScope.variables.get('m')?.series.getRelative(0);
          const m1Val = (engine as any).globalScope.variables.get('m')?.series.getRelative(1);
          const cu = (engine as any).globalScope.variables.get('change_up')?.series.getRelative(0);
          const cd = (engine as any).globalScope.variables
            .get('change_down')
            ?.series.getRelative(0);
          const hVal = (engine as any).globalScope.variables.get('h')?.series.getRelative(0);
          const lVal = (engine as any).globalScope.variables.get('l')?.series.getRelative(0);
          const srcVal = (engine as any).globalScope.variables.get('src')?.series.getRelative(0);
          const epsVal = (engine as any).globalScope.variables
            .get('epsilon')
            ?.series.getRelative(0);

          console.log(
            `Bar ${context.barIndex}: m=${mVal}, m[1]=${m1Val}, h=${hVal}, l=${lVal}, src=${srcVal}, eps=${epsVal}, cu=${cu}, cd=${cd}, result=${result}`,
          );
        } catch (e) {}
      }
      return result;
    };

    const contexts: ExecutionContext[] = bars.map((bar, i) => ({
      barIndex: i,
      barCount: bars.length,
      timestamp: bar.timestamp,
      open: createSeries(
        'open',
        bars.slice(0, i + 1).map((b) => b.open),
      ),
      high: createSeries(
        'high',
        bars.slice(0, i + 1).map((b) => b.high),
      ),
      low: createSeries(
        'low',
        bars.slice(0, i + 1).map((b) => b.low),
      ),
      close: createSeries(
        'close',
        bars.slice(0, i + 1).map((b) => b.close),
      ),
      volume: createSeries(
        'volume',
        bars.slice(0, i + 1).map((b) => b.volume),
      ),
    }));

    engine.executeBars(contexts);

    const getVar = (name: string): any[] | null => {
      const b = (engine as any).globalScope.variables.get(name);
      return b ? b.series.values : null;
    };

    // Print final values
    const mV = getVar('m')!;
    const hV = getVar('h')!;
    const lV = getVar('l')!;

    console.log('\n=== Final values at bars 199-205 ===');
    for (let i = 199; i <= 205 && i < bars.length; i++) {
      const fmt = (v: unknown) => (typeof v === 'symbol' ? 'NA' : v);
      console.log(
        `Bar ${i}: h=${fmt(hV[i])}, l=${fmt(lV[i])}, m=${fmt(mV[i])}, m_prev=${i > 0 ? fmt(mV[i - 1]) : 'NA'}`,
      );
    }
  }, 30000);
});
