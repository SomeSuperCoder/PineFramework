/**
 * IEEE 754 floating-point guard utilities.
 *
 * JavaScript's IEEE 754 arithmetic produces NaN and Infinity values that are
 * typed as `number` and silently corrupt all downstream calculations:
 *   NaN + 5 → NaN
 *   NaN > 0 → false
 *   NaN === NaN → false
 *
 * Pine Script has its own NA sentinel (Symbol.for('pine.na')) which IS checked
 * by isNa().  These bridge functions convert IEEE 754 non-finite values to
 * Pine NA so the existing guard chain catches them.
 *
 * Since the decimal migration (contract §2.2) the safe* arithmetic bodies
 * delegate to the decimal core in ./numbers/index.js — toDecimal → numericOps
 * → decimalToPineValue — keeping the observable `number | NA` contract
 * byte-identical. The float-level helpers below remain for non-arithmetic
 * callers (expression-executor, statement-executor, ta-*).
 *
 * Use in expression-executor, math builtins, and any arithmetic path where
 * NaN/Infinity from IEEE 754 operations could propagate unchecked.
 */

import { NA, type PineValue } from '../types/na.js';
import { RuntimeError } from '../../common/errors.js';
import { toDecimal, decimalToPineValue, numericOps } from './numbers/index.js';

/**
 * Pass through finite numbers; convert NaN/Infinity/-Infinity to Pine NA.
 */
export function guardFinite(val: number): PineValue {
  return Number.isFinite(val) ? val : NA;
}

/**
 * Safe arithmetic — pre-checks inputs (non-number → NA, never a throw; the
 * decimal core would RuntimeError on a non-number PineValue), then delegates
 * through the decimal core (toDecimal → numericOps → decimalToPineValue).
 */

export function safeAdd(a: number, b: number): PineValue {
  if (typeof a !== 'number' || typeof b !== 'number') return NA;
  return decimalToPineValue(numericOps.add(toDecimal(a), toDecimal(b)));
}

export function safeSub(a: number, b: number): PineValue {
  if (typeof a !== 'number' || typeof b !== 'number') return NA;
  return decimalToPineValue(numericOps.sub(toDecimal(a), toDecimal(b)));
}

export function safeMul(a: number, b: number): PineValue {
  if (typeof a !== 'number' || typeof b !== 'number') return NA;
  return decimalToPineValue(numericOps.mul(toDecimal(a), toDecimal(b)));
}

export function safeDiv(a: number, b: number): PineValue {
  if (typeof a !== 'number' || typeof b !== 'number') return NA;
  if (b === 0 || !Number.isFinite(b)) return NA;
  return decimalToPineValue(numericOps.div(toDecimal(a), toDecimal(b)));
}

/**
 * Type guard: true only for finite numbers.
 * Rejects NaN, Infinity, -Infinity, and non-number types.
 */
export function isFiniteNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val);
}

/**
 * Assert that a value is a finite number.
 * Throws RuntimeError if the value is NaN, Infinity, -Infinity, or not a number.
 * Use in non-arithmetic contexts where non-finite values should not propagate silently.
 *
 * @param val - The value to check
 * @param context - Descriptive label for the error message (e.g., "series index", "OHLC push")
 * @param barIndex - Optional bar index for error context
 */
export function ensureFinite(
  val: unknown,
  context: string,
  barIndex?: number,
): asserts val is number {
  if (typeof val !== 'number') {
    throw new RuntimeError(`Expected finite number for ${context}, got ${typeof val}`, barIndex);
  }
  if (!Number.isFinite(val)) {
    throw new RuntimeError(`Non-finite value for ${context}: ${val}`, barIndex);
  }
}

/**
 * Check if a numeric value is effectively zero within an epsilon tolerance.
 * Useful for division guards where IEEE 754 rounding may produce tiny non-zero values.
 */
export function isNearZero(val: number, epsilon: number = 1e-10): boolean {
  return Math.abs(val) < epsilon;
}

/**
 * Epsilon-aware float equality comparison.
 */
export function isNearlyEqual(a: number, b: number, epsilon: number = 1e-10): boolean {
  return Math.abs(a - b) < epsilon;
}

// Legacy float summation — kept for ieee754-arithmetic.test.ts; retired when
// that test is migrated (contract §5.2).
// ---- Compensated summation ----

/**
 * Kahan summation accumulator — reduces floating-point error from O(N) to O(1).
 *
 * Usage:
 *   let acc = { sum: 0, comp: 0 };
 *   kahanAdd(acc, 1.005);
 *   kahanAdd(acc, 2.01);
 */
export interface KahanAccumulator {
  sum: number;
  comp: number;
}

/**
 * Add a value to a Kahan summation accumulator.
 */
export function kahanAdd(acc: KahanAccumulator, value: number): void {
  const y = value - acc.comp;
  const t = acc.sum + y;
  acc.comp = t - acc.sum - y;
  acc.sum = t;
}

/**
 * Create a fresh Kahan accumulator initialised to zero.
 */
export function kahanZero(): KahanAccumulator {
  return { sum: 0, comp: 0 };
}

/**
 * Convenience: finalise a Kahan accumulator into a single number.
 */
export function kahanValue(acc: KahanAccumulator): number {
  return acc.sum;
}
