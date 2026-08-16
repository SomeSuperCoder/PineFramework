import { Decimal } from 'decimal.js';
import { isNa, NA, type PineValue } from '../../types/na.js';
import { RuntimeError } from '../../../common/errors.js';
import { NUMERIC_ERROR_CODES } from './decimal-guard.js';

// ─────────────────────────────────────────────────────────────────────────────
// The ONLY boundaries between PineValue space and the decimal core (contract
// §4). Every NA mapping, -0 normalization, and Number round-trip happens here.
// The core itself (decimal-ops.ts) never sees PineValue or produces `number`.
//
// PATH NOTE: the contract sketch imports PineValue from '../types/na.js', but
// in this codebase PineValue/NA live at src/language/types/na.ts — hence the
// corrected '../../types/na.js'.
// ─────────────────────────────────────────────────────────────────────────────

/** Inputs accepted by toDecimal: raw numbers, exact strings, or Decimals. */
export type DecimalInput = number | string | Decimal;

/**
 * @pinevalue-boundary — the ONLY way PineValues enter the core.
 * NA/null → NaN Decimal (internal invalid marker, R1/R2); number NaN → NaN;
 * ±Infinity → ±Infinity (transient, R6). Any other PineValue (string, boolean,
 * array, Map) is a type violation → RuntimeError (the only input throw path).
 */
export function pineValueToDecimal(v: PineValue, context = 'value', barIndex?: number): Decimal {
  if (isNa(v) || v === null) return new Decimal(NaN);
  if (typeof v === 'number') return new Decimal(v);
  throw new RuntimeError(
    `${NUMERIC_ERROR_CODES.NON_NUMERIC_INPUT}: Expected numeric value for ${context}, got ${typeof v}`,
    barIndex,
  );
}

/**
 * number | string | Decimal → Decimal.
 * Strings are the preferred literal form for >15 significant digits and decimal
 * literals (bar data often arrives as strings). An invalid string is wrapped
 * into RuntimeError (decimal.js's own throw would leak library internals).
 */
export function toDecimal(
  input: DecimalInput | PineValue,
  context = 'value',
  barIndex?: number,
): Decimal {
  if (input instanceof Decimal) return input;
  if (typeof input === 'number') return new Decimal(input);
  if (typeof input === 'string') {
    try {
      return new Decimal(input);
    } catch {
      throw new RuntimeError(
        `${NUMERIC_ERROR_CODES.NON_NUMERIC_INPUT}: Expected numeric value for ${context}, got string`,
        barIndex,
      );
    }
  }
  if (input === NA || input === null) return new Decimal(NaN);
  throw new RuntimeError(
    `${NUMERIC_ERROR_CODES.NON_NUMERIC_INPUT}: Expected numeric value for ${context}, got ${typeof input}`,
    barIndex,
  );
}

/**
 * @pinevalue-boundary — the ONLY way Decimals exit to PineValue space.
 * finite → number; NaN/±Infinity → NA (R4); -0 → +0 (contract §6).
 *
 * R4 overflow guard: `d.isFinite()` only rejects DECIMAL-level NaN/±Inf.
 * A decimal-FINITE value can still overflow JS Number at toNumber() — e.g.
 * D('1e400') is finite in decimal.js but toNumber() === Infinity. Without the
 * second guard, an Infinity (a number) leaks into PineValue space, violating
 * R4 ("No Infinity can ever reach a PineValue"). Number.isFinite covers BOTH
 * the decimal invalid markers AND the JS Number overflow in one check.
 */
export function decimalToPineValue(d: Decimal): PineValue {
  if (!d.isFinite()) return NA; // decimal NaN/±Inf → NA (R4)
  const n = d.toNumber(); // raw — can be -0 or Infinity (JS overflow)
  if (!Number.isFinite(n)) return NA; // JS Number overflow/NaN → NA (R4)
  return Object.is(n, -0) ? 0 : n; // normalize -0 → +0
}

/**
 * @renderer-boundary — the ONLY number conversion on the display path (§8).
 * d.toNumber(), -0 normalized to +0 (canvas is sign-of-zero indifferent).
 * Visible values stay Decimal until this final pixel conversion.
 *
 * R6 overflow guard: same decimal-finite→JS-overflow case as decimalToPineValue.
 * NA is a PineValue, not a number, so the renderer boundary collapses non-finite
 * to NaN — the core's internal invalid marker (R2) — and the renderer skips NaN
 * plots. Returning 0 would silently draw a zero where no value exists.
 */
export function toCanvasFloat(d: Decimal): number {
  const n = d.toNumber();
  if (!Number.isFinite(n)) return NaN; // JS Number overflow/NaN → invalid marker (R6)
  return Object.is(n, -0) ? 0 : n;
}

/**
 * Display-only string production — NEVER via Number (§7).
 * `dp` provided → d.toFixed(dp) (half-up per config); no `dp` → d.toString()
 * (shortest exact representation — "0.3", never "0.30000000000000004").
 */
export function decimalToString(d: Decimal, dp?: number): string {
  return dp !== undefined ? d.toFixed(dp) : d.toString();
}

/**
 * Raw Number conversion — can yield NaN/Infinity/-0. Used ONLY by the two
 * boundary functions (decimalToPineValue, toCanvasFloat); never for display.
 */
export function toNumber(d: Decimal): number {
  return d.toNumber();
}

/** Internal invalid marker (R2): a Decimal NaN. */
export function isNaDecimal(d: Decimal): boolean {
  return d.isNaN();
}
