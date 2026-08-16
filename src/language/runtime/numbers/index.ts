// Decimal-safe numeric core — public surface (contract §1).
// Exports EXACTLY what the contract lists: numericOps, NumericOps, DecimalInput,
// toDecimal, toNumber, decimalToPineValue, pineValueToDecimal, decimalToString,
// toCanvasFloat, guardFiniteDecimal, ensureFiniteDecimal, and the DECIMAL_*
// constants. Internal helpers (isNaDecimal, NUMERIC_ERROR_CODES, PI/E,
// configureDecimal) remain importable from their files but are NOT re-exported
// here — keeping the barrel surface intentionally narrow.
export { numericOps } from './decimal-ops.js';
export type { NumericOps } from './decimal-ops.js';
export type { DecimalInput } from './decimal-convert.js';
export {
  toDecimal,
  toNumber,
  decimalToPineValue,
  pineValueToDecimal,
  decimalToString,
  toCanvasFloat,
} from './decimal-convert.js';
export { guardFiniteDecimal, ensureFiniteDecimal } from './decimal-guard.js';
export { DECIMAL_PRECISION, DECIMAL_ROUNDING, DECIMAL_EPSILON } from './decimal-config.js';
