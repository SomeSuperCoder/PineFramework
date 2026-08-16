import type { ExecutionEngine } from '../execution-engine.js';
import { NA, isNa, type PineValue } from '../../types/na.js';
import { isFiniteNumber } from '../float-guards.js';
import { toDecimal, decimalToPineValue, numericOps } from '../numbers/index.js';

/**
 * Math builtins (decimal migration, contract §2.2/§4).
 *
 * The 10 existing-op builtins (max/min/abs/round/floor/ceil/pow/sqrt/sign/sum)
 * are boundary adapters: convert ONCE at the boundary — toDecimal → numericOps
 * → decimalToPineValue — never a JS number round-trip inside a builtin, no
 * Decimal ever escapes PineValue space. NA/finite-filter semantics are
 * preserved from the legacy float implementation; the only intentional change
 * is exactness (decimal.js half-up replaces the IEEE-754 epsilon hack in
 * stableRound, now deleted) and the R4 boundary collapse of non-finite
 * results to NA (e.g. math.sqrt(Infinity), which previously leaked Infinity).
 *
 * math.sign returns numericOps.sign's PRIMITIVE (-1|0|1) directly — predicate
 * ops never exit-convert (contract §2.1).
 */

export function registerMathBuiltins(engine: ExecutionEngine): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eng = engine as any;

  eng.builtins.set('math.max', (...args: PineValue[]): PineValue => {
    // Pre-filter non-finite args exactly as the legacy float impl did; only
    // the survivors cross into decimal space (boundary conversion, §4).
    const validArgs = args.filter((a): a is number => !isNa(a) && isFiniteNumber(a));
    if (validArgs.length === 0) return NA;
    const decimals = validArgs.map((a) => toDecimal(a));
    return decimalToPineValue(numericOps.max(...decimals));
  });

  eng.builtins.set('math.min', (...args: PineValue[]): PineValue => {
    const validArgs = args.filter((a): a is number => !isNa(a) && isFiniteNumber(a));
    if (validArgs.length === 0) return NA;
    const decimals = validArgs.map((a) => toDecimal(a));
    return decimalToPineValue(numericOps.min(...decimals));
  });

  eng.builtins.set('math.abs', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    // guardFinite dropped — the boundary collapses any non-finite abs result
    // to NA (R4), so the explicit guard is redundant.
    return decimalToPineValue(numericOps.abs(toDecimal(value)));
  });

  eng.builtins.set('math.round', (value: PineValue, precision?: PineValue): PineValue => {
    if (isNa(value)) return NA;
    // Guard shape preserved from the legacy impl: undefined/NA precision → 0.
    // Non-finite precision also degrades to 0 inside decimal.js (toDecimalPlaces
    // truncates via ToInt32), matching the old stableRound's garbage-in → integer
    // rounding without the epsilon hack.
    const p = precision === undefined || isNa(precision) ? 0 : (precision as number);
    return decimalToPineValue(numericOps.round(toDecimal(value), p));
  });

  eng.builtins.set('math.floor', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    const v = value as number;
    // Keep the finite guard — non-finite AND non-number inputs → NA, exactly as
    // the legacy Number.isFinite check did.
    if (!Number.isFinite(v)) return NA;
    return decimalToPineValue(numericOps.floor(toDecimal(v)));
  });

  eng.builtins.set('math.ceil', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    const v = value as number;
    if (!Number.isFinite(v)) return NA;
    return decimalToPineValue(numericOps.ceil(toDecimal(v)));
  });

  eng.builtins.set('math.pow', (base: PineValue, exponent: PineValue): PineValue => {
    if (isNa(base) || isNa(exponent)) return NA;
    return decimalToPineValue(numericOps.pow(toDecimal(base), toDecimal(exponent)));
  });

  eng.builtins.set('math.sqrt', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    const v = value as number;
    if (v < 0) return NA;
    // R4 bug-fix: the legacy `Math.sqrt(v)` was UNGUARDED — sqrt(Infinity)
    // leaked Infinity into PineValue space. The decimal boundary collapses any
    // non-finite result (sqrt of Infinity/NaN input) to NA.
    return decimalToPineValue(numericOps.sqrt(toDecimal(v)));
  });

  eng.builtins.set('math.log', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    const v = value as number;
    // Pine domain: log of non-positive → na. Checked on the raw number BEFORE
    // decimal conversion (the op would yield -Infinity/NaN for these, which the
    // boundary would collapse anyway) — the explicit guard preserves the exact
    // observable behavior and skips Decimal work on domain violations.
    if (v <= 0) return NA;
    return decimalToPineValue(numericOps.log(toDecimal(v)));
  });

  eng.builtins.set('math.log10', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    const v = value as number;
    if (v <= 0) return NA;
    return decimalToPineValue(numericOps.log10(toDecimal(v)));
  });

  eng.builtins.set('math.exp', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    // guardFinite dropped — the boundary collapses overflow (exp(1000) →
    // Infinity) to NA, same observable as the old guardFinite(Infinity) = NA.
    return decimalToPineValue(numericOps.exp(toDecimal(value)));
  });

  eng.builtins.set('math.sin', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    // R4 bug-fix: the legacy Math.sin was UNGUARDED — sin(Infinity) leaked NaN
    // into PineValue space (R2 violation). The decimal boundary collapses any
    // non-finite result to NA.
    return decimalToPineValue(numericOps.sin(toDecimal(value)));
  });

  eng.builtins.set('math.cos', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    // R4 bug-fix: same as math.sin — legacy Math.cos was UNGUARDED; the decimal
    // boundary collapses non-finite results to NA.
    return decimalToPineValue(numericOps.cos(toDecimal(value)));
  });

  eng.builtins.set('math.tan', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    // tan(π/2) → huge/Infinity → NA at the boundary — accepted trig ceiling
    // (decimal.js trig accuracy ceiling, decimal-config note).
    return decimalToPineValue(numericOps.tan(toDecimal(value)));
  });

  eng.builtins.set('math.asin', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    // Clamp to [-1, 1] on the raw number BEFORE conversion to handle values
    // slightly outside due to IEEE 754 (decimal.js asin natively NaNs |a| > 1;
    // the clamp preserves the legacy graceful behavior).
    const v = Math.max(-1, Math.min(1, value as number));
    return decimalToPineValue(numericOps.asin(toDecimal(v)));
  });

  eng.builtins.set('math.acos', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    // Clamp to [-1, 1] on the raw number BEFORE conversion (see math.asin).
    const v = Math.max(-1, Math.min(1, value as number));
    return decimalToPineValue(numericOps.acos(toDecimal(v)));
  });

  eng.builtins.set('math.atan', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    return decimalToPineValue(numericOps.atan(toDecimal(value)));
  });

  eng.builtins.set('math.atan2', (y: PineValue, x: PineValue): PineValue => {
    if (isNa(y) || isNa(x)) return NA;
    // Decimal.atan2(y, x) — (0,0) → 0, matches Math.atan2(0,0) = 0 (op note).
    return decimalToPineValue(numericOps.atan2(toDecimal(y), toDecimal(x)));
  });

  eng.builtins.set('math.sign', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    // Predicate op (contract §2.1): numericOps.sign returns a PRIMITIVE
    // (-1|0|1), never a Decimal — so NO decimalToPineValue exit-conversion.
    return numericOps.sign(toDecimal(value));
  });

  eng.builtins.set('math.sum', (...args: PineValue[]): PineValue => {
    // Same NA/finite pre-filter as math.max/min; empty → NA unchanged.
    const validArgs = args.filter((a): a is number => !isNa(a) && isFiniteNumber(a));
    if (validArgs.length === 0) return NA;
    return decimalToPineValue(numericOps.sum(validArgs.map((a) => toDecimal(a))));
  });

  eng.builtins.set('math.avg', (...args: PineValue[]): PineValue => {
    // Arithmetic mean of the arguments; NA/invalid inputs are skipped, matching
    // math.max/min/sum's NA-filtering convention. All-NA → NA.
    const validArgs = args.filter((a): a is number => !isNa(a) && isFiniteNumber(a));
    if (validArgs.length === 0) return NA;
    // Exactness upgrade: the legacy float reduce-then-divide accumulated IEEE
    // drift and rounded per division; numericOps.avg sums exactly at DP=20 then
    // divides once (op note).
    return decimalToPineValue(numericOps.avg(validArgs.map((a) => toDecimal(a))));
  });
}
