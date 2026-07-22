import type { ExecutionEngine } from '../execution-engine.js';
import { isNa, type PineValue } from '../../types/na.js';

export function registerInputBuiltins(engine: ExecutionEngine): void {
  const eng = engine as any;

  eng.builtins.set(
    'input.int',
    (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
      let defaultVal: PineValue = defaultValOrNamed ?? 0;
      if (
        typeof defaultValOrNamed === 'object' &&
        defaultValOrNamed !== null &&
        !Array.isArray(defaultValOrNamed)
      ) {
        const na = defaultValOrNamed as unknown as Record<string, PineValue>;
        if (na.defval !== undefined) defaultVal = na.defval;
        if (typeof na.title === 'string')
          eng.inputs.set(na.title, { type: 'int', default: defaultVal });
      }
      return isNa(defaultVal) ? 0 : defaultVal;
    },
  );

  eng.builtins.set(
    'input.float',
    (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
      let defaultVal: PineValue = defaultValOrNamed ?? 0;
      if (
        typeof defaultValOrNamed === 'object' &&
        defaultValOrNamed !== null &&
        !Array.isArray(defaultValOrNamed)
      ) {
        const na = defaultValOrNamed as unknown as Record<string, PineValue>;
        if (na.defval !== undefined) defaultVal = na.defval;
        if (typeof na.title === 'string')
          eng.inputs.set(na.title, { type: 'float', default: defaultVal });
      }
      return isNa(defaultVal) ? 0 : defaultVal;
    },
  );

  eng.builtins.set(
    'input.color',
    (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
      let defaultVal: PineValue = defaultValOrNamed ?? '#2196f3';
      if (
        typeof defaultValOrNamed === 'object' &&
        defaultValOrNamed !== null &&
        !Array.isArray(defaultValOrNamed)
      ) {
        const na = defaultValOrNamed as unknown as Record<string, PineValue>;
        if (na.defval !== undefined) defaultVal = na.defval;
      }
      return isNa(defaultVal) ? '#2196f3' : defaultVal;
    },
  );

  eng.builtins.set(
    'input.bool',
    (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
      let defaultVal: PineValue = defaultValOrNamed ?? false;
      if (
        typeof defaultValOrNamed === 'object' &&
        defaultValOrNamed !== null &&
        !Array.isArray(defaultValOrNamed)
      ) {
        const na = defaultValOrNamed as unknown as Record<string, PineValue>;
        if (na.defval !== undefined) defaultVal = na.defval;
      }
      return isNa(defaultVal) ? false : defaultVal;
    },
  );

  eng.builtins.set(
    'input.string',
    (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
      let defaultVal: PineValue = defaultValOrNamed ?? '';
      if (
        typeof defaultValOrNamed === 'object' &&
        defaultValOrNamed !== null &&
        !Array.isArray(defaultValOrNamed)
      ) {
        const na = defaultValOrNamed as unknown as Record<string, PineValue>;
        if (na.defval !== undefined) defaultVal = na.defval;
      }
      return isNa(defaultVal) ? '' : defaultVal;
    },
  );

  eng.builtins.set(
    'input.time',
    (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
      let defaultVal: PineValue = defaultValOrNamed ?? 0;
      if (
        typeof defaultValOrNamed === 'object' &&
        defaultValOrNamed !== null &&
        !Array.isArray(defaultValOrNamed)
      ) {
        const na = defaultValOrNamed as unknown as Record<string, PineValue>;
        if (na.defval !== undefined) defaultVal = na.defval;
      }
      return isNa(defaultVal) ? 0 : defaultVal;
    },
  );

  eng.builtins.set(
    'input.timeframe',
    (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
      let defaultVal: PineValue = defaultValOrNamed ?? '';
      if (
        typeof defaultValOrNamed === 'object' &&
        defaultValOrNamed !== null &&
        !Array.isArray(defaultValOrNamed)
      ) {
        const na = defaultValOrNamed as unknown as Record<string, PineValue>;
        if (na.defval !== undefined) defaultVal = na.defval;
      }
      return isNa(defaultVal) ? '' : defaultVal;
    },
  );

  eng.builtins.set(
    'input.source',
    (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
      let defaultVal: PineValue = defaultValOrNamed ?? 0;
      if (
        typeof defaultValOrNamed === 'object' &&
        defaultValOrNamed !== null &&
        !Array.isArray(defaultValOrNamed)
      ) {
        const na = defaultValOrNamed as unknown as Record<string, PineValue>;
        if (na.defval !== undefined) defaultVal = na.defval;
      }
      return isNa(defaultVal) ? 0 : defaultVal;
    },
  );

  eng.builtins.set('input', (...args: PineValue[]): PineValue => {
    let defaultVal: PineValue = args[0] ?? 0;
    if (
      args.length > 0 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      !Array.isArray(args[0])
    ) {
      const na = args[0] as unknown as Record<string, PineValue>;
      if (na.defval !== undefined) defaultVal = na.defval;
      if (typeof na.title === 'string')
        eng.inputs.set(na.title, { type: 'source', default: defaultVal });
    }
    return isNa(defaultVal) ? 0 : defaultVal;
  });
}
