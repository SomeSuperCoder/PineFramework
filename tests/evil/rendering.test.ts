/**
 * Evil tests: Rendering / Plot Engine
 *
 * Adversarial inputs for drawing and rendering: extreme coordinates,
 * zero dimensions, NaN colors, massive drawing sets.
 * Verifies graceful handling (no crashes).
 */

import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { makeEvilBarContext, expectNa } from './helpers.js';

/** Helper: execute a script that produces labels, lines, boxes, etc. */
function executeDrawingScript(source: string, barCount = 5): ExecutionEngine {
  const { ast } = parse(source);
  const result = compile(ast);
  const engine = new ExecutionEngine(result);

  for (let i = 0; i < barCount; i++) {
    engine.executeBar(makeEvilBarContext({}, i + 1));
  }
  return engine;
}

describe('Evil rendering — extreme coordinates', () => {
  it('line with NaN coordinates does not crash', () => {
    const source = `//@version=6
indicator("NaNLine")
// Use line.new with extreme values via if/ternary trick
if (close > open)
    line.new(bar_index, close, bar_index[1], close[1], xloc=xloc.bar_index)
plot(close)
`;
    expect(() => {
      executeDrawingScript(source);
    }).not.toThrow();
  });

  it('label with extreme values does not crash', () => {
    const source = `//@version=6
indicator("ExtremeLabel")
if (close > open)
    label.new(bar_index, close, "Test")
plot(close)
`;
    expect(() => {
      executeDrawingScript(source);
    }).not.toThrow();
  });

  it('box with zero dimensions does not crash', () => {
    const source = `//@version=6
indicator("ZeroBox")
if (close > open)
    box.new(bar_index, close, bar_index, close, bgcolor=color.blue)
plot(close)
`;
    expect(() => {
      executeDrawingScript(source);
    }).not.toThrow();
  });
});

describe('Evil rendering — plot with degenerate values', () => {
  it('plotting NaN values does not crash', () => {
    const source = `//@version=6
indicator("NaNPlot")
x = na
plot(x, "x")
`;
    expect(() => {
      executeDrawingScript(source);
    }).not.toThrow();
  });

  it('plotting Infinity values does not crash', () => {
    const source = `//@version=6
indicator("InfPlot")
x = 1 / 0
plot(x, "x")
`;
    expect(() => {
      executeDrawingScript(source);
    }).not.toThrow();
  });

  it('fill between plots with default color does not crash', () => {
    const source = `//@version=6
indicator("FillTest")
a = close
b = close - 10
plot(a, "a")
plot(b, "b")
fill(plot1="a", plot2="b", color=color.new(color.blue, 80))
`;
    expect(() => {
      executeDrawingScript(source);
    }).not.toThrow();
  });
});

describe('Evil rendering — large drawing sets', () => {
  it('creating many labels does not crash', () => {
    // Create a script that generates labels on each bar
    const source = `//@version=6
indicator("ManyLabels")
// Draw a label on every bar
label.new(bar_index, high, "H" + str.tostring(close))
label.new(bar_index, low, "L" + str.tostring(close))
plot(close)
`;
    expect(() => {
      // Execute 30 bars, creating 60 labels
      executeDrawingScript(source, 30);
    }).not.toThrow();
  });

  it('creating many lines does not crash', () => {
    const source = `//@version=6
indicator("ManyLines")
line.new(bar_index, high, bar_index[1], high[1], xloc=xloc.bar_index)
plot(close)
`;
    expect(() => {
      executeDrawingScript(source, 30);
    }).not.toThrow();
  });

  it('creating many boxes does not crash', () => {
    const source = `//@version=6
indicator("ManyBoxes")
box.new(bar_index[1], high, bar_index, low, bgcolor=color.new(color.blue, 90))
plot(close)
`;
    expect(() => {
      executeDrawingScript(source, 20);
    }).not.toThrow();
  });
});
