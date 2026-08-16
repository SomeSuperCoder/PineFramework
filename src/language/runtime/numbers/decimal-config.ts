import { Decimal } from 'decimal.js';

// ─────────────────────────────────────────────────────────────────────────────
// Single configuration point for the decimal core (contract §9).
// The configured global Decimal (DP=20, ROUND_HALF_UP) is the single default;
// consumers needing a different precision MUST use Decimal.clone() and never
// mutate the global after configureDecimal() runs (config isolation rule).
// ─────────────────────────────────────────────────────────────────────────────

export const DECIMAL_PRECISION = 20; // significant digits (decimal.js semantics)
export const DECIMAL_ROUNDING = Decimal.ROUND_HALF_UP; // = 4
export const DECIMAL_EPSILON = new Decimal('1e-12'); // isNearZero default

// ⚠️ Trig-derived constants: decimal.js trig is limited to ~15 significant
// digits of accuracy. These are stored at 20 digits but only ~15 are reliable.
// Price/indicator arithmetic (+ - * / mod pow sqrt) is NOT affected.
export const PI = Decimal.acos(-1);
export const E = Decimal.exp(1);

export function configureDecimal(): void {
  Decimal.set({ precision: DECIMAL_PRECISION, rounding: DECIMAL_ROUNDING });
}

// Apply the global config once at module init so DP=20 / ROUND_HALF_UP is
// active for every consumer of the core (and for all spike assertions).
configureDecimal();
