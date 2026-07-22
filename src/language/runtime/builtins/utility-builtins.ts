import type { ExecutionEngine } from '../execution-engine.js';
import { NA, isNa, type PineValue } from '../../types/na.js';

export function registerUtilityBuiltins(engine: ExecutionEngine): void {
  const eng = engine as any;

  eng.builtins.set('na', (value: PineValue): PineValue => {
    return isNa(value);
  });

  // Type cast builtins
  eng.builtins.set('int', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    if (typeof value === 'number') return Math.trunc(value);
    if (typeof value === 'string') {
      const n = Number(value);
      return isNaN(n) ? NA : Math.trunc(n);
    }
    if (typeof value === 'boolean') return value ? 1 : 0;
    return NA;
  });

  eng.builtins.set('float', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const n = Number(value);
      return isNaN(n) ? NA : n;
    }
    if (typeof value === 'boolean') return value ? 1.0 : 0.0;
    return NA;
  });

  eng.builtins.set('bool', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.length > 0;
    return NA;
  });

  eng.builtins.set('string', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    return String(value);
  });

  eng.builtins.set('nz', (value: PineValue, fallback?: PineValue): PineValue => {
    if (isNa(value)) return fallback !== undefined ? fallback : 0;
    return value;
  });

  eng.builtins.set('request.security', (...args: PineValue[]): PineValue => {
    return args.length > 2 ? args[2]! : NA;
  });
}
