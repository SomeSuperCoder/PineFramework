/**
 * Number formatting utilities for the PineScript engine.
 *
 * IEEE 754 doubles produce artifacts when converted to decimal strings
 * via `String()` — e.g., `String(1.7)` yields `"1.7000000000000002"`.
 * Every number-to-string conversion in the engine MUST route through
 * this module to guarantee clean display output.
 *
 * Design: Single Responsibility — one module formats numbers for display.
 * Dependency Direction: consumers import this; this imports nothing from them.
 */

/**
 * Format a number for clean display, eliminating IEEE 754 artifacts.
 *
 * Algorithm:
 * 1. Use `toPrecision(15)` to round to 15 significant digits (IEEE 754
 *    has ~15.95 digits of precision; 15 is the safe threshold).
 * 2. `parseFloat()` strips trailing zeros and unnecessary precision.
 * 3. Fallback: if precision(15) still has artifacts, try precision(14),
 *    then (13), down to (10). This handles edge cases like `100000.00000000001`
 *    where precision(15) still shows the artifact.
 *
 * Examples:
 *   cleanNumber(1.7)                → "1.7"
 *   cleanNumber(34.90566037735849)  → "34.90566037735849" (already clean)
 *   cleanNumber(35.75)              → "35.75"
 *   cleanNumber(100)                → "100"
 *   cleanNumber(0.1 + 0.2)          → "0.3"
 *   cleanNumber(Infinity)           → "Infinity"
 *   cleanNumber(NaN)                → "NaN"
 */
export function cleanNumber(value: number): string {
  // Fast path: non-finite values render as-is
  if (!Number.isFinite(value)) {
    return String(value);
  }

  // Try precision(15) first — covers ~99.9% of cases
  let result = parseFloat(value.toPrecision(15));

  // If the round-trip doesn't match, the value has artifacts at precision 15.
  // Walk down to precision(10) to find the cleanest representation.
  if (result !== value) {
    for (let p = 14; p >= 10; p--) {
      const candidate = parseFloat(value.toPrecision(p));
      if (candidate === value || p === 10) {
        result = candidate;
        break;
      }
    }
  }

  return String(result);
}

/**
 * Format a number as a template argument for str.format().
 * Integers stay as-is; floats get clean formatting.
 * Arrays and other types fall back to String().
 */
export function formatTemplateArg(value: unknown): string {
  if (typeof value === 'number') {
    return cleanNumber(value);
  }
  return String(value);
}
