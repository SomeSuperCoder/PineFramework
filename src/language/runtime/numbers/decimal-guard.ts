import { Decimal } from 'decimal.js';
import { RuntimeError } from '../../../common/errors.js';

// ─────────────────────────────────────────────────────────────────────────────
// Boundary guards for the decimal core (contract §5).
// Codes are stable and machine-readable; messages are human-readable and may
// change. RuntimeError has no `code` field, so each stable code prefixes the
// human message — that prefix is the machine-readable contract.
// ─────────────────────────────────────────────────────────────────────────────

export const NUMERIC_ERROR_CODES = {
  NON_NUMERIC_INPUT: 'NUMERIC_NON_NUMERIC_INPUT', // type violation at a numeric boundary
  NON_FINITE_VALUE: 'NUMERIC_NON_FINITE_VALUE', // ensureFiniteDecimal invariant failure
} as const;

/**
 * NaN/±Infinity → NaN Decimal (the internal NA marker, R2); finite passes
 * through unchanged. TOTAL — never throws (R3).
 */
export function guardFiniteDecimal(d: Decimal): Decimal {
  return d.isFinite() ? d : new Decimal(NaN);
}

/**
 * Invariant guard: throws RuntimeError unless `d` is a finite Decimal.
 * Used at internal seams where a non-finite value indicates a logic bug,
 * not a Pine `na` (which should have been collapsed at the boundary already).
 */
export function ensureFiniteDecimal(
  d: unknown,
  context: string,
  barIndex?: number,
): asserts d is Decimal {
  if (!(d instanceof Decimal) || !d.isFinite()) {
    const shown = d instanceof Decimal ? d.toString() : String(d);
    throw new RuntimeError(
      `${NUMERIC_ERROR_CODES.NON_FINITE_VALUE}: Non-finite decimal for ${context}: ${shown}`,
      barIndex,
    );
  }
}
