/**
 * Matrix builtins for the Pine Script runtime.
 *
 * A matrix is represented as a plain object carrying an `__isMatrix` marker:
 *   { __isMatrix: true, rows, cols, data: PineValue[][] }
 *
 * WHY a marker object instead of a plain 2-D array: the MemberExpression
 * dispatcher in executeCallExpression routes 1-D arrays through
 * executeArrayMethod, whose set/get arity is (index, value). A matrix needs
 * (row, col, value) — passing that through the array path would silently
 * corrupt the structure. The marker lets the dispatcher route matrix method
 * calls (mx.set(r, c, v)) to `matrix.set(mx, r, c, v)` instead.
 *
 * Scope: the subset of the Pine `matrix.*` namespace consumed by the
 * supertrend-3d indicator (new / get / set). Missing members surface as
 * precise "Variable 'matrix.X' is not defined" failures and can be added on
 * demand — no speculative surface.
 */
import type { ExecutionEngine } from '../execution-engine.js';
import { NA, type PineValue } from '../../types/na.js';

export interface PineMatrix {
  __isMatrix: true;
  rows: number;
  cols: number;
  data: PineValue[][];
}

export function isPineMatrix(value: unknown): value is PineMatrix {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).__isMatrix === true
  );
}

export function registerMatrixBuiltins(engine: ExecutionEngine): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eng = engine as any;

  // matrix.new(rows, cols, initial_value)
  eng.builtins.set('matrix.new', (...args: PineValue[]): PineValue => {
    const rows = typeof args[0] === 'number' ? Math.max(1, Math.trunc(args[0] as number)) : 1;
    const cols = typeof args[1] === 'number' ? Math.max(1, Math.trunc(args[1] as number)) : 1;
    const initial = args.length > 2 ? args[2] : NA;
    const data: PineValue[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: PineValue[] = [];
      for (let c = 0; c < cols; c++) row.push(initial);
      data.push(row);
    }
    const matrix: PineMatrix = { __isMatrix: true, rows, cols, data };
    return matrix as unknown as PineValue;
  });

  // matrix.get(mx, row, col)
  eng.builtins.set('matrix.get', (...args: PineValue[]): PineValue => {
    const mx = args[0];
    if (!isPineMatrix(mx)) return NA;
    const row = typeof args[1] === 'number' ? Math.trunc(args[1] as number) : 0;
    const col = typeof args[2] === 'number' ? Math.trunc(args[2] as number) : 0;
    const cell = mx.data[row]?.[col];
    return cell !== undefined ? cell : NA;
  });

  // matrix.set(mx, row, col, value) — mutates in place; returns void (NA)
  eng.builtins.set('matrix.set', (...args: PineValue[]): PineValue => {
    const mx = args[0];
    if (!isPineMatrix(mx)) return NA;
    const row = typeof args[1] === 'number' ? Math.trunc(args[1] as number) : 0;
    const col = typeof args[2] === 'number' ? Math.trunc(args[2] as number) : 0;
    if (mx.data[row] && col >= 0 && col < mx.data[row].length) {
      mx.data[row][col] = args[3] ?? NA;
    }
    return NA;
  });
}
