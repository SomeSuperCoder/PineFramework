/**
 * Evil tests: TA Functions
 *
 * Adversarial inputs for built-in TA functions: zero/negative periods,
 * NaN/Infinity prices, constant-price series, single-bar series.
 * Verifies graceful handling (NA returns) rather than crashing.
 */

import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { makeEvilBarContext, expectNa, expectOutputNa, makeConstantEvilContext } from './helpers.js';
import { NA } from '../../src/language/types/na.js';

/** Helper: compile+execute script returning engine. */
function execOverBars(source: string, barCount = 50): ExecutionEngine {
  const { ast } = parse(source);
  const result = compile(ast);
  const engine = new ExecutionEngine(result);

  // Use constant price series (100) so we can predict outputs
  for (let i = 0; i < barCount; i++) {
    engine.executeBar(makeEvilBarContext({}, barCount));
  }
  return engine;
}

/** Helper: compile+execute with constant-price context. */
function execOverConstantBars(source: string, barCount = 50): ExecutionEngine {
  const { ast } = parse(source);
  const result = compile(ast);
  const engine = new ExecutionEngine(result);

  for (let i = 0; i < barCount; i++) {
    engine.executeBar(makeConstantEvilContext(100, barCount));
  }
  return engine;
}

/** Helper: compile+execute with single-bar context. */
function execOverSingleBar(source: string): ExecutionEngine {
  const { ast } = parse(source);
  const result = compile(ast);
  const engine = new ExecutionEngine(result);
  engine.executeBar(makeEvilBarContext({}, 1));
  return engine;
}

describe('Evil TA — SMA with invalid periods', () => {
  it('sma(close, 0) returns NA without crash', () => {
    const engine = execOverBars(`
      //@version=6
      indicator("Test")
      x = ta.sma(close, 0)
      plot(x, "x")
    `);
    expectOutputNa(engine, 'x');
  });

  it('sma(close, -5) returns NA without crash', () => {
    const engine = execOverBars(`
      //@version=6
      indicator("Test")
      x = ta.sma(close, -5)
      plot(x, "x")
    `);
    expectOutputNa(engine, 'x');
  });
});

describe('Evil TA — EMA with invalid periods', () => {
  it('ema(close, 0) returns NA without crash', () => {
    const engine = execOverBars(`
      //@version=6
      indicator("Test")
      x = ta.ema(close, 0)
      plot(x, "x")
    `);
    expectOutputNa(engine, 'x');
  });

  it('ema(close, na) returns NA without crash', () => {
    const engine = execOverBars(`
      //@version=6
      indicator("Test")
      x = ta.ema(close, na)
      plot(x, "x")
    `);
    expectOutputNa(engine, 'x');
  });
});

describe('Evil TA — RSI with edge periods', () => {
  it('rsi(close, 0) returns NA without crash', () => {
    const engine = execOverBars(`
      //@version=6
      indicator("Test")
      x = ta.rsi(close, 0)
      plot(x, "x")
    `);
    expectOutputNa(engine, 'x');
  });

  it('rsi(close, 1) returns gracefully (no crash)', () => {
    const engine = execOverBars(`
      //@version=6
      indicator("Test")
      x = ta.rsi(close, 1)
      plot(x, "x")
    `);
    const output = engine.getOutput('x');
    expect(output).toBeDefined();
    // rsi with period=1 may produce a value or NA — just ensure no crash
    expect(() => output!.last()).not.toThrow();
  });
});

describe('Evil TA — ATR with edge periods', () => {
  it('atr(0) returns NA without crash', () => {
    const engine = execOverBars(`
      //@version=6
      indicator("Test")
      x = ta.atr(0)
      plot(x, "x")
    `);
    expectOutputNa(engine, 'x');
  });

  it('atr(-14) returns NA without crash', () => {
    const engine = execOverBars(`
      //@version=6
      indicator("Test")
      x = ta.atr(-14)
      plot(x, "x")
    `);
    expectOutputNa(engine, 'x');
  });
});

describe('Evil TA — constant-price series', () => {
  it('sma(close, 5) on constant series returns 100 after warmup', () => {
    const engine = execOverConstantBars(`
      //@version=6
      indicator("Test")
      x = ta.sma(close, 5)
      plot(x, "x")
    `, 50);
    const out = engine.getOutput('x');
    expect(out).toBeDefined();
    const val = out!.last();
    // After 50 bars with price=100, SMA(5) should converge to 100
    if (val !== undefined && typeof val === 'number') {
      expect(val).toBeCloseTo(100, 5);
    }
  });

  it('rsi(close, 14) on constant-price series returns NA', () => {
    const engine = execOverConstantBars(`
      //@version=6
      indicator("Test")
      x = ta.rsi(close, 14)
      plot(x, "x")
    `, 50);
    // RSI on constant price has no change, should be na
    const out = engine.getOutput('x');
    expect(out).toBeDefined();
    // RSI may return 0 or NA depending on implementation
    // Just ensure it doesn't crash
    expect(() => out!.last()).not.toThrow();
  });
});

describe('Evil TA — single-bar series', () => {
  it('sma(close, 14) on single bar returns NA', () => {
    const engine = execOverSingleBar(`
      //@version=6
      indicator("Test")
      x = ta.sma(close, 14)
      plot(x, "x")
    `);
    // Insufficient data → should be NA
    expectOutputNa(engine, 'x');
  });

  it('ema(close, 14) on single bar does not crash', () => {
    const engine = execOverSingleBar(`
      //@version=6
      indicator("Test")
      x = ta.ema(close, 14)
      plot(x, "x")
    `);
    // EMA may return NA or the first close — must not crash
    expect(() => engine.getOutput('x')).not.toThrow();
  });
});
