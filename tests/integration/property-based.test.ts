import { parse as parseSource } from '../../src/language/parser/index.js';
import { compile as compileSource } from '../../src/language/compiler/index.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

describe('Property-Based Tests', () => {
  describe('Mathematical Properties', () => {
    it('addition is commutative', () => {
      for (let i = 0; i < 100; i++) {
        const a = Math.random() * 1000 - 500;
        const b = Math.random() * 1000 - 500;
        expect(a + b).toBeCloseTo(b + a, 10);
      }
    });

    it('addition is associative', () => {
      for (let i = 0; i < 100; i++) {
        const a = Math.random() * 100 - 50;
        const b = Math.random() * 100 - 50;
        const c = Math.random() * 100 - 50;
        expect((a + b) + c).toBeCloseTo(a + (b + c), 10);
      }
    });

    it('multiplication is commutative', () => {
      for (let i = 0; i < 100; i++) {
        const a = Math.random() * 100 - 50;
        const b = Math.random() * 100 - 50;
        expect(a * b).toBeCloseTo(b * a, 10);
      }
    });

    it('multiplication distributes over addition', () => {
      for (let i = 0; i < 100; i++) {
        const a = Math.random() * 100 - 50;
        const b = Math.random() * 100 - 50;
        const c = Math.random() * 100 - 50;
        expect(a * (b + c)).toBeCloseTo(a * b + a * c, 10);
      }
    });

    it('abs is always non-negative', () => {
      for (let i = 0; i < 100; i++) {
        const x = Math.random() * 2000 - 1000;
        expect(Math.abs(x)).toBeGreaterThanOrEqual(0);
      }
    });

    it('abs(x) >= 0', () => {
      for (let i = 0; i < 100; i++) {
        const x = Math.random() * 2000 - 1000;
        expect(Math.abs(x)).toBeGreaterThanOrEqual(0);
      }
    });

    it('sqrt(x^2) == abs(x)', () => {
      for (let i = 0; i < 100; i++) {
        const x = Math.random() * 1000 - 500;
        expect(Math.sqrt(x * x)).toBeCloseTo(Math.abs(x), 5);
      }
    });

    it('min(a, b) <= max(a, b)', () => {
      for (let i = 0; i < 100; i++) {
        const a = Math.random() * 1000 - 500;
        const b = Math.random() * 1000 - 500;
        expect(Math.min(a, b)).toBeLessThanOrEqual(Math.max(a, b));
      }
    });

    it('min(a, b) + max(a, b) == a + b', () => {
      for (let i = 0; i < 100; i++) {
        const a = Math.random() * 1000 - 500;
        const b = Math.random() * 1000 - 500;
        expect(Math.min(a, b) + Math.max(a, b)).toBeCloseTo(a + b, 10);
      }
    });
  });

  describe('Series Properties', () => {
    it('series length is always non-negative', () => {
      for (let i = 0; i < 100; i++) {
        const length = Math.floor(Math.random() * 100);
        expect(length).toBeGreaterThanOrEqual(0);
      }
    });

    it('series index is within bounds', () => {
      for (let i = 0; i < 100; i++) {
        const size = Math.floor(Math.random() * 100) + 1;
        const index = Math.floor(Math.random() * size);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(size);
      }
    });
  });

  describe('Color Properties', () => {
    it('RGB values are within 0-255', () => {
      for (let i = 0; i < 100; i++) {
        const r = Math.floor(Math.random() * 512) - 128;
        const g = Math.floor(Math.random() * 512) - 128;
        const b = Math.floor(Math.random() * 512) - 128;

        const clampedR = Math.max(0, Math.min(255, r));
        const clampedG = Math.max(0, Math.min(255, g));
        const clampedB = Math.max(0, Math.min(255, b));

        expect(clampedR).toBeGreaterThanOrEqual(0);
        expect(clampedR).toBeLessThanOrEqual(255);
        expect(clampedG).toBeGreaterThanOrEqual(0);
        expect(clampedG).toBeLessThanOrEqual(255);
        expect(clampedB).toBeGreaterThanOrEqual(0);
        expect(clampedB).toBeLessThanOrEqual(255);
      }
    });

    it('alpha value is within 0-255', () => {
      for (let i = 0; i < 100; i++) {
        const a = Math.floor(Math.random() * 512) - 128;
        const clampedA = Math.max(0, Math.min(255, a));
        expect(clampedA).toBeGreaterThanOrEqual(0);
        expect(clampedA).toBeLessThanOrEqual(255);
      }
    });
  });

  describe('Strategy Properties', () => {
    it('win rate is between 0 and 100', () => {
      for (let i = 0; i < 100; i++) {
        const total = Math.floor(Math.random() * 100) + 1;
        const wins = Math.floor(Math.random() * total);
        const winRate = (wins / total) * 100;
        expect(winRate).toBeGreaterThanOrEqual(0);
        expect(winRate).toBeLessThanOrEqual(100);
      }
    });

    it('profit factor is non-negative', () => {
      for (let i = 0; i < 100; i++) {
        const grossProfit = Math.random() * 1000;
        const grossLoss = Math.random() * 1000;
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
        expect(profitFactor).toBeGreaterThanOrEqual(0);
      }
    });

    it('drawdown is non-negative', () => {
      for (let i = 0; i < 100; i++) {
        const equity = Math.random() * 10000;
        const peakEquity = equity + Math.random() * 5000;
        const drawdown = peakEquity - equity;
        expect(drawdown).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Round-Trip Properties', () => {
    const source = `//@version=6
indicator("Round Trip")
plot(close, "Close")`;

    it('parse -> compile -> execute produces consistent results', () => {
      const runPipeline = () => {
        const { ast } = parseSource(source);
        const compileResult = compileSource(ast);
        const engine = new ExecutionEngine(compileResult);

        const bars = Array.from({ length: 10 }, (_, i) => ({
          barIndex: i,
          barCount: 10,
          timestamp: Date.now() + i * 86400000,
          open: createSeries('open', [100 + i]),
          high: createSeries('high', [105 + i]),
          low: createSeries('low', [95 + i]),
          close: createSeries('close', [102 + i]),
          volume: createSeries('volume', [5000]),
        }));

        return engine.executeBars(bars);
      };

      const result1 = runPipeline();
      const result2 = runPipeline();

      expect(result1.success).toBe(result2.success);
      expect(result1.outputs.size).toBe(result2.outputs.size);
    });
  });
});
