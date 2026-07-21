import type { ExecutionEngine } from '../execution-engine.js';
import { NA, isNa, type PineValue } from '../../types/na.js';
import { guardFinite, isFiniteNumber } from '../float-guards.js';

/**
 * Numerically stable math.round — handles IEEE 754 binary rounding artifacts.
 * e.g. math.round(1.005, 2) → 1.01 (not 1.00) by shifting borderline cases
 * that fall just below the exact halfway point due to binary representation.
 */
function stableRound(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  // Shift values that are just_under 0.5 ULPs due to binary representation
  const shifted = value * factor;
  const eps = Number.EPSILON * 0.5 * Math.sign(value) || Number.EPSILON * 0.5;
  const result = Math.round(shifted + eps) / factor;
  return result;
}

export function registerMathBuiltins(engine: ExecutionEngine): void {
  const eng = engine as any;

  eng.builtins.set('math.max', (...args: PineValue[]): PineValue => {
    const validArgs = args.filter((a): a is number => !isNa(a) && isFiniteNumber(a));
    return validArgs.length > 0 ? Math.max(...validArgs) : NA;
  });

  eng.builtins.set('math.min', (...args: PineValue[]): PineValue => {
    const validArgs = args.filter((a): a is number => !isNa(a) && isFiniteNumber(a));
    return validArgs.length > 0 ? Math.min(...validArgs) : NA;
  });

  eng.builtins.set('math.abs', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    return guardFinite(Math.abs(value as number));
  });

  eng.builtins.set('math.round', (value: PineValue, precision?: PineValue): PineValue => {
    if (isNa(value)) return NA;
    const p = precision === undefined || isNa(precision) ? 0 : (precision as number);
    return guardFinite(stableRound(value as number, p));
  });

  eng.builtins.set('math.floor', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    const v = value as number;
    return Number.isFinite(v) ? Math.floor(v) : NA;
  });

  eng.builtins.set('math.ceil', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    const v = value as number;
    return Number.isFinite(v) ? Math.ceil(v) : NA;
  });

  eng.builtins.set('math.pow', (base: PineValue, exponent: PineValue): PineValue => {
    if (isNa(base) || isNa(exponent)) return NA;
    return guardFinite(Math.pow(base as number, exponent as number));
  });

  eng.builtins.set('math.sqrt', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    const v = value as number;
    if (v < 0) return NA;
    return Math.sqrt(v);
  });

  eng.builtins.set('math.log', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    const v = value as number;
    if (v <= 0) return NA;
    const r = Math.log(v);
    return Number.isFinite(r) ? r : NA;
  });

  eng.builtins.set('math.log10', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    const v = value as number;
    if (v <= 0) return NA;
    const r = Math.log10(v);
    return Number.isFinite(r) ? r : NA;
  });

  eng.builtins.set('math.exp', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    return guardFinite(Math.exp(value as number));
  });

  eng.builtins.set('math.sin', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    return Math.sin(value as number);
  });

  eng.builtins.set('math.cos', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    return Math.cos(value as number);
  });

  eng.builtins.set('math.tan', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    const v = value as number;
    const r = Math.tan(v);
    return Number.isFinite(r) ? r : NA;
  });

  eng.builtins.set('math.asin', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    // Clamp to [-1, 1] to handle values slightly outside due to IEEE 754
    const v = Math.max(-1, Math.min(1, value as number));
    const r = Math.asin(v);
    return Number.isFinite(r) ? r : NA;
  });

  eng.builtins.set('math.acos', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    // Clamp to [-1, 1] to handle values slightly outside due to IEEE 754
    const v = Math.max(-1, Math.min(1, value as number));
    const r = Math.acos(v);
    return Number.isFinite(r) ? r : NA;
  });

  eng.builtins.set('math.atan', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    return Math.atan(value as number);
  });

  eng.builtins.set('math.atan2', (y: PineValue, x: PineValue): PineValue => {
    if (isNa(y) || isNa(x)) return NA;
    return Math.atan2(y as number, x as number);
  });

  eng.builtins.set('math.sign', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    return Math.sign(value as number);
  });

  eng.builtins.set('math.sum', (...args: PineValue[]): PineValue => {
    const validArgs = args.filter((a): a is number => !isNa(a) && isFiniteNumber(a));
    if (validArgs.length === 0) return NA;
    return validArgs.reduce((sum, val) => sum + val, 0);
  });
}
