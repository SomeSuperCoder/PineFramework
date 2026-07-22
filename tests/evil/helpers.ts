/**
 * Shared evil-test utilities.
 *
 * Provides factory functions, evil-value collections, and common assertions
 * used across all adversarial test files in tests/evil/.
 *
 * Usage:
 *   import { makeEvilBarContext, compileEvilScript, evilPrices, evilSeries, assertGraceful } from './helpers.js';
 */

import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries, type Series } from '../../src/language/runtime/series.js';
import { NA } from '../../src/language/types/na.js';

// =============================================================================
// Evil value collections
// =============================================================================

/** Array of extreme / non-finite numeric values for adversarial testing. */
export const evilPrices: number[] = [
  0,
  -0,
  Infinity,
  -Infinity,
  NaN,
  Number.MAX_VALUE,
  Number.MIN_VALUE,
  Number.EPSILON,
  Number.MAX_SAFE_INTEGER,
  Number.MIN_SAFE_INTEGER,
  -Number.MAX_VALUE,
  -Number.MAX_SAFE_INTEGER,
];

/** Array of NaN-like or missing values that should all resolve to "not a valid number". */
export const nanVariants: unknown[] = [
  NaN,
  undefined,
  null,
  NA,
  'NaN',
  Infinity,
  -Infinity,
];

// =============================================================================
// Factory: evil bar context
// =============================================================================

/**
 * Create an ExecutionContext for adversarial testing.
 *
 * @param overrides - Override any OHLCV series with Series containing evil values.
 * @param barCount  - Number of bars (default 1). When >1, OHLCV series get `barCount` entries.
 */
export function makeEvilBarContext(
  overrides: Partial<ExecutionContext> & {
    open?: Series;
    high?: Series;
    low?: Series;
    close?: Series;
    volume?: Series;
  } = {},
  barCount = 1,
): ExecutionContext {
  const price = 100;
  const openVals = Array.from({ length: barCount }, (_, i) => price + i);
  const closeVals = Array.from({ length: barCount }, (_, i) => price + i + 2);

  return {
    barIndex: barCount - 1,
    barCount,
    timestamp: Date.now(),
    open: createSeries('open', openVals),
    high: createSeries('high', openVals.map((v) => v + 5)),
    low: createSeries('low', closeVals.map((v) => v - 5)),
    close: createSeries('close', closeVals),
    volume: createSeries('volume', Array.from({ length: barCount }, () => 1000)),
    ...overrides,
  };
}

/**
 * Create an evil context where all OHLCV series contain a specific value.
 */
export function makeConstantEvilContext(
  value: number,
  barCount = 1,
): ExecutionContext {
  return makeEvilBarContext(
    {
      open: createSeries('open', Array(barCount).fill(value)),
      high: createSeries('high', Array(barCount).fill(value)),
      low: createSeries('low', Array(barCount).fill(value)),
      close: createSeries('close', Array(barCount).fill(value)),
      volume: createSeries('volume', Array(barCount).fill(value)),
    },
    barCount,
  );
}

// =============================================================================
// Factory: compile evil script
// =============================================================================

/**
 * Parse and compile a Pine Script source, returning the engine.
 * If compilation fails, the error is caught and re-thrown for the test to assert on.
 * If `expectSuccess` is false, returns the caught error instead.
 */
export function compileEvilScript(
  source: string,
  expectSuccess = true,
): ExecutionEngine | Error {
  try {
    const { ast } = parse(source);
    const result = compile(ast);
    const engine = new ExecutionEngine(result);
    return engine;
  } catch (err) {
    if (expectSuccess) throw err;
    return err as Error;
  }
}

/**
 * Parse, compile, and execute a script over a set of bars.
 * Returns the engine ready for assertions.
 */
export function executeEvilScript(
  source: string,
  bars?: ExecutionContext[],
): ExecutionEngine {
  const engine = compileEvilScript(source) as ExecutionEngine;
  const ctxs = bars ?? [makeEvilBarContext()];
  for (const ctx of ctxs) {
    engine.executeBar(ctx);
  }
  return engine;
}

// =============================================================================
// Factory: evil series
// =============================================================================

/**
 * Create a Series filled with a specific value repeated `length` times.
 */
export function evilSeries(name: string, fill: number, length = 1): Series {
  return createSeries(name, Array(length).fill(fill));
}

/**
 * Create a Series that is completely empty.
 */
export function emptySeries(name: string): Series {
  return createSeries<number>(name);
}

// =============================================================================
// Common assertions
// =============================================================================

/**
 * Assert that executing a function does NOT throw.
 * Use as the first assertion in evil tests — "did not crash" is required before
 * checking specific behavior.
 */
export function assertNoCrash(fn: () => unknown): void {
  expect(fn).not.toThrow();
}

/**
 * Assert that a Pine value is NA (the engine's defensive sentinel).
 */
export function expectNa(value: unknown): void {
  expect(value).toBe(NA);
}

/**
 * Assert that an engine's output plot value is NA.
 * Some runtime paths produce null instead of the NA symbol,
 * so this checks for either NA or null.
 */
export function expectOutputNa(engine: ExecutionEngine, name: string): void {
  const output = engine.getOutput(name);
  expect(output).toBeDefined();
  const val = output!.last();
  expect(val === NA || val === null).toBe(true);
}

/**
 * Assert that an engine's output plot value is a finite number.
 */
export function expectOutputNumber(engine: ExecutionEngine, name: string): void {
  const output = engine.getOutput(name);
  expect(output).toBeDefined();
  const val = output!.last();
  expect(typeof val === 'number' && Number.isFinite(val)).toBe(true);
}
