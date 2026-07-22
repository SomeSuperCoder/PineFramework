import type { ExecutionEngine } from '../execution-engine.js';
import { type PineValue } from '../../types/na.js';

export function registerArrayBuiltins(engine: ExecutionEngine): void {
  const eng = engine as any;

  eng.builtins.set('array.new_float', (_size: PineValue): PineValue => {
    return [];
  });

  eng.builtins.set('array.new_int', (_size: PineValue): PineValue => {
    return [];
  });

  eng.builtins.set('array.new_line', (_size: PineValue): PineValue => {
    return [];
  });

  // Generic array.new<T>(size) - used as array.new<T>(size)
  eng.builtins.set('array.new', (_size: PineValue): PineValue => {
    return [];
  });

  // array.from(...values) - create array from values
  eng.builtins.set('array.from', (...values: PineValue[]): PineValue => {
    return values;
  });
}
