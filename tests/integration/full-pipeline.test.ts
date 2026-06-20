import { parse } from '../../src/language/parser/index.js';
import { compile } from '../../src/language/compiler/index.js';
import { ExecutionEngine, type ExecutionContext } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
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
      timestamp: Date.now() + i * 86400000,
      open,
      high,
      low,
      close,
      volume: Math.floor(Math.random() * 10000) + 1000,
    });

    price = close;
  }

  return bars;
}

function barsToContext(bars: Bar[]): ExecutionContext[] {
  return bars.map((bar, index) => ({
    barIndex: index,
    barCount: bars.length,
    timestamp: bar.timestamp,
    open: createSeries('open', [bar.open]),
    high: createSeries('high', [bar.high]),
    low: createSeries('low', [bar.low]),
    close: createSeries('close', [bar.close]),
    volume: createSeries('volume', [bar.volume]),
  }));
}

describe('Integration: Full Pipeline', () => {
  describe('Parse -> Compile -> Execute', () => {
    it('should execute a simple indicator', () => {
      const source = `//@version=6
indicator("Test")
plot(close, "Close")`;

      const { ast } = parse(source);
      const compileResult = compile(ast);
      const engine = new ExecutionEngine(compileResult);

      const bars = createBars(10);
      const contexts = barsToContext(bars);

      const result = engine.executeBars(contexts);

      expect(result.success).toBe(true);
      expect(result.outputs.size).toBe(1);
    });

    it('should execute a moving average indicator', () => {
      const source = `//@version=6
indicator("SMA")
smaValue = ta.sma(close, 10)
plot(smaValue, "SMA")`;

      const { ast } = parse(source);
      const compileResult = compile(ast);
      const engine = new ExecutionEngine(compileResult);

      const bars = createBars(20);
      const contexts = barsToContext(bars);

      const result = engine.executeBars(contexts);

      expect(result.success).toBe(true);
      expect(result.outputs.size).toBe(1);
    });

    it('should execute indicator with multiple plots', () => {
      const source = `//@version=6
indicator("Multi Plot")
plot(close, "Close")
plot(open, "Open")
plot(high, "High")`;

      const { ast } = parse(source);
      const compileResult = compile(ast);
      const engine = new ExecutionEngine(compileResult);

      const bars = createBars(10);
      const contexts = barsToContext(bars);

      const result = engine.executeBars(contexts);

      expect(result.success).toBe(true);
      expect(result.outputs.size).toBe(3);
    });

    it('should execute indicator with variables', () => {
      const source = `//@version=6
indicator("Variables")
myClose = close
myOpen = open
diff = myClose - myOpen
plot(diff, "Difference")`;

      const { ast } = parse(source);
      const compileResult = compile(ast);
      const engine = new ExecutionEngine(compileResult);

      const bars = createBars(10);
      const contexts = barsToContext(bars);

      const result = engine.executeBars(contexts);

      expect(result.success).toBe(true);
      expect(result.outputs.size).toBe(1);
    });

    it('should execute indicator with conditional logic', () => {
      const source = `//@version=6
indicator("Conditional")
isUp = close > open
plot(isUp ? 1 : 0, "Direction")`;

      const { ast } = parse(source);
      const compileResult = compile(ast);
      const engine = new ExecutionEngine(compileResult);

      const bars = createBars(10);
      const contexts = barsToContext(bars);

      const result = engine.executeBars(contexts);

      expect(result.success).toBe(true);
      expect(result.outputs.size).toBe(1);
    });

    it('should execute indicator with math functions', () => {
      const source = `//@version=6
indicator("Math")
absValue = math.abs(close - open)
maxValue = math.max(close, open)
minValue = math.min(close, open)
plot(absValue, "Abs")`;

      const { ast } = parse(source);
      const compileResult = compile(ast);
      const engine = new ExecutionEngine(compileResult);

      const bars = createBars(10);
      const contexts = barsToContext(bars);

      const result = engine.executeBars(contexts);

      expect(result.success).toBe(true);
    });

    it('should handle realtime updates', () => {
      const source = `//@version=6
indicator("Realtime")
plot(close, "Close")`;

      const { ast } = parse(source);
      const compileResult = compile(ast);
      const engine = new ExecutionEngine(compileResult);

      const bars = createBars(5);
      const contexts = barsToContext(bars);

      engine.executeBars(contexts);

      const realtimeBar: ExecutionContext = {
        barIndex: 5,
        barCount: 6,
        timestamp: Date.now(),
        open: createSeries('open', [105]),
        high: createSeries('high', [110]),
        low: createSeries('low', [100]),
        close: createSeries('close', [108]),
        volume: createSeries('volume', [5000]),
      };

      const result = engine.executeRealtimeBar(realtimeBar);
      expect(result.success).toBe(true);
    });

    it('should handle rollback on error', () => {
      const source = `//@version=6
indicator("Rollback")
var x = 0.0
x := x + 1.0
plot(x, "X")`;

      const { ast } = parse(source);
      const compileResult = compile(ast);
      const engine = new ExecutionEngine(compileResult);

      const bars = createBars(5);
      const contexts = barsToContext(bars);

      const result1 = engine.executeBars(contexts.slice(0, 3));
      expect(result1.success).toBe(true);

      const rollbackSuccess = engine.rollbackToPreviousBar();
      expect(rollbackSuccess).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid syntax', () => {
      const source = `//@version=6
indicator("Invalid")
plot(close`;

      expect(() => parse(source)).toThrow();
    });

    it('should handle undefined variables', () => {
      const source = `//@version=6
indicator("Undefined")
plot(undefinedVar)`;

      const { ast } = parse(source);
      const compileResult = compile(ast);
      const engine = new ExecutionEngine(compileResult);

      const bars = createBars(5);
      const contexts = barsToContext(bars);

      const result = engine.executeBars(contexts);
      expect(result.success).toBe(false);
    });
  });

  describe('Performance', () => {
    it('should execute with acceptable performance', () => {
      const source = `//@version=6
indicator("Performance")
smaValue = ta.sma(close, 20)
plot(smaValue, "SMA")`;

      const { ast } = parse(source);
      const compileResult = compile(ast);
      const engine = new ExecutionEngine(compileResult);

      const bars = createBars(1000);
      const contexts = barsToContext(bars);

      const startTime = performance.now();
      const result = engine.executeBars(contexts);
      const endTime = performance.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should handle large datasets', () => {
      const source = `//@version=6
indicator("Large Dataset")
plot(close, "Close")`;

      const { ast } = parse(source);
      const compileResult = compile(ast);
      const engine = new ExecutionEngine(compileResult);

      const bars = createBars(10000);
      const contexts = barsToContext(bars);

      const result = engine.executeBars(contexts);
      expect(result.success).toBe(true);
    });
  });

  describe('Metrics', () => {
    it('should track execution metrics', () => {
      const source = `//@version=6
indicator("Metrics")
plot(close, "Close")`;

      const { ast } = parse(source);
      const compileResult = compile(ast);
      const engine = new ExecutionEngine(compileResult);

      const bars = createBars(100);
      const contexts = barsToContext(bars);

      engine.executeBars(contexts);

      const metrics = engine.getMetrics();
      expect(metrics.totalBars).toBe(100);
      expect(metrics.successfulBars).toBe(100);
      expect(metrics.failedBars).toBe(0);
      expect(metrics.averageExecutionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});
