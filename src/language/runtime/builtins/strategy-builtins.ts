import type { ExecutionEngine } from '../execution-engine.js';
import type { OrderDirection } from '../../../strategy/strategy-engine.js';
import { NA, type PineValue } from '../../types/na.js';

export function registerStrategyBuiltins(engine: ExecutionEngine): void {
  const eng = engine as any;

  eng.builtins.set(
    'strategy.entry',
    (name: PineValue, directionOrQty: PineValue, ...rest: PineValue[]): PineValue => {
      if (!eng.strategyEngine) return NA;

      const namedArgs =
        rest.length > 0 &&
        typeof rest[rest.length - 1] === 'object' &&
        rest[rest.length - 1] !== null &&
        !Array.isArray(rest[rest.length - 1])
          ? (rest[rest.length - 1] as unknown as Record<string, PineValue>)
          : undefined;
      const restArgs = namedArgs ? rest.slice(0, -1) : rest;

      let dir: OrderDirection;
      let qty: number | undefined;
      let pr: number;

      if (typeof directionOrQty === 'string') {
        dir = directionOrQty === 'short' ? 'short' : 'long';
        qty =
          typeof restArgs[0] === 'number'
            ? restArgs[0]
            : typeof namedArgs?.qty === 'number'
              ? namedArgs.qty
              : undefined;
        pr = typeof restArgs[1] === 'number' ? restArgs[1] : 0;
      } else {
        dir = 'long';
        qty =
          typeof directionOrQty === 'number'
            ? directionOrQty
            : typeof namedArgs?.qty === 'number'
              ? namedArgs.qty
              : undefined;
        pr = typeof restArgs[0] === 'number' ? restArgs[0] : 0;
      }

      const entryName = typeof name === 'string' ? name : 'entry';
      const sp = typeof restArgs[2] === 'number'
        ? restArgs[2]
        : typeof namedArgs?.stop === 'number'
          ? namedArgs.stop
          : undefined;
      const lp = typeof restArgs[3] === 'number'
        ? restArgs[3]
        : typeof namedArgs?.limit === 'number'
          ? namedArgs.limit
          : undefined;
      const cm =
        (typeof restArgs[4] === 'string' ? restArgs[4] : undefined) ??
        (typeof namedArgs?.comment === 'string' ? namedArgs.comment : undefined);
      eng.strategyEngine.entry(entryName, dir, qty, pr, sp, lp, cm);
      return NA;
    },
  );

  eng.builtins.set('strategy.exit', (name: PineValue, ...rest: PineValue[]): PineValue => {
    if (!eng.strategyEngine) return NA;

    const namedArgs =
      rest.length > 0 &&
      typeof rest[rest.length - 1] === 'object' &&
      rest[rest.length - 1] !== null &&
      !Array.isArray(rest[rest.length - 1])
        ? (rest[rest.length - 1] as unknown as Record<string, PineValue>)
        : undefined;
    const restArgs = namedArgs ? rest.slice(0, -1) : rest;

    const exitName = typeof name === 'string' ? name : 'exit';
    const qty =
      typeof restArgs[0] === 'number'
        ? restArgs[0]
        : typeof namedArgs?.qty === 'number'
          ? namedArgs.qty
          : undefined;
    const pr = typeof restArgs[1] === 'number' ? restArgs[1] : 0;
    const sp =
      typeof restArgs[2] === 'number'
        ? restArgs[2]
        : typeof namedArgs?.stop === 'number'
          ? namedArgs.stop
          : undefined;
    const lp =
      typeof restArgs[3] === 'number'
        ? restArgs[3]
        : typeof namedArgs?.limit === 'number'
          ? namedArgs.limit
          : undefined;
    const cm =
      (typeof restArgs[4] === 'string' ? restArgs[4] : undefined) ??
      (typeof namedArgs?.comment === 'string' ? namedArgs.comment : undefined);
    eng.strategyEngine.exit(exitName, qty, pr, sp, lp, cm);
    return NA;
  });

  eng.builtins.set('strategy.close', (nameOrNamed?: PineValue): PineValue => {
    if (!eng.strategyEngine) return NA;
    let closeName = 'close';
    let comment: string | undefined;
    if (typeof nameOrNamed === 'string') {
      closeName = nameOrNamed;
    } else if (
      typeof nameOrNamed === 'object' &&
      nameOrNamed !== null &&
      !Array.isArray(nameOrNamed)
    ) {
      const na = nameOrNamed as unknown as Record<string, PineValue>;
      if (typeof na.id === 'string') closeName = na.id;
      if (typeof na.comment === 'string') comment = na.comment;
    }
    eng.strategyEngine.close(closeName, comment);
    return NA;
  });

  eng.builtins.set('strategy.close_all', (name?: PineValue): PineValue => {
    if (!eng.strategyEngine) return NA;
    const closeName = typeof name === 'string' ? name : 'close_all';
    eng.strategyEngine.closeAll(closeName);
    return NA;
  });

  eng.builtins.set('strategy.cancel', (orderId: PineValue): PineValue => {
    if (!eng.strategyEngine) return NA;
    if (typeof orderId === 'string') {
      eng.strategyEngine.cancel(orderId);
    }
    return NA;
  });

  eng.builtins.set('strategy.cancel_all', (): PineValue => {
    if (!eng.strategyEngine) return NA;
    eng.strategyEngine.cancelAll();
    return NA;
  });

  eng.builtins.set(
    'strategy.order',
    (
      name: PineValue,
      direction: PineValue,
      quantity?: PineValue,
      price?: PineValue,
    ): PineValue => {
      if (!eng.strategyEngine) return NA;
      const orderName = typeof name === 'string' ? name : 'order';
      const dir: OrderDirection = direction === 'short' ? 'short' : 'long';
      const qty = typeof quantity === 'number' ? quantity : undefined;
      const pr = typeof price === 'number' ? price : 0;
      eng.strategyEngine.order(orderName, dir, qty, pr);
      return NA;
    },
  );
}
