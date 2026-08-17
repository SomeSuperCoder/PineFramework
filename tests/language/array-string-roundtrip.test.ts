/**
 * Verify that array.from() with string arguments preserves types through get().
 *
 * Bug: array.from("a", "b", "c") → blocks.get(0) returned 0 (number) instead
 * of "a" (string).  Root cause: the += compound assignment in
 * statement-executor.ts coerced non-numeric values to 0 before arithmetic,
 * discarding the string type.  The binary + operator (expression-executor.ts)
 * already handled string concatenation; the += path did not.
 */
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

function createBarContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    barIndex: 0,
    barCount: 100,
    timestamp: Date.now(),
    open: createSeries('open', [100]),
    high: createSeries('high', [105]),
    low: createSeries('low', [95]),
    close: createSeries('close', [102]),
    volume: createSeries('volume', [1000000]),
    ...overrides,
  };
}

function executeScript(source: string): ExecutionEngine {
  const { ast } = parse(source);
  const result = compile(ast);
  const engine = new ExecutionEngine(result);
  engine.executeBars([createBarContext()]);
  return engine;
}

describe('Array string roundtrip', () => {
  it('array.from() with strings → get() returns the original string', () => {
    const src = `
      //@version=6
      indicator("test", overlay=false)
      string[] blocks = array.from("a", "b", "c")
      string result = ""
      for i = 0 to 2
          result += blocks.get(i)
      label.new(bar_index, result, result)
    `;
    const engine = executeScript(src);
    // "a" + "b" + "c" = "abc"
    expect(engine.labels.length).toBeGreaterThan(0);
    expect(engine.labels[engine.labels.length - 1].text).toBe('abc');
  });

  it('array.from() with unicode block characters roundtrips correctly', () => {
    const src = `
      //@version=6
      indicator("test", overlay=false)
      string[] blocks = array.from(" ", "▂", "▃", "▄", "▅", "▆", "▇", "█")
      string result = ""
      for i = 0 to 7
          result += blocks.get(i)
      label.new(bar_index, result, result)
    `;
    const engine = executeScript(src);
    expect(engine.labels.length).toBeGreaterThan(0);
    expect(engine.labels[engine.labels.length - 1].text).toBe(' ▂▃▄▅▆▇█');
  });

  it('array.get() on string array returns string, not number', () => {
    const src = `
      //@version=6
      indicator("test", overlay=false)
      string[] items = array.from("hello", "world")
      string first = items.get(0)
      string second = items.get(1)
      string combined = first + second
      label.new(bar_index, combined, combined)
    `;
    const engine = executeScript(src);
    expect(engine.labels.length).toBeGreaterThan(0);
    expect(engine.labels[engine.labels.length - 1].text).toBe('helloworld');
  });

  it('array.push() with string preserves type', () => {
    const src = `
      //@version=6
      indicator("test", overlay=false)
      string[] items = array.new<string>(0)
      items.push("x")
      items.push("y")
      items.push("z")
      string result = ""
      for i = 0 to 2
          result += items.get(i)
      label.new(bar_index, result, result)
    `;
    const engine = executeScript(src);
    expect(engine.labels.length).toBeGreaterThan(0);
    expect(engine.labels[engine.labels.length - 1].text).toBe('xyz');
  });

  it('+= with string left and string right concatenates, not adds', () => {
    const src = `
      //@version=6
      indicator("test", overlay=false)
      string result = "foo"
      result += "bar"
      label.new(bar_index, result, result)
    `;
    const engine = executeScript(src);
    expect(engine.labels.length).toBeGreaterThan(0);
    expect(engine.labels[engine.labels.length - 1].text).toBe('foobar');
  });
});
