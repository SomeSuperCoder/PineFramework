import type { ExecutionEngine } from '../execution-engine.js';
import { NA, isNa, type PineValue } from '../../types/na.js';

export function registerMathBuiltins(engine: ExecutionEngine): void {
  const eng = engine as any;

  eng.builtins.set('math.max', (...args: PineValue[]): PineValue => {
    const validArgs = args.filter((a) => !isNa(a) && typeof a === 'number') as number[];
    return validArgs.length > 0 ? Math.max(...validArgs) : NA;
  });

  eng.builtins.set('math.min', (...args: PineValue[]): PineValue => {
    const validArgs = args.filter((a) => !isNa(a) && typeof a === 'number') as number[];
    return validArgs.length > 0 ? Math.min(...validArgs) : NA;
  });

  eng.builtins.set('math.abs', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    return Math.abs(value as number);
  });

  eng.builtins.set('math.round', (value: PineValue, precision?: PineValue): PineValue => {
    if (isNa(value)) return NA;
    const p = precision === undefined || isNa(precision) ? 0 : (precision as number);
    const factor = Math.pow(10, p);
    return Math.round((value as number) * factor) / factor;
  });

  eng.builtins.set('math.floor', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    return Math.floor(value as number);
  });

  eng.builtins.set('math.ceil', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    return Math.ceil(value as number);
  });

  eng.builtins.set('math.pow', (base: PineValue, exponent: PineValue): PineValue => {
    if (isNa(base) || isNa(exponent)) return NA;
    return Math.pow(base as number, exponent as number);
  });

  eng.builtins.set('math.sqrt', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    return Math.sqrt(value as number);
  });

  eng.builtins.set('math.log', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    return Math.log(value as number);
  });

  eng.builtins.set('math.log10', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    return Math.log10(value as number);
  });

  eng.builtins.set('math.exp', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    return Math.exp(value as number);
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
    return Math.tan(value as number);
  });

  eng.builtins.set('math.asin', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    return Math.asin(value as number);
  });

  eng.builtins.set('math.acos', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    return Math.acos(value as number);
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
    const validArgs = args.filter((a) => !isNa(a)) as number[];
    return validArgs.reduce((sum, val) => sum + val, 0);
  });
}
