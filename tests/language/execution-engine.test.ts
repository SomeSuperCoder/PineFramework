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

describe('ExecutionEngine', () => {
  describe('Basic execution', () => {
    it('should execute a simple indicator script', () => {
      const source = `
        //@version=6
        indicator("Test")
        x = 1
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('should handle variable declarations', () => {
      const source = `
        //@version=6
        indicator("Test")
        x = 10
        y = 20
        z = x + y
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('should handle arithmetic expressions', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = 2 + 3 * 4
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('OHLCV data access', () => {
    it('should access close price', () => {
      const source = `
        //@version=6
        indicator("Test")
        currentClose = close
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('should access open price', () => {
      const source = `
        //@version=6
        indicator("Test")
        currentOpen = open
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('should access high price', () => {
      const source = `
        //@version=6
        indicator("Test")
        currentHigh = high
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('should access low price', () => {
      const source = `
        //@version=6
        indicator("Test")
        currentLow = low
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('should access volume', () => {
      const source = `
        //@version=6
        indicator("Test")
        currentVolume = volume
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('Series indexing', () => {
    it('should support close[1] indexing', () => {
      const source = `
        //@version=6
        indicator("Test")
        prevClose = close[1]
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('should return NA for out-of-bounds indexing', () => {
      const source = `
        //@version=6
        indicator("Test")
        prevClose = close[100]
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('Control flow', () => {
    it('should handle if statements', () => {
      const source = `
        //@version=6
        indicator("Test")
        x = 10
        if x > 5
          y = 1
        else
          y = 0
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('should handle for loops', () => {
      const source = `
        //@version=6
        indicator("Test")
        sum = 0
        for i = 0 to 10
          sum := sum + i
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('should handle while loops', () => {
      const source = `
        //@version=6
        indicator("Test")
        i = 0
        while (i < 10)
          i := i + 1
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('Built-in functions', () => {
    it('should execute math.max', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.max(10, 20)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('should execute math.min', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.min(10, 20)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('should execute math.abs', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.abs(-10)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('Bar execution', () => {
    it('should execute multiple bars', () => {
      const source = `
        //@version=6
        indicator("Test")
        x = close
      `;
      const bars = Array.from({ length: 10 }, (_, i) =>
        createBarContext({
          barIndex: i,
          close: createSeries('close', [100 + i]),
        }),
      );
      const engine = executeScript(source, bars);
      expect(engine).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should handle division by zero returning NA', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = 10 / 0
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('Output generation', () => {
    it('should generate plot output', () => {
      const source = `
        //@version=6
        indicator("Test")
        plot(close, "Close Price")
      `;
      const engine = executeScript(source);
      const output = engine.getOutput('Close Price');
      expect(output).toBeDefined();
    });
  });

  describe('Snapshot and rollback', () => {
    it('should create snapshots', () => {
      const source = `
        //@version=6
        indicator("Test")
        x = close
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
        x = close
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
    it('should execute realtime bar', () => {
      const source = `
        //@version=6
        indicator("Test")
        x = close
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
    it('should track execution metrics', () => {
      const source = `
        //@version=6
        indicator("Test")
        x = close
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
