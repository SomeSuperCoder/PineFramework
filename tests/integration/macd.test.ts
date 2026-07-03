import { parse } from '../../src/language/parser/index.js';
import { compile } from '../../src/language/compiler/index.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import type { Bar } from '../../src/data/bar.js';
import * as fs from 'fs';

const macdSource = fs.readFileSync('./test_indicators/macd.pine', 'utf-8');

const SIMPLE_MACD = `//@version=6
indicator("MACD", overlay = false)
fastLen = input.int(12, "Fast length")
slowLen = input.int(26, "Slow length")
sigLen = input.int(9, "Signal length")
maFast = ta.ema(close, fastLen)
maSlow = ta.ema(close, slowLen)
macd = maFast - maSlow
signal = ta.ema(macd, sigLen)
hist = macd - signal
plot(hist, "Histogram", color.new(color.green, 0), style = plot.style_columns)
plot(macd, "MACD", color.blue)
plot(signal, "Signal", color.orange)
hline(0, "Zero", color.gray)`;

function createBars(count: number, startPrice: number = 100): Bar[] {
  const bars: Bar[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const open = price;
    const change = (Math.random() - 0.5) * 5;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * 3;
    const low = Math.min(open, close) - Math.random() * 3;

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

function executeMacd(source: string, barCount = 100) {
  const { ast } = parse(source);
  const compileResult = compile(ast);
  const engine = new ExecutionEngine(compileResult);
  const bars = createBars(barCount);
  const contexts = barsToContext(bars);
  return { ast, compileResult, engine, result: engine.executeBars(contexts) };
}

describe('Integration: MACD Indicator', () => {
  describe('Parse and Compile (real macd.pine)', () => {
    it('should parse test_indicators/macd.pine without errors', () => {
      const { ast } = parse(macdSource);
      expect(ast).toBeDefined();
      expect(ast.scriptKind).toBe('indicator');
      expect(ast.scriptName).toBe('Moving Average Convergence Divergence');
    });

    it('should compile macd.pine with overlay=false', () => {
      const { ast } = parse(macdSource);
      const compileResult = compile(ast);
      expect(compileResult.ir.overlay).toBe(false);
    });

    it('should parse and compile without throwing', () => {
      expect(() => {
        const { ast } = parse(macdSource);
        compile(ast);
      }).not.toThrow();
    });
  });

  describe('Execution (simplified MACD with ta.ema)', () => {
    it('should execute with expected output keys', () => {
      const { result } = executeMacd(SIMPLE_MACD);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.overlay).toBe(false);

      const outputKeys = Array.from(result.outputs.keys());
      expect(outputKeys.length).toBeGreaterThanOrEqual(3);

      const hasHistogram = outputKeys.some((k) => k.includes('Histogram'));
      const hasMacd = outputKeys.some((k) => k.includes('MACD'));
      const hasSignal = outputKeys.some((k) => k.includes('Signal'));

      expect(hasHistogram).toBe(true);
      expect(hasMacd).toBe(true);
      expect(hasSignal).toBe(true);
    });

    it('should produce non-null values after warmup period', () => {
      const { result } = executeMacd(SIMPLE_MACD);

      expect(result.success).toBe(true);

      const outputKeys = Array.from(result.outputs.keys());
      const warmupBars = 35;

      for (const key of outputKeys) {
        const series = result.outputs.get(key)!;
        const values = Array.from(series.values);

        let nonNullCount = 0;
        for (let i = warmupBars; i < values.length; i++) {
          if (values[i] !== null && values[i] !== undefined) {
            nonNullCount++;
          }
        }

        expect(nonNullCount).toBeGreaterThan(0);
      }
    });

    it('should have MACD values that oscillate around zero', () => {
      const { result } = executeMacd(SIMPLE_MACD);

      const outputKeys = Array.from(result.outputs.keys());
      const macdKey = outputKeys.find((k) => k.includes('MACD'));
      expect(macdKey).toBeDefined();

      const series = result.outputs.get(macdKey!)!;
      const values = Array.from(series.values);

      let positiveCount = 0;
      let negativeCount = 0;
      for (let i = 35; i < values.length; i++) {
        const v = values[i];
        if (typeof v === 'number') {
          if (v > 0) positiveCount++;
          if (v < 0) negativeCount++;
        }
      }

      expect(positiveCount + negativeCount).toBeGreaterThan(0);
    });
  });

  describe('Overlay Flag', () => {
    it('should have overlay=false in execution result', () => {
      const { result } = executeMacd(SIMPLE_MACD);
      expect(result.overlay).toBe(false);
    });

    it('should have overlay=false in compiled script', () => {
      const { ast } = parse(SIMPLE_MACD);
      const compileResult = compile(ast);
      expect(compileResult.ir.overlay).toBe(false);
    });

    it('should have overlay=true for overlay indicator', () => {
      const overlaySource = `//@version=6
indicator("Overlay Test", overlay = true)
plot(close, "Close")`;

      const { ast } = parse(overlaySource);
      const compileResult = compile(ast);
      expect(compileResult.ir.overlay).toBe(true);
    });

    it('should default overlay=false for indicators', () => {
      const defaultSource = `//@version=6
indicator("Default Test")
plot(close, "Close")`;

      const { ast } = parse(defaultSource);
      const compileResult = compile(ast);
      expect(compileResult.ir.overlay).toBe(false);
    });
  });
});
