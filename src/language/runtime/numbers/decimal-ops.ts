import { Decimal } from 'decimal.js';
import { DECIMAL_EPSILON } from './decimal-config.js';

// ─────────────────────────────────────────────────────────────────────────────
// The one numeric engine (contract §2.1). Pure Decimal → Decimal; TOTAL — it
// never throws on NaN/Infinity (R3). Invalid states are represented as Decimal
// NaN / ±Infinity and collapse to PineValue NA only at the boundary
// (decimal-convert.ts). Boundary concerns (NA mapping, -0 normalization,
// Number round-trips) deliberately do NOT live here.
// ─────────────────────────────────────────────────────────────────────────────

export interface NumericOps {
  // ── binary arithmetic (exact decimal semantics, configured precision/rounding) ──
  add(a: Decimal, b: Decimal): Decimal; // d.plus
  sub(a: Decimal, b: Decimal): Decimal; // d.minus
  mul(a: Decimal, b: Decimal): Decimal; // d.times
  div(a: Decimal, b: Decimal): Decimal; // div-by-zero → NaN (Pine na semantics, R5)
  mod(a: Decimal, b: Decimal): Decimal; // mod-by-zero → NaN
  pow(a: Decimal, b: Decimal): Decimal; // exponent may be Decimal

  // ── unary ──
  abs(a: Decimal): Decimal; // d.abs
  sqrt(a: Decimal): Decimal; // sqrt(negative) → NaN
  floor(a: Decimal): Decimal; // d.floor
  ceil(a: Decimal): Decimal; // d.ceil
  round(a: Decimal, dp?: number): Decimal; // toDecimalPlaces(dp ?? 0) — half-up per config
  trunc(a: Decimal): Decimal; // d.trunc
  neg(a: Decimal): Decimal; // d.negated

  // ── aggregation (replaces Kahan) ──
  min(...values: Decimal[]): Decimal; // Decimal.min(...values)
  max(...values: Decimal[]): Decimal; // Decimal.max(...values)
  sum(values: Iterable<Decimal>): Decimal; // exact accumulation

  // ── predicates / comparison — ALWAYS return plain JS primitives, never Decimal ──
  sign(a: Decimal): -1 | 0 | 1; // includes signed-zero sign: sign(-0) = -1
  compare(a: Decimal, b: Decimal): -1 | 0 | 1; // exact decimal comparison
  equals(a: Decimal, b: Decimal): boolean; // exact decimal equality
  isZero(a: Decimal): boolean; // d.isZero
  isNearZero(a: Decimal, epsilon?: Decimal): boolean; // abs(a).lte(epsilon ?? DECIMAL_EPSILON)
  isNaN(a: Decimal): boolean; // the internal invalid marker
  isFinite(a: Decimal): boolean; // d.isFinite
  isNegative(a: Decimal): boolean; // d.isNeg — true for -0 as well
}

/**
 * Narrow decimal.js `cmp` (typed `number`) to the contract's `-1 | 0 | 1`.
 * decimal.js guarantees the result is exactly one of -1/0/1; the narrowing is
 * purely for the public type surface.
 */
function cmpToSign(cmp: number): -1 | 0 | 1 {
  return cmp < 0 ? -1 : cmp > 0 ? 1 : 0;
}

export const numericOps: NumericOps = {
  add: (a, b) => a.plus(b),
  sub: (a, b) => a.minus(b),
  mul: (a, b) => a.times(b),
  // R5: division by zero → NaN, NOT Infinity. decimal.js natively yields
  // ±Infinity for a nonzero dividend; Pine treats x/0 as na. Normalize here;
  // NaN → NA happens only at the boundary.
  div: (a, b) => (b.isZero() ? new Decimal(NaN) : a.div(b)),
  // R5: mod-by-zero → NaN (same rationale as div).
  mod: (a, b) => (b.isZero() ? new Decimal(NaN) : a.mod(b)),
  // Overflow → ±Infinity (R6 — transient; the boundary collapses it).
  pow: (a, b) => a.pow(b),
  abs: (a) => a.abs(),
  // sqrt(negative) → NaN natively (R2 propagation).
  sqrt: (a) => a.sqrt(),
  floor: (a) => a.floor(),
  ceil: (a) => a.ceil(),
  round: (a, dp) => a.toDecimalPlaces(dp ?? 0),
  trunc: (a) => a.trunc(),
  neg: (a) => a.negated(),
  min: (...values) => Decimal.min(...values),
  max: (...values) => Decimal.max(...values),
  // Exact accumulation. Deliberately NOT Decimal.sum(...spread): spreading a
  // 100k-element series (the T3 contract case) risks the engine's argument
  // limit; a loop is equally exact (each plus is exact at DP=20) and unbounded.
  sum: (values) => {
    let acc = new Decimal(0);
    for (const v of values) acc = acc.plus(v);
    return acc;
  },
  // decimal.js 10.x removed the instance sign() method (the breaking major the
  // version pin protects against), so sign is derived from isNeg/isZero.
  // isNeg() is true for -0 — that is how signed-zero sign survives.
  sign: (a) => (a.isNaN() ? 0 : a.isNeg() ? -1 : a.isZero() ? 0 : 1),
  compare: (a, b) => cmpToSign(a.cmp(b)),
  equals: (a, b) => a.eq(b),
  isZero: (a) => a.isZero(),
  // NOTE on `epsilon ?? DECIMAL_EPSILON`: this is nullish handling of the
  // optional `epsilon: Decimal | undefined` parameter — NOT Decimal truthiness
  // (a Decimal is never nullish). Contract §6's ban targets truthiness
  // fallbacks; this is the contract's own §2.1 form.
  isNearZero: (a, epsilon) => a.abs().lte(epsilon ?? DECIMAL_EPSILON),
  isNaN: (a) => a.isNaN(),
  isFinite: (a) => a.isFinite(),
  isNegative: (a) => a.isNeg(),
};
