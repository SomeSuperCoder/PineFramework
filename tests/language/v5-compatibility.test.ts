import { parse, extractVersion, TokenType, Tokenizer } from '../../src/language/parser/index.js';
import { compile } from '../../src/language/compiler/index.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { barsToContext } from '../../src/index.js';
import type { Bar } from '../../src/data/bar.js';

function createBars(count: number, startPrice: number = 100): Bar[] {
  const bars: Bar[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const open = price;
    const change = (Math.random() - 0.5) * 10;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * 5;
    const low = Math.min(open, close) - Math.random() * 5;
    bars.push({
      timestamp: Date.now() + i * 60000,
      open,
      high,
      low,
      close,
      volume: Math.floor(Math.random() * 1000),
    });
    price = close;
  }
  return bars;
}

describe('Pine Script v5 Compatibility', () => {
  describe('extractVersion', () => {
    it('extracts v5 version from source', () => {
      expect(extractVersion('//@version=5\nindicator("Test")')).toBe(5);
    });

    it('extracts v6 version from source', () => {
      expect(extractVersion('//@version=6\nindicator("Test")')).toBe(6);
    });

    it('returns null when version is missing', () => {
      expect(extractVersion('indicator("Test")')).toBeNull();
    });
  });

  describe('Parser v5 support', () => {
    it('parses //@version=5 without throwing', () => {
      const source = `//@version=5
indicator("Test Indicator", overlay=true)
plot(close)
`;
      expect(() => parse(source)).not.toThrow();
    });

    it('parses //@version=6 without throwing', () => {
      const source = `//@version=6
indicator("Test Indicator", overlay=true)
plot(close)
`;
      expect(() => parse(source)).not.toThrow();
    });

    it('rejects unsupported versions', () => {
      const source = `//@version=4
indicator("Test Indicator")
`;
      expect(() => parse(source)).toThrow('Unsupported Pine Script version');
    });

    it('rejects missing version', () => {
      const source = `indicator("Test Indicator")
`;
      expect(() => parse(source)).toThrow('Missing //@version=N declaration');
    });

    it('stores v5 version in AST', () => {
      const source = `//@version=5
indicator("Test")
`;
      const result = parse(source);
      expect(result.ast.version).toBe(5);
    });

    it('stores v6 version in AST', () => {
      const source = `//@version=6
indicator("Test")
`;
      const result = parse(source);
      expect(result.ast.version).toBe(6);
    });
  });

  describe('study() alias for indicator()', () => {
    it('tokenizes study as Indicator token type', () => {
      const tokens = new Tokenizer('study').tokenize();
      expect(tokens[0]?.type).toBe(TokenType.Indicator);
    });

    it('parses study() declaration as indicator', () => {
      const source = `//@version=5
study("My Study", overlay=true)
plot(close)
`;
      const result = parse(source);
      expect(result.ast.scriptKind).toBe('indicator');
      expect(result.ast.scriptName).toBe('My Study');
    });

    it('parses study() with v5-style parameters', () => {
      const source = `//@version=5
study("RSI Indicator", overlay=false, precision=2)
rsi = ta.sma(close, 14)
plot(rsi)
`;
      const result = parse(source);
      expect(result.ast.scriptKind).toBe('indicator');
      expect(result.ast.scriptName).toBe('RSI Indicator');
      expect(result.ast.scriptArgs.length).toBe(2);
    });
  });

  describe('Compiler v5 support', () => {
    it('compiles v5 script with correct version', () => {
      const source = `//@version=5
indicator("Test")
plot(close)
`;
      const parseResult = parse(source);
      const compileResult = compile(parseResult.ast);
      expect(compileResult.ir.version).toBe(5);
    });

    it('compiles v6 script with correct version', () => {
      const source = `//@version=6
indicator("Test")
plot(close)
`;
      const parseResult = parse(source);
      const compileResult = compile(parseResult.ast);
      expect(compileResult.ir.version).toBe(6);
    });
  });

  describe('Execution Engine v5 support', () => {
    it('includes version in ExecutionResult for v5', () => {
      const source = `//@version=5
indicator("Test")
plot(close)
`;
      const parseResult = parse(source);
      const compileResult = compile(parseResult.ast);
      const engine = new ExecutionEngine(compileResult);
      const bars = createBars(10);
      const contexts = barsToContext(bars);
      const result = engine.executeBars(contexts);
      expect(result.version).toBe(5);
    });

    it('includes version in ExecutionResult for v6', () => {
      const source = `//@version=6
indicator("Test")
plot(close)
`;
      const parseResult = parse(source);
      const compileResult = compile(parseResult.ast);
      const engine = new ExecutionEngine(compileResult);
      const bars = createBars(10);
      const contexts = barsToContext(bars);
      const result = engine.executeBars(contexts);
      expect(result.version).toBe(6);
    });

    it('executes v5 script with study() and plot()', () => {
      const source = `//@version=5
study("SMA Test", overlay=true)
sma = ta.sma(close, 5)
plot(sma)
`;
      const parseResult = parse(source);
      const compileResult = compile(parseResult.ast);
      const engine = new ExecutionEngine(compileResult);
      const bars = createBars(20);
      const contexts = barsToContext(bars);
      const result = engine.executeBars(contexts);
      expect(result.success).toBe(true);
      expect(result.version).toBe(5);
      expect(result.outputs.size).toBeGreaterThan(0);
    });

    it('executes v5 script with ta.sma', () => {
      const source = `//@version=5
study("TA Test")
sma = ta.sma(close, 10)
plot(sma, "SMA")
`;
      const parseResult = parse(source);
      const compileResult = compile(parseResult.ast);
      const engine = new ExecutionEngine(compileResult);
      const bars = createBars(30);
      const contexts = barsToContext(bars);
      const result = engine.executeBars(contexts);
      expect(result.success).toBe(true);
      expect(result.outputs.has('SMA')).toBe(true);
    });

    it('executes v5 script with strategy', () => {
      const source = `//@version=5
strategy("Simple Strategy", overlay=true)
sma = ta.sma(close, 20)
if (close > sma)
    strategy.entry("Long", strategy.long)
if (close < sma)
    strategy.close("Long")
`;
      const parseResult = parse(source);
      const compileResult = compile(parseResult.ast);
      const engine = new ExecutionEngine(compileResult);
      const bars = createBars(50);
      const contexts = barsToContext(bars);
      const result = engine.executeBars(contexts);
      expect(result.success).toBe(true);
      expect(result.version).toBe(5);
    });
  });

  describe('Version default behavior', () => {
    it('defaults to v6 when no version is declared (parser rejects)', () => {
      const source = `indicator("No Version")
plot(close)
`;
      expect(() => parse(source)).toThrow('Missing //@version=N declaration');
    });

    it('handles v5 with various directive formats', () => {
      expect(extractVersion('//@version=5')).toBe(5);
      expect(extractVersion('  //@version=5')).toBe(5);
      expect(extractVersion('// @version = 5')).toBe(5);
    });
  });
});
