/**
 * Evil tests: Runtime / Interpreter
 *
 * Adversarial inputs designed to test the execution engine's handling of
 * NaN, Infinity, extreme numeric values, empty series, and out-of-bounds
 * access. Verifies graceful handling (NA returns) rather than crashing.
 */

import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import { NA } from '../../src/language/types/na.js';
import { makeEvilBarContext, expectNa, expectOutputNa, emptySeries } from './helpers.js';

/** Helper: compile a script and execute it over one bar, return the engine. */
function singleBarEngine(source: string): ExecutionEngine {
  const { ast } = parse(source);
  const result = compile(ast);
  const engine = new ExecutionEngine(result);
  engine.executeBar(makeEvilBarContext());
  return engine;
}

/** Helper: get a named output's last value. */
function lastOutput(engine: ExecutionEngine, name: string): unknown {
  const out = engine.getOutput(name);
  return out?.last();
}

describe('Evil runtime — division by zero', () => {
  it('returns NA for x = 1 / 0', () => {
    const engine = singleBarEngine(`
      //@version=6
      indicator("Test")
      x = 1 / 0
      plot(x, "x")
    `);
    expectOutputNa(engine, 'x');
  });

  it('returns NA for x = 0 / 0', () => {
    const engine = singleBarEngine(`
      //@version=6
      indicator("Test")
      x = 0 / 0
      plot(x, "x")
    `);
    expectOutputNa(engine, 'x');
  });
});

describe('Evil runtime — NaN propagation', () => {
  it('returns NA for x = na + 5', () => {
    const engine = singleBarEngine(`
      //@version=6
      indicator("Test")
      x = na + 5
      plot(x, "x")
    `);
    expectOutputNa(engine, 'x');
  });

  it('returns NA for x = na + 5', () => {
    const engine = singleBarEngine(`
      //@version=6
      indicator("Test")
      x = na + 5
      plot(x, "x")
    `);
    expectOutputNa(engine, 'x');
  });
});

describe('Evil runtime — Infinity handling', () => {
  it('handles 1e300 * 1e300 (Infinity overflow) without crash', () => {
    const engine = singleBarEngine(`
      //@version=6
      indicator("Test")
      x = 1e300 * 1e300
      plot(x, "x")
    `);
    // The return may be NA, null, or raw Infinity — the key is no crash
    expect(() => lastOutput(engine, 'x')).not.toThrow();
  });
});

describe('Evil runtime — comparison with NA', () => {
  it('na > 0 does not crash — result is false or null', () => {
    const engine = singleBarEngine(`
      //@version=6
      indicator("Test")
      x = na > 0
      plot(x, "x")
    `);
    const val = lastOutput(engine, 'x');
    // The engine may return false, null, or NA — the key is no crash
    expect(val === false || val === null || val === NA).toBe(true);
  });

  it('na == 0 does not crash — result is false or null', () => {
    const engine = singleBarEngine(`
      //@version=6
      indicator("Test")
      x = na == 0
      plot(x, "x")
    `);
    const val = lastOutput(engine, 'x');
    expect(val === false || val === null || val === NA).toBe(true);
  });
});

describe('Evil runtime — empty series', () => {
  it('getRelative(0) on empty series returns NA', () => {
    const s = emptySeries('test');
    expect(s.getRelative(0)).toBe(NA);
  });

  it('last() on empty series returns NA', () => {
    const s = emptySeries('test');
    expect(s.last()).toBe(NA);
  });

  it('executeBar with all-empty OHLCV series completes without crash', () => {
    const source = `//@version=6
indicator("Test")
x = close
plot(x, "x")
`;
    const { ast } = parse(source);
    const result = compile(ast);
    const engine = new ExecutionEngine(result);

    const emptyCtx = makeEvilBarContext({
      open: emptySeries('open'),
      high: emptySeries('high'),
      low: emptySeries('low'),
      close: emptySeries('close'),
      volume: emptySeries('volume'),
    });

    // Must not throw
    expect(() => engine.executeBar(emptyCtx)).not.toThrow();
  });
});

describe('Evil runtime — extreme numeric values', () => {
  it('handles extreme number overflow in arithmetic without throwing', () => {
    const engine = singleBarEngine(`
      //@version=6
      indicator("Test")
      x = 1e300 * 1e300
      plot(x, "x")
    `);
    expect(() => lastOutput(engine, 'x')).not.toThrow();
  });

  it('handles Number.MIN_VALUE in division without crashing', () => {
    const engine = singleBarEngine(`
      //@version=6
      indicator("Test")
      x = 1 / 5e-324
      plot(x, "x")
    `);
    expect(() => lastOutput(engine, 'x')).not.toThrow();
  });
});

describe('Evil runtime — out-of-bounds series access', () => {
  it('lookback beyond available bars returns NA', () => {
    // Access close[100] with only 1 bar of data
    const source = `//@version=6
indicator("Test")
x = close[100]
plot(x, "x")
`;
    const engine = singleBarEngine(source);
    expectOutputNa(engine, 'x');
  });

  it('get(-1) on series returns NA', () => {
    const s = createSeries('test', [10, 20, 30]);
    expect(s.get(-1)).toBe(NA);
  });

  it('get(9999) on 10-element series returns NA', () => {
    const s = createSeries('test', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(s.get(9999)).toBe(NA);
  });
});
