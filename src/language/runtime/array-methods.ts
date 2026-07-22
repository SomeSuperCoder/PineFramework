/**
 * Array method dispatch for Pine Script runtime.
 * Handles method calls on array values (e.g., myArray.push(5), myArray.size()).
 */
import { NA, type PineValue } from '../types/na.js';

/**
 * Dispatch an array method call.
 * @returns The result value, or undefined if the method is not an array method.
 */
export function executeArrayMethod(
  obj: PineValue[],
  methodName: string,
  args: PineValue[],
): PineValue | undefined {
  switch (methodName) {
    case 'size': return obj.length;
    case 'first': return obj.length > 0 ? obj[0] : NA;
    case 'last': return obj.length > 0 ? obj[obj.length - 1] : NA;
    case 'shift': return obj.shift() ?? NA;
    case 'pop': return obj.pop() ?? NA;
    case 'push': obj.push(args[0] ?? NA); return obj.length;
    case 'unshift': obj.unshift(args[0] ?? NA); return obj.length;
    case 'insert': { const idx = (args[0] as number) ?? 0; obj.splice(idx, 0, args[1] ?? NA); return obj.length; }
    case 'remove': { const ri = (args[0] as number) ?? 0; return obj.splice(ri, 1)[0] ?? NA; }
    case 'contains': return obj.includes(args[0] ?? NA);
    case 'fill': { const fv = args[0] ?? NA; for (let fi = 0; fi < obj.length; fi++) obj[fi] = fv; return obj; }
    case 'set': { const si = (args[0] as number) ?? 0; obj[si] = args[1] ?? NA; return obj; }
    case 'get': { const gi = (args[0] as number) ?? 0; return obj[gi] ?? NA; }
    case 'min': {
      let minVal: number | null = null;
      for (const item of obj) if (typeof item === 'number' && !isNaN(item)) { if (minVal === null || item < minVal) minVal = item; }
      return minVal !== null ? minVal : NA;
    }
    case 'max': {
      let maxVal: number | null = null;
      for (const item of obj) if (typeof item === 'number' && !isNaN(item)) { if (maxVal === null || item > maxVal) maxVal = item; }
      return maxVal !== null ? maxVal : NA;
    }
    case 'avg': {
      let sum = 0; let count = 0;
      for (const item of obj) if (typeof item === 'number' && !isNaN(item)) { sum += item; count++; }
      return count > 0 ? sum / count : NA;
    }
    case 'stdev': {
      const nums = obj.filter((v: any): v is number => typeof v === 'number' && !isNaN(v));
      if (nums.length < 2) return NA;
      const mean = nums.reduce((a: number, b: number) => a + b, 0) / nums.length;
      const variance = nums.reduce((sum: number, v: number) => sum + (v - mean) ** 2, 0) / (nums.length - 1);
      return Math.sqrt(variance);
    }
    case 'indexof': for (let idx = 0; idx < obj.length; idx++) if (obj[idx] === args[0]) return idx; return -1;
    case 'clear': obj.length = 0; return NA;
    case 'percentile_linear_interpolation': {
      const pct = (args[0] as number) ?? 50;
      if (typeof pct !== 'number' || isNaN(pct)) return NA;
      const nums = obj.filter((v: any): v is number => typeof v === 'number' && !isNaN(v) && Number.isFinite(v)).sort((a: number, b: number) => a - b);
      if (nums.length === 0) return NA;
      if (nums.length === 1) return nums[0];
      const rank = (pct / 100) * (nums.length - 1);
      const lower = Math.floor(rank); const upper = Math.ceil(rank);
      if (lower === upper) return nums[lower];
      return nums[lower] + (rank - lower) * (nums[upper] - nums[lower]);
    }
    case 'sort': return obj.sort((a: PineValue, b: PineValue) => (a as number) - (b as number));
    case 'copy': return [...obj];
    default: return undefined; // not an array method
  }
}
