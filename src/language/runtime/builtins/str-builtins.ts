import type { ExecutionEngine } from '../execution-engine.js';
import { NA, isNa, type PineValue } from '../../types/na.js';

export function registerStrBuiltins(engine: ExecutionEngine): void {
  const eng = engine as any;

  eng.builtins.set('str.format', (template: PineValue, ...args: PineValue[]): PineValue => {
    if (isNa(template)) return NA;
    let result = template as string;
    const strArgs = args.filter((a) => typeof a !== 'object' && typeof a !== 'function');
    for (let i = 0; i < strArgs.length; i++) {
      const arg = isNa(strArgs[i]) ? 'na' : String(strArgs[i]);
      result = result.replace(`{${i}}`, arg);
    }
    return result;
  });

  eng.builtins.set('str.length', (str: PineValue): PineValue => {
    if (isNa(str)) return NA;
    return (str as string).length;
  });

  eng.builtins.set(
    'str.substring',
    (str: PineValue, start: PineValue, length?: PineValue): PineValue => {
      if (isNa(str) || isNa(start)) return NA;
      const s = str as string;
      const st = start as number;
      const len = length === undefined || isNa(length) ? s.length : (length as number);
      return s.substring(st, st + len);
    },
  );

  eng.builtins.set('str.contains', (str: PineValue, substring: PineValue): PineValue => {
    if (isNa(str) || isNa(substring)) return NA;
    return (str as string).includes(substring as string);
  });

  eng.builtins.set(
    'str.replace',
    (str: PineValue, from: PineValue, to: PineValue): PineValue => {
      if (isNa(str) || isNa(from) || isNa(to)) return NA;
      return (str as string).replace(from as string, to as string);
    },
  );

  eng.builtins.set('str.split', (str: PineValue, separator: PineValue): PineValue => {
    if (isNa(str) || isNa(separator)) return NA;
    return (str as string).split(separator as string);
  });

  eng.builtins.set('str.tolower', (str: PineValue): PineValue => {
    if (isNa(str)) return NA;
    return (str as string).toLowerCase();
  });

  eng.builtins.set('str.toupper', (str: PineValue): PineValue => {
    if (isNa(str)) return NA;
    return (str as string).toUpperCase();
  });

  eng.builtins.set('str.trim', (str: PineValue): PineValue => {
    if (isNa(str)) return NA;
    return (str as string).trim();
  });

  eng.builtins.set('str.tonumber', (str: PineValue): PineValue => {
    if (isNa(str)) return NA;
    const num = Number(str as string);
    return Number.isNaN(num) ? NA : num;
  });

  eng.builtins.set('str.tostring', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    return String(value);
  });
}
