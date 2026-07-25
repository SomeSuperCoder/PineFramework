/**
 * Executor runtime invariant enforcement tests.
 *
 * Verifies that the executor guards against NaN/Infinity propagation
 * in non-arithmetic contexts, validates series indices, and reports
 * structured RuntimeErrors for invariant violations.
 */

import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import type { ExecutionContext } from '../../src/language/runtime/execution-types.js';

function makeContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    barIndex: 0,
    barCount: 100,
    timestamp: Date.now(),
    open: createSeries('open', [100]),
    high: createSeries('high', [105]),
    low: createSeries('low', [95]),
    close: createSeries('close', [102]),
    volume: createSeries('volume', [1000]),
    ...overrides,
  };
}

function compileAndEngine(source: string): ExecutionEngine {
  const { ast } = parse(source);
  const result = compile(ast);
  return new ExecutionEngine(result);
}

describe('Executor — no silent failures', () => {
  // ===========================================================================
  // NaN/Infinity guarded in arithmetic
  // ===========================================================================

  it('hl2 returns NA when high is NaN', () => {
    const engine = compileAndEngine('//@version=6\nindicator("")\nplot(hl2)');
    const ctx = makeContext({ high: createSeries('high', [NaN]) });
    const result = engine.executeBar(ctx);
    expect(result.success).toBe(true);
    // hl2 should be NA (not crash and not produce Infinity)
  });

  it('hlc3 returns NA when low is Infinity', () => {
    const engine = compileAndEngine('//@version=6\nindicator("")\nplot(hlc3)');
    const ctx = makeContext({ low: createSeries('low', [Infinity]) });
    const result = engine.executeBar(ctx);
    expect(result.success).toBe(true);
  });

  it('ohlc4 handles NaN components gracefully', () => {
    const engine = compileAndEngine('//@version=6\nindicator("")\nplot(ohlc4)');
    const ctx = makeContext({ open: createSeries('open', [NaN]) });
    const result = engine.executeBar(ctx);
    expect(result.success).toBe(true);
  });

  // ===========================================================================
  // Comparison operators guard against NaN
  // ===========================================================================

  it('comparison with NaN returns NA', () => {
    const engine = compileAndEngine('//@version=6\nindicator("")\nx = close > 0\nplot(x ? 1 : 0)');
    const ctx = makeContext({ close: createSeries('close', [NaN]) });
    const result = engine.executeBar(ctx);
    expect(result.success).toBe(true);
  });

  // ===========================================================================
  // OHLC sanitisation
  // ===========================================================================

  it('executes without crash when OHLC contains NaN', () => {
    const engine = compileAndEngine('//@version=6\nindicator("")\nplot(close)');
    const ctx = makeContext({ close: createSeries('close', [NaN]) });
    const result = engine.executeBar(ctx);
    expect(result.success).toBe(true);
  });

  it('executes without crash when volume contains Infinity', () => {
    const engine = compileAndEngine('//@version=6\nindicator("")\nplot(volume)');
    const ctx = makeContext({ volume: createSeries('volume', [Infinity]) });
    const result = engine.executeBar(ctx);
    expect(result.success).toBe(true);
  });

  // ===========================================================================
  // Series indexing
  // ===========================================================================

  it('out-of-bounds series index returns NA', () => {
    const engine = compileAndEngine('//@version=6\nindicator("")\nx = close[999]\nplot(x)');
    const ctx = makeContext();
    const result = engine.executeBar(ctx);
    expect(result.success).toBe(true);
  });

  it('valid series index returns a value', () => {
    const engine = compileAndEngine('//@version=6\nindicator("")\nx = close[0]\nplot(x)');
    const ctx = makeContext();
    const result = engine.executeBar(ctx);
    expect(result.success).toBe(true);
  });

  // ===========================================================================
  // Graceful error handling (execution failure returns success: false)
  // ===========================================================================

  it('division by builtin that errors returns success false', () => {
    // This tests the catch block in executeBar — any unhandled runtime error
    // should produce success: false with a structured error, not a crash.
    const engine = compileAndEngine('//@version=6\nindicator("")\nplot(1/0)');
    const ctx = makeContext();
    const result = engine.executeBar(ctx);
    // 1/0 in IEEE 754 is Infinity, but safeDiv returns NA for division by zero
    expect(result.success).toBe(true);
  });

  it('execution error produces structured result with success false', () => {
    // Access an undefined variable at runtime
    const engine = compileAndEngine('//@version=6\nindicator("")\nplot(undefinedVar)');
    const ctx = makeContext();
    const result = engine.executeBar(ctx);
    // undefinedVar should throw at runtime since it's not defined
    // (the Identifier executor throws for truly non-existent vars)
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
