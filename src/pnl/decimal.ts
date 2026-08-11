/**
 * Decimal-string arithmetic — the ONLY place in `src/pnl` that touches numbers.
 *
 * Money policy: NO IEEE754 floats. All values are passed as `DecimalStr`
 * (scaled decimal strings) and manipulated as integer (BigInt) coefficients
 * with an explicit decimal scale. `0.1 + 0.2 === 0.3` style drift is
 * structurally impossible here.
 *
 * Internal representation: `coefficient × 10^scale` where `coefficient` is a
 * SIGNED BigInt. Addition/subtraction align scales, multiplication adds them,
 * division rounds half-away-from-zero at the requested precision.
 *
 * Not part of the module's public API surface (exported from index.ts, but
 * importable directly by path when a consumer needs exact-value arithmetic).
 */

import type { DecimalStr } from './types.js';

const DECIMAL_RE = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))$/;

interface ScaledValue {
  /** Signed integer coefficient: value = coefficient × 10^scale. */
  coefficient: bigint;
  /** Number of fractional digits (scale). Always ≥ 0. */
  scale: number;
}

/** Parse a decimal string into its signed coefficient + scale. */
function parseDecimal(value: DecimalStr): ScaledValue {
  const m = DECIMAL_RE.exec(value);
  if (!m) {
    throw new Error(`[pnl] invalid decimal string: "${value}"`);
  }
  const negative = m[1] === '-';
  // Case 1: "123" / "123.45" → int=m[2], frac=m[3] (m[3] may be '')
  // Case 2: ".5"              → m[2]=undefined, m[4]='5'
  const intPart = m[2] ?? '';
  const fracPart = m[3] ?? m[4] ?? '';
  if (intPart === '' && fracPart === '') {
    throw new Error(`[pnl/decimal] invalid decimal string: "${value}"`);
  }
  const digits = `${intPart === '' ? '0' : intPart}${fracPart}`;
  const coefficient = BigInt(digits);
  return {
    coefficient: negative ? -coefficient : coefficient,
    scale: fracPart.length,
  };
}

/** 10^exp as a BigInt (exp ≥ 0). */
function pow10(exp: number): bigint {
  return 10n ** BigInt(exp);
}

/**
 * Emit the canonical decimal string for `coefficient × 10^-scale`,
 * stripping any trailing fractional zeros so the string is the shortest
 * exact representation ("2.5000" → "2.5").
 */
function formatDecimal(coefficient: bigint, scale: number): DecimalStr {
  if (coefficient === 0n) return '0';
  let c = coefficient;
  let s = scale;
  while (s > 0 && c % 10n === 0n) {
    c /= 10n;
    s -= 1;
  }
  const negative = c < 0n;
  const abs = negative ? -c : c;
  const body = abs.toString();
  if (s === 0) return `${negative ? '-' : ''}${body}`;
  const intPart = body.length <= s ? '0' : body.slice(0, body.length - s);
  const fracPart = body.slice(-s).padStart(s, '0');
  return `${negative ? '-' : ''}${intPart}.${fracPart}`;
}

/** Align two decimals to a common scale, returning signed integer values. */
function align(a: ScaledValue, b: ScaledValue): { av: bigint; bv: bigint; scale: number } {
  const scale = Math.max(a.scale, b.scale);
  return {
    av: a.coefficient * pow10(scale - a.scale),
    bv: b.coefficient * pow10(scale - b.scale),
    scale,
  };
}

/** Additive identity for every money function. */
export const ZERO: DecimalStr = '0';

/**
 * `a + b` — exact decimal addition.
 * @throws on malformed decimal strings or division by zero (div only).
 */
export function dAdd(a: DecimalStr, b: DecimalStr): DecimalStr {
  const al = align(parseDecimal(a), parseDecimal(b));
  return formatDecimal(al.av + al.bv, al.scale);
}

/** `a - b` — exact decimal subtraction. */
export function dSub(a: DecimalStr, b: DecimalStr): DecimalStr {
  const al = align(parseDecimal(a), parseDecimal(b));
  return formatDecimal(al.av - al.bv, al.scale);
}

/**
 * `a × b` — exact decimal multiplication (scales add, integer coefficient
 * product; no rounding).
 */
export function dMul(a: DecimalStr, b: DecimalStr): DecimalStr {
  const pa = parseDecimal(a);
  const pb = parseDecimal(b);
  return formatDecimal(pa.coefficient * pb.coefficient, pa.scale + pb.scale);
}

/**
 * `a ÷ b` rounded to `precision` fractional digits (half-away-from-zero).
 *
 * Division is only used where a rounding precision is meaningful (atomic →
 * whole-token conversion, bps percentages); fee totals and net PnL use only
 * add/sub/mul so nothing is ever rounded on the money path itself.
 *
 * @param precision number of fractional digits in the quotient (default 18).
 * @throws on b === '0'.
 */
export function dDiv(a: DecimalStr, b: DecimalStr, precision = 18): DecimalStr {
  const pa = parseDecimal(a);
  const pb = parseDecimal(b);
  if (pb.coefficient === 0n) {
    throw new Error(`[pnl/decimal] division by zero: "${a}" / "${b}"`);
  }
  if (precision < 0) {
    throw new Error(`[pnl/decimal] negative div precision: ${precision}`);
  }
  // Exact division: a/b = (ca×10^sb) / (cb×10^sa). To fix the quotient scale
  // at `precision`, multiply the numerator by 10^(sb + precision - sa).
  const shift = pb.scale + precision - pa.scale;
  let numerator = pa.coefficient;
  let denominator = pb.coefficient;
  if (shift >= 0) {
    numerator *= pow10(shift);
  } else {
    denominator *= pow10(-shift);
  }
  const quotient = numerator / denominator; // BigInt division truncates toward zero
  const remainder = numerator % denominator;
  // Round half-away-from-zero: if |remainder| ≥ |denominator|/2 adjust.
  const twiceRemainder = remainder * 2n;
  if (twiceRemainder >= denominator || twiceRemainder <= -denominator) {
    return formatDecimal(quotient + (numerator < 0n ? -1n : 1n), precision);
  }
  return formatDecimal(quotient, precision);
}

/**
 * Compare two decimals: -1 if a<b, 0 if equal, 1 if a>b.
 */
export function dCompare(a: DecimalStr, b: DecimalStr): -1 | 0 | 1 {
  const al = align(parseDecimal(a), parseDecimal(b));
  if (al.av < al.bv) return -1;
  if (al.av > al.bv) return 1;
  return 0;
}

/** True when the decimal string equals zero ("0", "0.0", "-0"…). */
export function isZero(a: DecimalStr): boolean {
  return parseDecimal(a).coefficient === 0n;
}

/**
 * 10^exp as a DecimalStr ("1", "10", "100", …). Used for raw atomic scale
 * conversions (lamports→SOL) without touching a float.
 */
export function tenPow(exp: number): DecimalStr {
  if (exp < 0) throw new Error(`[pnl/decimal] negative exponent: ${exp}`);
  return '1' + '0'.repeat(exp);
}
