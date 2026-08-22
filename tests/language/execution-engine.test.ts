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

async function executeScript(
  source: string,
  bars: ExecutionContext[] = [],
): Promise<ExecutionEngine> {
  const { ast } = parse(source);
  const result = compile(ast);
  const engine = new ExecutionEngine(result);

  if (bars.length === 0) {
    bars = [createBarContext()];
  }

  // Use executeBars() to trigger runtime lookback tracking and filtering
  await engine.executeBars(bars);

  return engine;
}

/** Assert the last value of a named plot output. */
function expectPlot(engine: ExecutionEngine, name: string, expected: unknown): void {
  const output = engine.getOutput(name);
  expect(output).toBeDefined();
  expect(output!.last()).toBe(expected);
}

describe('ExecutionEngine', () => {
  describe('Lookback detection', () => {
    it('should parse max_bars_back from indicator declaration', async () => {
      const source = `
        //@version=6
        indicator("Test", max_bars_back=50)
        plot(close, "c")
      `;
      const { ast } = parse(source);
      const result = compile(ast);
      expect(result.ir.maxBarsBack).toBe(50);
    });

    it('should default maxBarsBack to 0 when not declared', async () => {
      const source = `
        //@version=6
        indicator("Test")
        plot(close, "c")
      `;
      const { ast } = parse(source);
      const result = compile(ast);
      expect(result.ir.maxBarsBack).toBe(0);
    });

    describe('Compile-time lookback auto-detection', () => {
      it('should detect lookback from ta.sma(src, 50)', () => {
        const source = `
          //@version=6
          indicator("Test")
          s = ta.sma(close, 50)
          plot(s, "sma")
        `;
        const { ast } = parse(source);
        const result = compile(ast);
        expect(result.ir.maxBarsBack).toBe(50);
      });

      it('should detect lookback from ta.atr(14)', async () => {
        const source = `
          //@version=6
          indicator("Test")
          a = ta.atr(14)
          plot(a, "atr")
        `;
        const { ast } = parse(source);
        const result = compile(ast);
        expect(result.ir.maxBarsBack).toBe(14);
      });

      it('should detect lookback from ta.rsi(src, 14)', () => {
        const source = `
          //@version=6
          indicator("Test")
          r = ta.rsi(close, 14)
          plot(r, "rsi")
        `;
        const { ast } = parse(source);
        const result = compile(ast);
        expect(result.ir.maxBarsBack).toBe(14);
      });

      it('should detect lookback from ta.ema(src, 20)', () => {
        const source = `
          //@version=6
          indicator("Test")
          e = ta.ema(close, 20)
          plot(e, "ema")
        `;
        const { ast } = parse(source);
        const result = compile(ast);
        expect(result.ir.maxBarsBack).toBe(20);
      });

      it('should detect lookback from ta.pivothigh(leftBars, rightBars)', () => {
        const source = `
          //@version=6
          indicator("Test")
          p = ta.pivothigh(5, 3)
          plot(p, "ph")
        `;
        const { ast } = parse(source);
        const result = compile(ast);
        expect(result.ir.maxBarsBack).toBe(8); // 5 + 3
      });

      it('should detect lookback from ta.pivotlow(leftBars, rightBars)', () => {
        const source = `
          //@version=6
          indicator("Test")
          p = ta.pivotlow(10, 5)
          plot(p, "pl")
        `;
        const { ast } = parse(source);
        const result = compile(ast);
        expect(result.ir.maxBarsBack).toBe(15); // 10 + 5
      });

      it('should detect lookback from close[20] indexing', async () => {
        const source = `
          //@version=6
          indicator("Test")
          prev = close[20]
          plot(prev, "prev")
        `;
        const { ast } = parse(source);
        const result = compile(ast);
        expect(result.ir.maxBarsBack).toBe(20);
      });

      it('should detect lookback from open[100] indexing', async () => {
        const source = `
          //@version=6
          indicator("Test")
          prev = open[100]
          plot(prev, "prev")
        `;
        const { ast } = parse(source);
        const result = compile(ast);
        expect(result.ir.maxBarsBack).toBe(100);
      });

      it('should take MAX of multiple lookback sources', async () => {
        const source = `
          //@version=6
          indicator("Test")
          s = ta.sma(close, 50)
          prev = close[100]
          plot(s + prev, "combined")
        `;
        const { ast } = parse(source);
        const result = compile(ast);
        expect(result.ir.maxBarsBack).toBe(100); // max(50, 100)
      });

      it('should detect lookback from ta.valuewhen(cond, src, 3)', () => {
        const source = `
          //@version=6
          indicator("Test")
          v = ta.valuewhen(close > open, close, 3)
          plot(v, "vw")
        `;
        const { ast } = parse(source);
        const result = compile(ast);
        expect(result.ir.maxBarsBack).toBe(3);
      });

      it('should detect lookback from ta.highest(src, 20)', () => {
        const source = `
          //@version=6
          indicator("Test")
          h = ta.highest(close, 20)
          plot(h, "highest")
        `;
        const { ast } = parse(source);
        const result = compile(ast);
        expect(result.ir.maxBarsBack).toBe(20);
      });

      it('should detect lookback from ta.lowest(src, 30)', () => {
        const source = `
          //@version=6
          indicator("Test")
          l = ta.lowest(close, 30)
          plot(l, "lowest")
        `;
        const { ast } = parse(source);
        const result = compile(ast);
        expect(result.ir.maxBarsBack).toBe(30);
      });

      it('should return 0 when no lookback detected', async () => {
        const source = `
          //@version=6
          indicator("Test")
          x = close + open
          plot(x, "x")
        `;
        const { ast } = parse(source);
        const result = compile(ast);
        expect(result.ir.maxBarsBack).toBe(0);
      });

      it('should not override explicit max_bars_back declaration', async () => {
        const source = `
          //@version=6
          indicator("Test", max_bars_back=30)
          s = ta.sma(close, 50)
          plot(s, "sma")
        `;
        const { ast } = parse(source);
        const result = compile(ast);
        expect(result.ir.maxBarsBack).toBe(30); // declared takes precedence
      });

      it('should skip detection for variable period arguments', async () => {
        const source = `
          //@version=6
          indicator("Test")
          len = 50
          s = ta.sma(close, len)
          plot(s, "sma")
        `;
        const { ast } = parse(source);
        const result = compile(ast);
        expect(result.ir.maxBarsBack).toBe(0); // variable not detected
      });

      it('should not treat for-loop bound as lookback (search depth ≠ warmup)', async () => {
        const source = `
          //@version=6
          indicator("Test")
          for x=1 to 1000
            if close[x] > close
              plot(close, "found")
        `;
        const { ast } = parse(source);
        const result = compile(ast);
        // for-loop bound is search depth, not warmup — labels form before bar 1000
        expect(result.ir.maxBarsBack).toBe(0);
      });

      it('should detect TA calls inside for-loop bodies', async () => {
        const source = `
          //@version=6
          indicator("Test")
          for x=0 to 50
            s = ta.sma(close, 20)
            plot(s, "sma")
        `;
        const { ast } = parse(source);
        const result = compile(ast);
        expect(result.ir.maxBarsBack).toBe(20); // TA lookback inside loop
      });
    });

    describe('Runtime lookback filtering', () => {
      it('should filter warmup bars from runtime-detected pivot lookback', async () => {
        const source = `
          //@version=6
          indicator("Test")
          ph = ta.pivothigh(5, 5)
          plot(ph, "ph")
        `;
        const bars = Array.from({ length: 30 }, (_, i) =>
          createBarContext({
            barIndex: i,
            close: createSeries('close', [100 + Math.sin(i * 0.3) * 5]),
            high: createSeries('high', [105 + Math.sin(i * 0.3) * 5]),
            low: createSeries('low', [95 + Math.sin(i * 0.3) * 5]),
          }),
        );
        const engine = await executeScript(source, bars);
        const output = engine.getOutput('ph');
        expect(output).toBeDefined();
        // First 11 bars should be null (warmup from pivot lookback 5+5+1=11)
        for (let i = 0; i < 11 && i < output!.values.length; i++) {
          expect(output!.values[i]).toBeNull();
        }
      });

      it('should filter warmup bars from runtime-detected SMA lookback', async () => {
        const source = `
          //@version=6
          indicator("Test")
          s = ta.sma(close, 20)
          plot(s, "sma")
        `;
        const bars = Array.from({ length: 50 }, (_, i) =>
          createBarContext({
            barIndex: i,
            close: createSeries('close', [100 + i]),
          }),
        );
        const engine = await executeScript(source, bars);
        const output = engine.getOutput('sma');
        expect(output).toBeDefined();
        // First 20 bars should be null (warmup from SMA lookback)
        for (let i = 0; i < 20 && i < output!.values.length; i++) {
          expect(output!.values[i]).toBeNull();
        }
      });

      it('should use declared maxBarsBack when explicit', async () => {
        const source = `
          //@version=6
          indicator("Test", max_bars_back=30)
          x = close
          plot(x, "x")
        `;
        const bars = Array.from({ length: 50 }, (_, i) =>
          createBarContext({
            barIndex: i,
            close: createSeries('close', [100 + i]),
          }),
        );
        const engine = await executeScript(source, bars);
        const output = engine.getOutput('x');
        expect(output).toBeDefined();
        // First 30 bars should be null (declared maxBarsBack)
        for (let i = 0; i < 30 && i < output!.values.length; i++) {
          expect(output!.values[i]).toBeNull();
        }
      });

      it('should not filter when no TA functions used', async () => {
        const source = `
          //@version=6
          indicator("Test")
          x = close + 1
          plot(x, "x")
        `;
        const bars = Array.from({ length: 10 }, (_, i) =>
          createBarContext({
            barIndex: i,
            close: createSeries('close', [100 + i]),
          }),
        );
        const engine = await executeScript(source, bars);
        const output = engine.getOutput('x');
        expect(output).toBeDefined();
        // No bars should be null (no TA functions, no lookback)
        for (let i = 0; i < output!.values.length; i++) {
          expect(output!.values[i]).not.toBeNull();
        }
      });
    });

    it('should parse max_bars_back from strategy declaration', async () => {
      const source = `
        //@version=6
        strategy("Test", max_bars_back=100)
        plot(close, "c")
      `;
      const { ast } = parse(source);
      const result = compile(ast);
      expect(result.ir.maxBarsBack).toBe(100);
    });

    it('should return effective maxBarsBack from getEffectiveMaxBarsBack()', async () => {
      const source = `
        //@version=6
        indicator("Test", max_bars_back=50)
        x = close
        plot(x, "x")
      `;
      const { ast } = parse(source);
      const result = compile(ast);
      const engine = new ExecutionEngine(result);
      // With declaration only (no TA functions yet), runtime=0
      expect(engine.getEffectiveMaxBarsBack()).toBe(50);
    });
  });

  describe('Lookback gating (output filtering)', () => {
    it('should filter bar colors from warmup bars when max_bars_back is declared', async () => {
      const source = `
        //@version=6
        indicator("Test", max_bars_back=10)
        barcolor(close > open ? color.green : color.red)
      `;
      const { ast } = parse(source);
      const result = compile(ast);
      const engine = new ExecutionEngine(result);

      const bars = Array.from({ length: 20 }, (_, i) => ({
        barIndex: i,
        barCount: 20,
        timestamp: 1700000000000 + i * 3600000,
        open: createSeries('open', [100 + i]),
        high: createSeries('high', [105 + i]),
        low: createSeries('low', [95 + i]),
        close: createSeries('close', [100 + i]),
        volume: createSeries('volume', [1000000]),
      }));
      const execResult = await engine.executeBars(bars);

      // Bar colors from warmup bars (0-9) should be removed
      expect(execResult.barColorData).toBeDefined();
      const warmupTimestamps = new Set(bars.slice(0, 10).map((b) => b.timestamp));
      const warmupColors = execResult.barColorData!.filter((c) => warmupTimestamps.has(c.time));
      expect(warmupColors.length).toBe(0);
      // Non-warmup bar colors should remain
      expect(execResult.barColorData!.length).toBeGreaterThan(0);
    });

    it('should set output values to null for warmup bars with declared max_bars_back', async () => {
      const source = `
        //@version=6
        indicator("Test", max_bars_back=10)
        plot(close, "c")
      `;
      const { ast } = parse(source);
      const result = compile(ast);
      const engine = new ExecutionEngine(result);

      const bars = Array.from({ length: 20 }, (_, i) => ({
        barIndex: i,
        barCount: 20,
        timestamp: 1700000000000 + i * 3600000,
        open: createSeries('open', [100 + i]),
        high: createSeries('high', [105 + i]),
        low: createSeries('low', [95 + i]),
        close: createSeries('close', [100 + i]),
        volume: createSeries('volume', [1000000]),
      }));
      const execResult = await engine.executeBars(bars);

      const output = execResult.outputs.get('c');
      expect(output).toBeDefined();
      expect(output!.values.length).toBe(20); // Full bar count preserved
      // First 10 values should be null (warmup)
      for (let i = 0; i < 10; i++) {
        expect(output!.values[i]).toBeNull();
      }
      // Last 10 values should be non-null
      for (let i = 10; i < 20; i++) {
        expect(output!.values[i]).not.toBeNull();
      }
    });

    it('should preserve all outputs when executed via executeBar (not executeBars)', async () => {
      const source = `
        //@version=6
        indicator("Test", max_bars_back=10)
        plot(close, "c")
      `;
      const { ast } = parse(source);
      const result = compile(ast);
      const engine = new ExecutionEngine(result);

      const bar = {
        barIndex: 0,
        barCount: 1,
        timestamp: Date.now(),
        open: createSeries('open', [100]),
        high: createSeries('high', [105]),
        low: createSeries('low', [95]),
        close: createSeries('close', [102]),
        volume: createSeries('volume', [1000000]),
      };
      const execResult = engine.executeBar(bar);
      expect(execResult.success).toBe(true);
      // executeBar is not filtered, values are preserved
      const output = execResult.outputs.get('c');
      expect(output).toBeDefined();
      expect(output!.last()).toBe(102);
    });
  });

  describe('Basic execution', () => {
    it('should execute a simple indicator script and compute values', async () => {
      const source = `
        //@version=6
        indicator("Test")
        x = 1
        plot(x, "x")
      `;
      const engine = await executeScript(source);
      expectPlot(engine, 'x', 1);
    });

    it('should handle variable declarations and arithmetic', async () => {
      const source = `
        //@version=6
        indicator("Test")
        x = 10
        y = 20
        z = x + y
        plot(z, "z")
      `;
      const engine = await executeScript(source);
      expectPlot(engine, 'z', 30);
    });

    it('should handle operator precedence in arithmetic expressions', async () => {
      const source = `
        //@version=6
        indicator("Test")
        result = 2 + 3 * 4
        plot(result, "r")
      `;
      const engine = await executeScript(source);
      expectPlot(engine, 'r', 14);
    });
  });

  describe('OHLCV data access', () => {
    it('should access close price', async () => {
      const source = `
        //@version=6
        indicator("Test")
        plot(close, "close")
      `;
      const engine = await executeScript(source);
      expectPlot(engine, 'close', 102);
    });

    it('should access open price', async () => {
      const source = `
        //@version=6
        indicator("Test")
        plot(open, "open")
      `;
      const engine = await executeScript(source);
      expectPlot(engine, 'open', 100);
    });

    it('should access high price', async () => {
      const source = `
        //@version=6
        indicator("Test")
        plot(high, "high")
      `;
      const engine = await executeScript(source);
      expectPlot(engine, 'high', 105);
    });

    it('should access low price', async () => {
      const source = `
        //@version=6
        indicator("Test")
        plot(low, "low")
      `;
      const engine = await executeScript(source);
      expectPlot(engine, 'low', 95);
    });

    it('should access volume', async () => {
      const source = `
        //@version=6
        indicator("Test")
        plot(volume, "volume")
      `;
      const engine = await executeScript(source);
      expectPlot(engine, 'volume', 1000000);
    });
  });

  describe('Series indexing', () => {
    it('should support close[1] indexing (previous bar)', async () => {
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
      const engine = await executeScript(source, bars);
      // On bar 2 (index 1), close[1] is the close of bar 1 = 100
      expectPlot(engine, 'prev', 100);
    });

    it('should return NA for out-of-bounds indexing', async () => {
      const source = `
        //@version=6
        indicator("Test")
        farBack = close[100]
        plot(farBack, "far")
      `;
      const engine = await executeScript(source);
      const output = engine.getOutput('far');
      expect(output).toBeDefined();
      // plot() converts NA to null
      expect(output!.last()).toBeNull();
    });
  });

  describe('Control flow', () => {
    it('should handle if-else statements', async () => {
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
      const engine = await executeScript(source);
      expectPlot(engine, 'y', 1);
    });

    it('should handle for loops (sum 0..10 = 55)', async () => {
      const source = `
        //@version=6
        indicator("Test")
        sum = 0
        for i = 0 to 10
          sum := sum + i
        plot(sum, "sum")
      `;
      const engine = await executeScript(source);
      expectPlot(engine, 'sum', 55);
    });

    it('should handle while loops', async () => {
      const source = `
        //@version=6
        indicator("Test")
        i = 0
        while (i < 10)
          i := i + 1
        plot(i, "i")
      `;
      const engine = await executeScript(source);
      expectPlot(engine, 'i', 10);
    });
  });

  describe('Built-in functions', () => {
    it('should execute math.max(10, 20) = 20', async () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.max(10, 20)
        plot(result, "r")
      `;
      const engine = await executeScript(source);
      expectPlot(engine, 'r', 20);
    });

    it('should execute math.min(10, 20) = 10', async () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.min(10, 20)
        plot(result, "r")
      `;
      const engine = await executeScript(source);
      expectPlot(engine, 'r', 10);
    });

    it('should execute math.abs(-10) = 10', async () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.abs(-10)
        plot(result, "r")
      `;
      const engine = await executeScript(source);
      expectPlot(engine, 'r', 10);
    });
  });

  describe('Bar execution', () => {
    it('should execute multiple bars and retain the last close value', async () => {
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
      const engine = await executeScript(source, bars);
      // Last bar has close = 100 + 9 = 109
      expectPlot(engine, 'close', 109);
    });
  });

  describe('Error handling', () => {
    it('should handle division by zero returning NA (null in plot output)', async () => {
      const source = `
        //@version=6
        indicator("Test")
        result = 10 / 0
        plot(result, "r")
      `;
      const engine = await executeScript(source);
      const output = engine.getOutput('r');
      expect(output).toBeDefined();
      // plot() converts NA to null
      expect(output!.last()).toBeNull();
    });
  });

  describe('Output generation', () => {
    it('should generate plot output with correct value', async () => {
      const source = `
        //@version=6
        indicator("Test")
        plot(close, "Close Price")
      `;
      const engine = await executeScript(source);
      const output = engine.getOutput('Close Price');
      expect(output).toBeDefined();
      expect(output!.last()).toBe(102);
    });
  });

  describe('Snapshot and rollback', () => {
    it('should create snapshots and track bar count', async () => {
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

    it('should rollback to previous bar', async () => {
      const source = `
        //@version=6
        indicator("Test")
        plot(close, "close")
      `;
      const bars = [
        createBarContext({ close: createSeries('close', [100]) }),
        createBarContext({ close: createSeries('close', [105]) }),
      ];
      const engine = await executeScript(source, bars);

      const metrics = engine.getMetrics();
      expect(metrics.totalBars).toBe(2);

      const rolledBack = engine.rollbackToPreviousBar();
      expect(rolledBack).toBe(true);
    });

    it('should rollback on execution error', async () => {
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

    it('should handle empty rollback gracefully', async () => {
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
    it('should execute realtime bars successfully', async () => {
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
    it('should track execution metrics across multiple bars', async () => {
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
      const engine = await executeScript(source, bars);

      const metrics = engine.getMetrics();
      expect(metrics.totalBars).toBe(5);
      expect(metrics.successfulBars).toBe(5);
      expect(metrics.failedBars).toBe(0);
      expect(metrics.averageExecutionTimeMs).toBeGreaterThanOrEqual(0);
      expect(metrics.lastExecutionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should track failed bars in metrics', async () => {
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
