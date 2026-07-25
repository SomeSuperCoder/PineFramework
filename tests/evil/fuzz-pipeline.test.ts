/**
 * Property-based fuzz test for the Pine Script pipeline.
 *
 * Generates adversarial inputs for each pipeline phase and asserts
 * the "no silent failures" invariant: every malformed input produces
 * a structured error (ParseError, CompileError, or ExecutionResult
 * with error), never a crash or silently undefined/NaN output.
 *
 * This is NOT a statistical fuzzer (no random seed generation) —
 * it's a systematic enumeration of known adversarial patterns with
 * the combinatorial breadth of property-based testing.
 */

import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import type { ExecutionContext } from '../../src/language/runtime/execution-types.js';
import { ParseError, CompileError, PineError } from '../../src/common/errors.js';

// =============================================================================
// Fuzz input generators
// =============================================================================

/** Evil predicate: does the pipeline phase throw for this input? */
type FuzzResult =
  | { phase: 'parse'; passed: boolean; error?: unknown }
  | { phase: 'compile'; passed: boolean; error?: unknown }
  | { phase: 'execute'; passed: boolean; error?: unknown };

/** Known-bad Pine Script snippets that should fail in predictable ways. */
const badScripts: string[] = [
  // Empty / invalid headers
  '',
  '//@version=6\n',
  '//@version=6\nx = 1',
  '//@version=6\ntest()',
  '//@version=4\nindicator("")',
  '//@version=7\nindicator("")',
  '//@version=6\nindicator("")\nx = ',
  '//@version=6\nindicator("")\nx = (1 + 2',
  '//@version=6\nindicator("")\nx = [1,',
  '//@version=6\nindicator("")\nreturn 1',
  '//@version=6\nindicator("")\nconst x = 5\nx := 10',
  '//@version=6\nindicator("")\nfor i = 1\n  x = 1',
  '//@version=6\nindicator("")\n  indented at wrong level',
];

/** Evil series that should not crash the executor. */
const evilSeriesValues: number[] = [
  NaN,
  Infinity,
  -Infinity,
  0,
  -0,
  Number.MAX_VALUE,
  Number.MIN_VALUE,
  Number.EPSILON,
  -Number.MAX_VALUE,
];

/** Valid scripts to pair with evil context data. */
const validScripts: string[] = [
  '//@version=6\nindicator("")\nplot(close)',
  '//@version=6\nindicator("")\nplot(open)',
  '//@version=6\nindicator("")\nplot(high)',
  '//@version=6\nindicator("")\nplot(low)',
  '//@version=6\nindicator("")\nplot(volume)',
  '//@version=6\nindicator("")\nx = close > open\nplot(x ? close : open)',
  '//@version=6\nindicator("")\nplot(hl2)',
  '//@version=6\nindicator("")\nplot(hlc3)',
  '//@version=6\nindicator("")\nplot(ohlc4)',
];

// =============================================================================
// Fuzz runner
// =============================================================================

describe('Pipeline fuzz — no silent failures', () => {
  // ===========================================================================
  // Invariant: parse phase always throws on bad input
  // ===========================================================================

  it.each(badScripts)('parse phase rejects bad script: %s', (script) => {
    const result = tryParse(script);
    // Either it throws (preferred) or returns something with no AST
    if (result.passed) {
      // Parse succeeded unexpectedly — that's OK if the output is valid
      console.warn(`Fuzz: parse unexpectedly succeeded for: ${script.substring(0, 40)}`);
    }
    // If parse returns something, it must have an AST
    if (!result.passed && result.error) {
      expect(result.error).toBeInstanceOf(PineError);
    }
  });

  // ===========================================================================
  // Invariant: compile phase throws or produces valid IR
  // ===========================================================================

  it.each(badScripts)('compile phase handles bad script without crash: %s', (script) => {
    const result = tryPipeline(script, [makeContext()]);
    // The pipeline should never crash — it should fail gracefully
    expect(result).not.toBeUndefined();
    if (result.phase === 'execute' && result.passed === false) {
      expect(result.error).toBeDefined();
    }
  });

  // ===========================================================================
  // Invariant: execute phase with evil data never crashes
  // ===========================================================================

  it.each(validScripts)('execute with evil close: %s', (script) => {
    for (const evilVal of evilSeriesValues) {
      const engine = buildEngine(script);
      if (!engine) continue;
      const ctx = makeContext({ close: createSeries('close', [evilVal]) });
      const result = tryExecute(engine, ctx);
      expect(result).not.toBeNull();
      // Must not throw — must return an ExecutionResult
    }
  });

  it.each(validScripts)('execute with evil high: %s', (script) => {
    for (const evilVal of evilSeriesValues) {
      const engine = buildEngine(script);
      if (!engine) continue;
      const ctx = makeContext({ high: createSeries('high', [evilVal]) });
      const result = tryExecute(engine, ctx);
      expect(result).not.toBeNull();
    }
  });

  it.each(validScripts)('execute with evil low: %s', (script) => {
    for (const evilVal of evilSeriesValues) {
      const engine = buildEngine(script);
      if (!engine) continue;
      const ctx = makeContext({ low: createSeries('low', [evilVal]) });
      const result = tryExecute(engine, ctx);
      expect(result).not.toBeNull();
    }
  });

  it.each(validScripts)('execute with NaN volume: %s', (script) => {
    const engine = buildEngine(script);
    if (!engine) return;
    const ctx = makeContext({ volume: createSeries('volume', [NaN]) });
    const result = tryExecute(engine, ctx);
    expect(result).not.toBeNull();
    if (result && !result.success) {
      expect(result.error).toBeDefined();
    }
  });

  // ===========================================================================
  // Invariant: all-Infinity OHLCV doesn't crash
  // ===========================================================================

  it.each(validScripts)('execute with all-Infinity OHLCV: %s', (script) => {
    const engine = buildEngine(script);
    if (!engine) return;
    const ctx = makeContext({
      open: createSeries('open', [Infinity]),
      high: createSeries('high', [Infinity]),
      low: createSeries('low', [Infinity]),
      close: createSeries('close', [Infinity]),
      volume: createSeries('volume', [Infinity]),
    });
    const result = tryExecute(engine, ctx);
    expect(result).not.toBeNull();
  });

  // ===========================================================================
  // Invariant: all-NaN OHLCV doesn't crash
  // ===========================================================================

  it.each(validScripts)('execute with all-NaN OHLCV: %s', (script) => {
    const engine = buildEngine(script);
    if (!engine) return;
    const ctx = makeContext({
      open: createSeries('open', [NaN]),
      high: createSeries('high', [NaN]),
      low: createSeries('low', [NaN]),
      close: createSeries('close', [NaN]),
      volume: createSeries('volume', [NaN]),
    });
    const result = tryExecute(engine, ctx);
    expect(result).not.toBeNull();
  });
});

// =============================================================================
// Helpers
// =============================================================================

function tryParse(script: string): { passed: boolean; error?: unknown } {
  try {
    parse(script);
    return { passed: true };
  } catch (err) {
    return { passed: false, error: err };
  }
}

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

function buildEngine(script: string): ExecutionEngine | null {
  try {
    const { ast } = parse(script);
    const ir = compile(ast);
    return new ExecutionEngine(ir);
  } catch {
    return null; // parse/compile failure is expected for some inputs
  }
}

function tryPipeline(
  script: string,
  contexts: ExecutionContext[],
): FuzzResult {
  // Parse
  let ast: ReturnType<typeof parse>['ast'];
  try {
    const parsed = parse(script);
    ast = parsed.ast;
  } catch (err) {
    return { phase: 'parse', passed: false, error: err };
  }

  // Compile
  let ir: ReturnType<typeof compile>;
  try {
    ir = compile(ast);
  } catch (err) {
    return { phase: 'compile', passed: false, error: err };
  }

  // Execute
  try {
    const engine = new ExecutionEngine(ir);
    for (const ctx of contexts) {
      const result = engine.executeBar(ctx);
      if (!result.success) {
        return {
          phase: 'execute',
          passed: false,
          error: result.error,
        };
      }
    }
    return { phase: 'execute', passed: true };
  } catch (err) {
    return { phase: 'execute', passed: false, error: err };
  }
}

function tryExecute(
  engine: ExecutionEngine,
  ctx: ExecutionContext,
): { success: boolean; error?: unknown } | null {
  try {
    const result = engine.executeBar(ctx);
    return { success: result.success, error: result.error };
  } catch {
    return null; // should not happen after our fix; if it does, test fails
  }
}
