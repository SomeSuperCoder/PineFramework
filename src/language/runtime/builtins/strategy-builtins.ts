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
    const pos = eng.strategyEngine.getPosition();
    const mintick = 0.01; // Default tick size (crypto pairs typically 0.01)

    // --- Resolve quantity ---
    let qty: number | undefined;
    if (typeof restArgs[0] === 'number') {
      qty = restArgs[0];
    } else if (typeof namedArgs?.qty === 'number') {
      qty = namedArgs.qty;
    }
    // qty_percent: resolve to absolute quantity from position size
    if (namedArgs && typeof namedArgs.qty_percent === 'number' && pos.direction !== 'flat') {
      const percentQty = Math.floor(pos.quantity * (namedArgs.qty_percent as number) / 100);
      if (qty === undefined || percentQty < qty) {
        qty = percentQty;
      }
    }

    const pr = typeof restArgs[1] === 'number' ? restArgs[1] : 0;

    // --- Resolve stop price ---
    let sp: number | undefined;
    if (typeof restArgs[2] === 'number') {
      sp = restArgs[2];
    } else if (typeof namedArgs?.stop === 'number') {
      sp = namedArgs.stop;
    }
    // loss: resolve ticks to absolute price
    if (namedArgs && typeof namedArgs.loss === 'number' && pos.direction !== 'flat' && pos.avgPrice > 0) {
      const lossPrice = pos.direction === 'long'
        ? pos.avgPrice - (namedArgs.loss as number) * mintick
        : pos.avgPrice + (namedArgs.loss as number) * mintick;
      // Use the stop that triggers first: higher for long, lower for short
      if (sp === undefined || (pos.direction === 'long' ? lossPrice > sp : lossPrice < sp)) {
        sp = lossPrice;
      }
    }

    // --- Resolve limit price ---
    let lp: number | undefined;
    if (typeof restArgs[3] === 'number') {
      lp = restArgs[3];
    } else if (typeof namedArgs?.limit === 'number') {
      lp = namedArgs.limit;
    }
    // profit: resolve ticks to absolute price
    if (namedArgs && typeof namedArgs.profit === 'number' && pos.direction !== 'flat' && pos.avgPrice > 0) {
      const profitPrice = pos.direction === 'long'
        ? pos.avgPrice + (namedArgs.profit as number) * mintick
        : pos.avgPrice - (namedArgs.profit as number) * mintick;
      // Use the limit that triggers first: lower for long, higher for short
      if (lp === undefined || (pos.direction === 'long' ? profitPrice < lp : profitPrice > lp)) {
        lp = profitPrice;
      }
    }

    const cm =
      (typeof restArgs[4] === 'string' ? restArgs[4] : undefined) ??
      (typeof namedArgs?.comment === 'string' ? namedArgs.comment : undefined);

    // --- Parse new named params ---
    const fromEntry = namedArgs && typeof namedArgs.from_entry === 'string'
      ? (namedArgs.from_entry as string)
      : undefined;
    const trailPrice = namedArgs && typeof namedArgs.trail_price === 'number'
      ? (namedArgs.trail_price as number)
      : undefined;
    const trailOffset = namedArgs && typeof namedArgs.trail_offset === 'number'
      ? (namedArgs.trail_offset as number)
      : undefined;

    eng.strategyEngine.exit(exitName, qty, pr, sp, lp, cm, fromEntry, trailPrice, trailOffset);
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
