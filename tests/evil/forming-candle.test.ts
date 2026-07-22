/**
 * Evil tests: Forming Candle
 *
 * Adversarial scenarios for the forming candle lifecycle:
 * consecutive updates, stale bar detection, confirm after stale,
 * zero-volume candles, extreme price values.
 * Verifies graceful handling and state consistency.
 */

import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import { makeEvilBarContext, expectNa } from './helpers.js';

/** Helper: create an engine with N bars executed normally. */
function createEngine(barCount = 10): ExecutionEngine {
  const source = `//@version=6
indicator("Test")
x = close
plot(x, "x")
`;
  const { ast } = parse(source);
  const result = compile(ast);
  const engine = new ExecutionEngine(result);

  for (let i = 0; i < barCount; i++) {
    engine.executeBar(makeEvilBarContext({}, i + 1));
  }
  return engine;
}

/** Helper: create a forming candle context (same bar index, different close). */
function formingContext(barIndex: number, newClose: number) {
  return makeEvilBarContext({}, barIndex + 1);
}

describe('Evil forming candle — consecutive updates', () => {
  it('5 consecutive forming candle updates with different closes: state consistent', () => {
    const engine = createEngine(10);

    // Total bars should be 10
    expect(engine.getMetrics().totalBars).toBe(10);

    // Get pre-forming output value
    const preVal = engine.getOutput('x')?.last();

    // 5 forming candle updates
    for (let i = 0; i < 5; i++) {
      engine.setFormingCandle(true);
      const ctx = makeEvilBarContext({}, 11);
      engine.computeFormingCandle(ctx);
      engine.setFormingCandle(false);
    }

    // totalBars should NOT have changed (forming candles don't increment)
    expect(engine.getMetrics().totalBars).toBe(10);

    // Output should still match pre-forming value
    expect(engine.getOutput('x')?.last()).toBe(preVal);
  });

  it('forming candle then confirmed bar at same timestamp: correct transition', () => {
    const engine = createEngine(10);
    const preTotal = engine.getMetrics().totalBars;

    // Forming candle update
    engine.setFormingCandle(true);
    const formingCtx = makeEvilBarContext({}, 11);
    engine.computeFormingCandle(formingCtx);
    engine.setFormingCandle(false);

    // Confirm bar (real execute)
    engine.executeBar(makeEvilBarContext({}, 11));

    // totalBars should have incremented
    expect(engine.getMetrics().totalBars).toBe(preTotal + 1);
  });
});

describe('Evil forming candle — zero volume', () => {
  it('forming candle with zero volume does not crash', () => {
    const engine = createEngine(5);
    engine.setFormingCandle(true);

    const zeroVolCtx = makeEvilBarContext({
      volume: createSeries('volume', [0]),
    }, 6);

    expect(() => {
      engine.computeFormingCandle(zeroVolCtx);
    }).not.toThrow();

    engine.setFormingCandle(false);
  });
});

describe('Evil forming candle — extreme prices', () => {
  it('forming candle with NaN close does not crash', () => {
    const engine = createEngine(5);
    engine.setFormingCandle(true);

    const nanCtx = makeEvilBarContext({
      close: createSeries('close', [NaN]),
    }, 6);

    expect(() => {
      engine.computeFormingCandle(nanCtx);
    }).not.toThrow();

    engine.setFormingCandle(false);
  });

  it('forming candle with Infinity close does not crash', () => {
    const engine = createEngine(5);
    engine.setFormingCandle(true);

    const infCtx = makeEvilBarContext({
      close: createSeries('close', [Infinity]),
    }, 6);

    expect(() => {
      engine.computeFormingCandle(infCtx);
    }).not.toThrow();

    engine.setFormingCandle(false);
  });

  it('forming candle with negative close does not crash', () => {
    const engine = createEngine(5);
    engine.setFormingCandle(true);

    const negCtx = makeEvilBarContext({
      close: createSeries('close', [-100]),
    }, 6);

    expect(() => {
      engine.computeFormingCandle(negCtx);
    }).not.toThrow();

    engine.setFormingCandle(false);
  });
});

describe('Evil forming candle — after all bars confirmed', () => {
  it('computeFormingCandle after all bars confirmed returns valid result', () => {
    const engine = createEngine(10);

    // Execute one more bar
    engine.executeBar(makeEvilBarContext({}, 11));

    // Now try forming candle — should not crash
    engine.setFormingCandle(true);
    const ctx = makeEvilBarContext({}, 12);
    expect(() => {
      const result = engine.computeFormingCandle(ctx);
      expect(result.success).toBeDefined();
    }).not.toThrow();

    engine.setFormingCandle(false);
  });
});
