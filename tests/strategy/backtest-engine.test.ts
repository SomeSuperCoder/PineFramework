import { BacktestEngine } from '../../src/strategy/backtest-engine.js';
import type { Bar } from '../../src/data/bar.js';
import { StrategyEngine } from '../../src/strategy/strategy-engine.js';

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

describe('BacktestEngine', () => {
  describe('constructor', () => {
    it('should create with default config', () => {
      const engine = new BacktestEngine();
      expect(engine).toBeDefined();
    });

    it('should create with custom config', () => {
      const engine = new BacktestEngine({
        initialCapital: 50000,
        commission: 0.1,
      });
      expect(engine).toBeDefined();
    });
  });

  describe('run', () => {
    it('should run a simple strategy', () => {
      const engine = new BacktestEngine({ initialCapital: 10000 });
      const bars = createBars(100);

      const result = engine.run(bars, (eng, bar, index) => {
        if (index === 0) {
          eng.entry('Long', 'long', 1);
        }
        if (index === 50) {
          eng.exit('Exit');
        }
      });

      expect(result.metrics.totalTrades).toBe(1);
      expect(result.equityCurve.length).toBe(100);
      expect(result.positions.length).toBe(100);
    });

    it('should track equity curve', () => {
      const engine = new BacktestEngine({ initialCapital: 10000 });
      const bars = createBars(10);

      const result = engine.run(bars, (eng, bar, index) => {
        if (index === 0) {
          eng.entry('Long', 'long', 1);
        }
        if (index === 5) {
          eng.exit('Exit');
        }
      });

      expect(result.equityCurve[0]).toBe(10000);
      expect(result.equityCurve.length).toBe(10);
    });

    it('should filter by date range', () => {
      const engine = new BacktestEngine({
        startDate: Date.now() + 5 * 86400000,
        endDate: Date.now() + 10 * 86400000,
      });

      const bars = createBars(20);
      let tradeCount = 0;

      const result = engine.run(bars, (eng, bar, index) => {
        if (index === 0) {
          eng.entry('Long', 'long', 1);
          tradeCount++;
        }
      });

      expect(result.equityCurve.length).toBeLessThanOrEqual(10);
    });
  });

  describe('compareResults', () => {
    it('should compare two results', () => {
      const engine1 = new BacktestEngine({ initialCapital: 10000 });
      const engine2 = new BacktestEngine({ initialCapital: 10000 });
      const bars = createBars(50);

      const strategyFn = (eng: StrategyEngine, bar: Bar, index: number) => {
        if (index === 0) eng.entry('Long', 'long', 1);
        if (index === 25) eng.exit('Exit');
      };

      const result1 = engine1.run(bars, strategyFn);
      const result2 = engine2.run(bars, strategyFn);

      const comparison = BacktestEngine.compareResults(result1, result2);
      expect(comparison.metricsMatch).toBe(true);
      expect(comparison.tradeCountMatch).toBe(true);
      expect(comparison.pnlDifference).toBeCloseTo(0);
    });
  });

  describe('generateReport', () => {
    it('should generate a report', () => {
      const engine = new BacktestEngine({ initialCapital: 10000 });
      const bars = createBars(100);

      const result = engine.run(bars, (eng, bar, index) => {
        if (index === 0) eng.entry('Long', 'long', 1);
        if (index === 50) eng.exit('Exit');
      });

      const report = BacktestEngine.generateReport(result);
      expect(report).toContain('Strategy Backtest Report');
      expect(report).toContain('Total Trades: 1');
      expect(report).toContain('Win Rate:');
    });
  });
});
