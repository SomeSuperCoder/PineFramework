import type { ExecutionEngine } from '../execution-engine.js';
import { NA, isNa, type PineValue } from '../../types/na.js';

export function registerTimeBuiltins(engine: ExecutionEngine): void {
  const eng = engine as any;

  eng.builtins.set('time.year', (timestamp: PineValue): PineValue => {
    if (isNa(timestamp)) return NA;
    return new Date(timestamp as number).getFullYear();
  });

  eng.builtins.set('time.month', (timestamp: PineValue): PineValue => {
    if (isNa(timestamp)) return NA;
    return new Date(timestamp as number).getMonth() + 1;
  });

  eng.builtins.set('time.dayofweek', (timestamp: PineValue): PineValue => {
    if (isNa(timestamp)) return NA;
    return new Date(timestamp as number).getDay() + 1;
  });

  eng.builtins.set('time.hour', (timestamp: PineValue): PineValue => {
    if (isNa(timestamp)) return NA;
    return new Date(timestamp as number).getHours();
  });

  eng.builtins.set('time.minute', (timestamp: PineValue): PineValue => {
    if (isNa(timestamp)) return NA;
    return new Date(timestamp as number).getMinutes();
  });

  eng.builtins.set('time.second', (timestamp: PineValue): PineValue => {
    if (isNa(timestamp)) return NA;
    return new Date(timestamp as number).getSeconds();
  });
}
