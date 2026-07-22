/**
 * Evil tests: Strategy Engine
 *
 * Adversarial scenarios for the strategy and backtest engine:
 * invalid order parameters, edge case fills, commission extremes,
 * order type boundaries. Verifies graceful handling (no crashes,
 * no state corruption).
 */

import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { StrategyEngine } from '../../src/strategy/strategy-engine.js';
import { makeEvilBarContext } from './helpers.js';

/** Helper: create a strategy engine with some initial bars. */
function createStrategyEngine(barsCount = 20): ExecutionEngine {
  const source = `//@version=6
strategy("EvilTest", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=100)

// Simple moving average cross strategy
smaFast = ta.sma(close, 5)
smaSlow = ta.sma(close, 20)

if (ta.crossover(smaFast, smaSlow))
    strategy.entry("Long", strategy.long)

if (ta.crossunder(smaFast, smaSlow))
    strategy.close("Long")
`;
  const { ast } = parse(source);
  const result = compile(ast);
  const engine = new ExecutionEngine(result);

  for (let i = 0; i < barsCount; i++) {
    engine.executeBar(makeEvilBarContext({}, i + 1));
  }
  return engine;
}

/** Helper: create a bare strategy engine with minimal script for targeted testing. */
function createBareStrategyEngine(): ExecutionEngine {
  const source = `//@version=6
strategy("BareEvil", overlay=true, initial_capital=10000)
// No logic — we'll test order API directly via the engine's strategyEngine
x = close
plot(x, "x")
`;
  const { ast } = parse(source);
  const result = compile(ast);
  return new ExecutionEngine(result);
}

describe('Evil strategy — invalid order parameters', () => {
  it('strategy.entry with qty=0 does not crash or corrupt state', () => {
    const engine = createBareStrategyEngine();
    const strat = engine.getStrategyEngine();
    expect(strat).not.toBeNull();

    // Execute a bar to set current price
    engine.executeBar(makeEvilBarContext({}, 1));

    // Try entry with qty=0
    expect(() => {
      strat!.entry('Test', 'long', 0);
    }).not.toThrow();

    // Position should remain flat (or entry may still create an order, but shouldn't corrupt)
    expect(() => strat!.getPosition().direction).not.toThrow();
  });

  it('strategy.entry with negative quantity does not crash', () => {
    const engine = createBareStrategyEngine();
    const strat = engine.getStrategyEngine();
    expect(strat).not.toBeNull();

    engine.executeBar(makeEvilBarContext({}, 1));

    expect(() => {
      strat!.entry('Test', 'long', -100);
    }).not.toThrow();
  });

  it('strategy.entry with negative limit price does not crash', () => {
    const engine = createBareStrategyEngine();
    const strat = engine.getStrategyEngine();
    expect(strat).not.toBeNull();

    engine.executeBar(makeEvilBarContext({}, 1));

    expect(() => {
      strat!.entry('Test', 'long', 1, -50);
    }).not.toThrow();
  });
});

describe('Evil strategy — entry and exit on same bar', () => {
  it('entry and exit processes without crash', () => {
    const engine = createStrategyEngine(10);

    // Execute more bars to potentially trigger signals
    expect(() => {
      for (let i = 10; i < 30; i++) {
        engine.executeBar(makeEvilBarContext({}, i + 1));
      }
    }).not.toThrow();
  });
});

describe('Evil strategy — commission edge cases', () => {
  it('zero commission strategy script executes without crash', () => {
    const source = `//@version=6
strategy("ZeroComm", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=100, commission_value=0)
x = close
plot(x, "x")
if (ta.crossover(close, open))
    strategy.entry("Long", strategy.long)
`;
    const { ast } = parse(source);
    const result = compile(ast);
    const engine = new ExecutionEngine(result);

    expect(() => {
      for (let i = 0; i < 5; i++) {
        engine.executeBar(makeEvilBarContext({}, i + 1));
      }
    }).not.toThrow();
  });

  it('extreme commission strategy script executes without crash', () => {
    const source = `//@version=6
strategy("HighComm", overlay=true, initial_capital=10000, commission_value=9999999)
x = close
plot(x, "x")
`;
    const { ast } = parse(source);
    const result = compile(ast);
    const engine = new ExecutionEngine(result);

    expect(() => {
      engine.executeBar(makeEvilBarContext({}, 1));
    }).not.toThrow();
  });
});

describe('Evil strategy — overlapping entries', () => {
  it('multiple entry signals do not crash', () => {
    const engine = createBareStrategyEngine();
    const strat = engine.getStrategyEngine()!;
    expect(strat).not.toBeNull();

    // Make config's pyramiding accessible via type assertion
    (strat as any).config.pyramiding = 2;

    engine.executeBar(makeEvilBarContext({}, 1));

    // Multiple entries
    expect(() => {
      strat.entry('First', 'long', 1);
      strat.entry('Second', 'long', 1);
      strat.entry('Third', 'long', 1);
    }).not.toThrow();
  });
});
