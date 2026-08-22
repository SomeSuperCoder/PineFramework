// Decimal-safe numeric core — public surface (contract §1).
// Exports: numericOps, toDecimal, toNumber, decimalToPineValue,
// pineValueToDecimal, decimalToString, toCanvasFloat, guardFiniteDecimal,
// ensureFiniteDecimal, and the DECIMAL_* constants. Type surfaces (NumericOps,
// DecimalInput) and internal helpers are imported from their source files
// directly — the barrel stays intentionally narrow.
export { numericOps } from './decimal-ops.js';
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
