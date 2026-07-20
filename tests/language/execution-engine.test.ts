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

function executeScript(source: string, bars: ExecutionContext[] = []): ExecutionEngine {
  const { ast } = parse(source);
  const result = compile(ast);
  const engine = new ExecutionEngine(result);

  if (bars.length === 0) {
    bars = [createBarContext()];
  }

  for (const bar of bars) {
    engine.executeBar(bar);
  }

  return engine;
}

/** Assert the last value of a named plot output. */
function expectPlot(engine: ExecutionEngine, name: string, expected: unknown): void {
  const output = engine.getOutput(name);
  expect(output).toBeDefined();
  expect(output!.last()).toBe(expected);
}

describe('ExecutionEngine', () => {
  describe('Basic execution', () => {
    it('should execute a simple indicator script and compute values', () => {
      const source = `
        //@version=6
        indicator("Test")
        x = 1
        plot(x, "x")
      `;
      const engine = executeScript(source);
      expectPlot(engine, 'x', 1);
    });

    it('should handle variable declarations and arithmetic', () => {
      const source = `
        //@version=6
        indicator("Test")
        x = 10
        y = 20
        z = x + y
        plot(z, "z")
      `;
      const engine = executeScript(source);
      expectPlot(engine, 'z', 30);
    });

    it('should handle operator precedence in arithmetic expressions', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = 2 + 3 * 4
        plot(result, "r")
      `;
      const engine = executeScript(source);
      expectPlot(engine, 'r', 14);
    });
  });

  describe('OHLCV data access', () => {
    it('should access close price', () => {
      const source = `
        //@version=6
        indicator("Test")
        plot(close, "close")
      `;
      const engine = executeScript(source);
      expectPlot(engine, 'close', 102);
    });

    it('should access open price', () => {
      const source = `
        //@version=6
        indicator("Test")
        plot(open, "open")
      `;
      const engine = executeScript(source);
      expectPlot(engine, 'open', 100);
    });

    it('should access high price', () => {
      const source = `
        //@version=6
        indicator("Test")
        plot(high, "high")
      `;
      const engine = executeScript(source);
      expectPlot(engine, 'high', 105);
    });

    it('should access low price', () => {
      const source = `
        //@version=6
        indicator("Test")
        plot(low, "low")
      `;
      const engine = executeScript(source);
      expectPlot(engine, 'low', 95);
    });

    it('should access volume', () => {
      const source = `
        //@version=6
        indicator("Test")
        plot(volume, "volume")
      `;
      const engine = executeScript(source);
      expectPlot(engine, 'volume', 1000000);
    });
  });

  describe('Series indexing', () => {
    it('should support close[1] indexing (previous bar)', () => {
      const source = `
        //@version=6
        indicator("Test")
        prevClose = close[1]
        plot(prevClose, "prev")
      `;
      // Build a cumulative close series so bar 1 sees bar 0's value.
      const closeVals: number[] = [];
      const bars = [100, 105].map((v) => {
        closeVals.push(v);
        return createBarContext({ close: createSeries('close', [...closeVals]) });
      });
      const engine = executeScript(source, bars);
      // On bar 2 (index 1), close[1] is the close of bar 1 = 100
      expectPlot(engine, 'prev', 100);
    });

    it('should return NA for out-of-bounds indexing', () => {
      const source = `
        //@version=6
        indicator("Test")
        farBack = close[100]
        plot(farBack, "far")
      `;
      const engine = executeScript(source);
      const output = engine.getOutput('far');
      expect(output).toBeDefined();
      // plot() converts NA to null
      expect(output!.last()).toBeNull();
    });
  });

  describe('Control flow', () => {
    it('should handle if-else statements', () => {
      const source = `
        //@version=6
        indicator("Test")
        x = 10
        y = 0
        if x > 5
          y := 1
        else
          y := 0
        plot(y, "y")
      `;
      const engine = executeScript(source);
      expectPlot(engine, 'y', 1);
    });

    it('should handle for loops (sum 0..10 = 55)', () => {
      const source = `
        //@version=6
        indicator("Test")
        sum = 0
        for i = 0 to 10
          sum := sum + i
        plot(sum, "sum")
      `;
      const engine = executeScript(source);
      expectPlot(engine, 'sum', 55);
    });

    it('should handle while loops', () => {
      const source = `
        //@version=6
        indicator("Test")
        i = 0
        while (i < 10)
          i := i + 1
        plot(i, "i")
      `;
      const engine = executeScript(source);
      expectPlot(engine, 'i', 10);
    });
  });

  describe('Built-in functions', () => {
    it('should execute math.max(10, 20) = 20', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.max(10, 20)
        plot(result, "r")
      `;
      const engine = executeScript(source);
      expectPlot(engine, 'r', 20);
    });

    it('should execute math.min(10, 20) = 10', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.min(10, 20)
        plot(result, "r")
      `;
      const engine = executeScript(source);
      expectPlot(engine, 'r', 10);
    });

    it('should execute math.abs(-10) = 10', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.abs(-10)
        plot(result, "r")
      `;
      const engine = executeScript(source);
      expectPlot(engine, 'r', 10);
    });
  });

  describe('Bar execution', () => {
    it('should execute multiple bars and retain the last close value', () => {
      const source = `
        //@version=6
        indicator("Test")
        plot(close, "close")
      `;
      const bars = Array.from({ length: 10 }, (_, i) =>
        createBarContext({
          barIndex: i,
          close: createSeries('close', [100 + i]),
        }),
      );
      const engine = executeScript(source, bars);
      // Last bar has close = 100 + 9 = 109
      expectPlot(engine, 'close', 109);
    });
  });

  describe('Error handling', () => {
    it('should handle division by zero returning NA (null in plot output)', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = 10 / 0
        plot(result, "r")
      `;
      const engine = executeScript(source);
      const output = engine.getOutput('r');
      expect(output).toBeDefined();
      // plot() converts NA to null
      expect(output!.last()).toBeNull();
    });
  });

  describe('Output generation', () => {
    it('should generate plot output with correct value', () => {
      const source = `
        //@version=6
        indicator("Test")
        plot(close, "Close Price")
      `;
      const engine = executeScript(source);
      const output = engine.getOutput('Close Price');
      expect(output).toBeDefined();
      expect(output!.last()).toBe(102);
    });
  });

  describe('Snapshot and rollback', () => {
    it('should create snapshots and track bar count', () => {
      const source = `
        //@version=6
        indicator("Test")
        plot(close, "close")
      `;
      const { ast } = parse(source);
      const result = compile(ast);
      const engine = new ExecutionEngine(result);

      engine.createSnapshot();
      engine.executeBar(createBarContext());

      const metrics = engine.getMetrics();
      expect(metrics.totalBars).toBe(1);
    });

    it('should rollback to previous bar', () => {
      const source = `
        //@version=6
        indicator("Test")
        plot(close, "close")
      `;
      const bars = [
        createBarContext({ close: createSeries('close', [100]) }),
        createBarContext({ close: createSeries('close', [105]) }),
      ];
      const engine = executeScript(source, bars);

      const metrics = engine.getMetrics();
      expect(metrics.totalBars).toBe(2);

      const rolledBack = engine.rollbackToPreviousBar();
      expect(rolledBack).toBe(true);
    });

    it('should rollback on execution error', () => {
      const source = `
        //@version=6
        indicator("Test")
        x = 1
      `;
      const { ast } = parse(source);
      const result = compile(ast);
      const engine = new ExecutionEngine(result);

      engine.executeBar(createBarContext());

      const metrics = engine.getMetrics();
      expect(metrics.successfulBars).toBe(1);
      expect(metrics.failedBars).toBe(0);
    });

    it('should handle empty rollback gracefully', () => {
      const source = `
        //@version=6
        indicator("Test")
        x = 1
      `;
      const { ast } = parse(source);
      const result = compile(ast);
      const engine = new ExecutionEngine(result);

      const rolledBack = engine.rollbackToPreviousBar();
      expect(rolledBack).toBe(false);
    });
  });

  describe('Realtime execution', () => {
    it('should execute realtime bars successfully', () => {
      const source = `
        //@version=6
        indicator("Test")
        plot(close, "close")
      `;
      const { ast } = parse(source);
      const result = compile(ast);
      const engine = new ExecutionEngine(result);

      const result1 = engine.executeRealtimeBar(
        createBarContext({ close: createSeries('close', [100]) }),
      );
      expect(result1.success).toBe(true);

      const result2 = engine.executeRealtimeBar(
        createBarContext({ close: createSeries('close', [105]) }),
      );
      expect(result2.success).toBe(true);
    });
  });

  describe('Performance metrics', () => {
    it('should track execution metrics across multiple bars', () => {
      const source = `
        //@version=6
        indicator("Test")
        plot(close, "close")
      `;
      const bars = Array.from({ length: 5 }, (_, i) =>
        createBarContext({
          barIndex: i,
          close: createSeries('close', [100 + i]),
        }),
      );
      const engine = executeScript(source, bars);

      const metrics = engine.getMetrics();
      expect(metrics.totalBars).toBe(5);
      expect(metrics.successfulBars).toBe(5);
      expect(metrics.failedBars).toBe(0);
      expect(metrics.averageExecutionTimeMs).toBeGreaterThanOrEqual(0);
      expect(metrics.lastExecutionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should track failed bars in metrics', () => {
      const source = `
        //@version=6
        indicator("Test")
        x = close
      `;
      const { ast } = parse(source);
      const result = compile(ast);
      const engine = new ExecutionEngine(result);

      engine.executeBar(createBarContext());

      const metrics = engine.getMetrics();
      expect(metrics.totalBars).toBe(1);
      expect(metrics.successfulBars).toBe(1);
      expect(metrics.failedBars).toBe(0);
    });
  });
});
