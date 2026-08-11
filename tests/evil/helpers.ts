/**
 * Shared evil-test utilities.
 *
 * Provides factory functions, evil-value collections, and common assertions
 * used across all adversarial test files in tests/evil/.
 *
 * Usage:
 *   import { makeEvilBarContext, emptySeries, expectOutputNa } from './helpers.js';
 */

import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries, type Series } from '../../src/language/runtime/series.js';
import { NA } from '../../src/language/types/na.js';

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
    high: createSeries(
      'high',
      openVals.map((v) => v + 5),
    ),
    low: createSeries(
      'low',
      closeVals.map((v) => v - 5),
    ),
    close: createSeries('close', closeVals),
    volume: createSeries(
      'volume',
      Array.from({ length: barCount }, () => 1000),
    ),
    ...overrides,
  };
}

/**
 * Create an evil context where all OHLCV series contain a specific value.
 */
export function makeConstantEvilContext(value: number, barCount = 1): ExecutionContext {
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
// Factory: evil series
// =============================================================================

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
