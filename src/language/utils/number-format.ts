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
 * Format a number using a PineScript format specifier string.
 *
 * Supported patterns:
 *   "#.##"  — up to 2 decimal places, trailing zeros suppressed
 *   "#.#"   — up to 1 decimal place, trailing zeros suppressed
 *   "#"     — integer, no decimal point
 *   "0.00"  — exactly 2 decimal places, trailing zeros kept
 *   "0"     — exactly 0 decimal places
 *   "+#.#"  — signed, explicit sign prefix
 *   "-#.#"  — signed, explicit sign prefix
 *
 * Rules:
 *   '#' = optional digit (suppress trailing zeros)
 *   '0' = required digit (pad with zeros)
 *   Characters other than #, 0, ., +, - are treated as decoration
 *   (prefix/suffix text), not format specifiers — unsupported.
 *
 * Non-finite values bypass the format and return their String() representation.
 * Unrecognized/empty format falls back to cleanNumber().
 *
 * Examples:
 *   formatNumber(35.51401869, "#.##")  → "35.51"
 *   formatNumber(37.2, "#.#")          → "37.2"
 *   formatNumber(37.9, "#")            → "38"
 *   formatNumber(35.5, "0.00")         → "35.50"
 *   formatNumber(37.2, "+#.#")         → "+37.2"
 *   formatNumber(-5.1, "+#.#")         → "-5.1"
 */
export function formatNumber(value: number, format: string): string {
  // NaN / Infinity — always bypass format, match PineScript behavior
  if (Number.isNaN(value)) return 'NaN';
  if (!Number.isFinite(value)) return String(value);

  // ── Parse the format string ──
  // Expected: [signPrefix][integerPattern][.fractionalPattern][suffix]
  // Allow only valid characters: # 0 . + -
  const CORE_RE = /^[+-]?[0#]+\.?[0#]*$/;
  const match = format.match(CORE_RE);
  if (!match) {
    // Unrecognized format — fall back to cleanNumber (matches constraint 5)
    return cleanNumber(value);
  }

  const token = match[0];
  const hasDot = token.includes('.');

  // Split into sign, integer part, fractional part
  const signChar = token[0] === '+' || token[0] === '-' ? token[0] : null;
  const body = signChar ? token.slice(1) : token;
  const [intPart, fracPart] = hasDot ? body.split('.') : [body, ''];

  // Count required zero digits in integer part
  const intZero = (intPart.match(/0/g) || []).length;
  const fracHash = (fracPart.match(/#/g) || []).length;
  const fracZero = (fracPart.match(/0/g) || []).length;

  // Determine sign of the result (always follows the actual number)
  const isNeg = value < 0;
  const absVal = Math.abs(value);

  // ── Compute integer and fractional parts ──
  let integerPart: string;
  let fractionalPart: string;

  if (!hasDot || (fracHash === 0 && fracZero === 0)) {
    // No fractional digits requested — round to integer
    const rounded = Math.round(absVal);
    integerPart = String(rounded);
    fractionalPart = '';
  } else {
    // Compute fractional precision (highest of # and 0 counts)
    const maxFrac = Math.max(fracHash, fracZero);
    // toFixed rounds half-away-from-zero; toFixed(0) for negative 0 edge case
    const fixed = absVal.toFixed(maxFrac);
    const dotIdx = fixed.indexOf('.');
    integerPart = fixed.slice(0, dotIdx);
    fractionalPart = fixed.slice(dotIdx + 1);
  }

  // ── Apply formatting rules ──
  let result = '';

  // Sign prefix
  if (signChar) {
    // Explicit sign mode: always show sign, negative numbers already have it
    if (!isNeg) result += signChar === '+' ? '+' : '';
  }
  if (isNeg) result += '-';

  // Integer part: pad with zeros if integer part contains '0' chars
  if (intZero > 0) {
    integerPart = integerPart.padStart(intZero, '0');
  }
  result += integerPart;

  // Fractional part
  if (hasDot && (fracHash > 0 || fracZero > 0)) {
    if (fracHash > 0 && fracZero === 0) {
      // Pure '#' mode: keep fractional digits, but strip trailing zeros
      fractionalPart = fractionalPart.replace(/0+$/, '');
    }
    // else: '0' mode or mixed — keep all digits (toFixed already handles padding)

    // Only append the dot + fractional digits if there's something to show
    if (fractionalPart.length > 0) {
      result += '.' + fractionalPart;
    }
  }

  return result;
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
