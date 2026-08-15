import type { ExecutionEngine } from '../execution-engine.js';
import { type PineValue, NA } from '../../types/na.js';

export function registerArrayBuiltins(engine: ExecutionEngine): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // array.max(array) - max numeric value. Mirrors executeArrayMethod's tolerant
  // 'max' semantics (ignores non-number/NaN entries, returns NA when no usable
  // value): arrays built by sparse set() contain holes, and a throw here would
  // break scripts that guard with `max_bin > 0` afterward.
  eng.builtins.set('array.max', (arr: PineValue): PineValue => {
    if (!Array.isArray(arr)) return NA;
    let maxVal: number | null = null;
    for (const item of arr) {
      if (typeof item === 'number' && !isNaN(item)) {
        if (maxVal === null || item > maxVal) maxVal = item;
      }
    }
    return maxVal !== null ? maxVal : NA;
  });
}
