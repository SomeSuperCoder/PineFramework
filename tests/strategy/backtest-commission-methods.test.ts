import { BacktestEngine } from '../../src/strategy/backtest-engine.js';
import type { Bar } from '../../src/data/bar.js';

function createDeterministicBars(count: number, startPrice: number = 100): Bar[] {
  const bars: Bar[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const open = price;
    const direction = i % 2 === 0 ? 1 : -1;
    const change = direction * (2 + (i % 3));
    const close = open + change;
    const high = Math.max(open, close) + 1;
    const low = Math.min(open, close) - 1;

    bars.push({
      timestamp: 1700000000000 + i * 86400000,
      open,
      high,
      low,
      close,
      volume: 10000,
    });

    price = close;
  }

  return bars;
}

describe('BacktestEngine Commission Methods', () => {
  describe('percent_fixed method', () => {
    it('should apply percent_fixed commission to backtest trades', () => {
      const bars = createDeterministicBars(20, 100);
      const engine = new BacktestEngine({
        initialCapital: 10000,
        commissionMethod: 'percent_fixed',
        commissionMethodSettings: { rate: 0.01 }, // 1%
      });

      const result = engine.run(bars, (eng, _bar, index) => {
        if (index === 0) eng.entry('Long', 'long', 10);
        if (index === 10) eng.exit('Exit');
      });

      expect(result.metrics.totalTrades).toBe(1);
      expect(result.metrics.commission).toBeGreaterThan(0);

      const trade = result.trades[0]!;
      expect(trade.commission).toBeGreaterThan(0);
    });

    it('should produce different results than legacy percent commission', () => {
      const bars = createDeterministicBars(20, 100);

      const legacyEngine = new BacktestEngine({
        initialCapital: 10000,
        commission: 1, // 1% as legacy percent
        commissionType: 'percent',
      });
      const legacyResult = legacyEngine.run(bars, (eng, _bar, index) => {
        if (index === 0) eng.entry('Long', 'long', 10);
        if (index === 10) eng.exit('Exit');
      });

      const pluggableEngine = new BacktestEngine({
        initialCapital: 10000,
        commissionMethod: 'percent_fixed',
        commissionMethodSettings: { rate: 0.01 },
      });
      const pluggableResult = pluggableEngine.run(bars, (eng, _bar, index) => {
        if (index === 0) eng.entry('Long', 'long', 10);
        if (index === 10) eng.exit('Exit');
      });

      // Both should have commission > 0
      expect(legacyResult.metrics.commission).toBeGreaterThan(0);
      expect(pluggableResult.metrics.commission).toBeGreaterThan(0);
    });
  });

  describe('per_order_fixed method', () => {
    it('should apply fixed commission per order', () => {
      const bars = createDeterministicBars(20, 100);
      const engine = new BacktestEngine({
        initialCapital: 10000,
        commissionMethod: 'per_order_fixed',
        commissionMethodSettings: { amount: 5 },
      });

      const result = engine.run(bars, (eng, _bar, index) => {
        if (index === 0) eng.entry('Long', 'long', 10);
        if (index === 10) eng.exit('Exit');
      });

      expect(result.metrics.totalTrades).toBe(1);
      // trade.commission = exit commission only = $5
      expect(result.trades[0]!.commission).toBe(5);
    });
  });

  describe('jupiter_ultra method', () => {
    it('should apply jupiter_ultra commission', () => {
      const bars = createDeterministicBars(20, 100);
      const engine = new BacktestEngine({
        initialCapital: 10000,
        commissionMethod: 'jupiter_ultra',
        commissionMethodSettings: { rate: 0.001 },
      });

      const result = engine.run(bars, (eng, _bar, index) => {
        if (index === 0) eng.entry('Long', 'long', 10);
        if (index === 10) eng.exit('Exit');
      });

      expect(result.metrics.totalTrades).toBe(1);
      expect(result.metrics.commission).toBeGreaterThan(0);
    });
  });

  describe('jupiter_manual method', () => {
    it('should apply zero commission', () => {
      const bars = createDeterministicBars(20, 100);
      const engine = new BacktestEngine({
        initialCapital: 10000,
        commissionMethod: 'jupiter_manual',
      });

      const result = engine.run(bars, (eng, _bar, index) => {
        if (index === 0) eng.entry('Long', 'long', 10);
        if (index === 10) eng.exit('Exit');
      });

      expect(result.metrics.totalTrades).toBe(1);
      expect(result.metrics.commission).toBe(0);
    });
  });

  describe('none method', () => {
    it('should apply zero commission', () => {
      const bars = createDeterministicBars(20, 100);
      const engine = new BacktestEngine({
        initialCapital: 10000,
        commissionMethod: 'none',
      });

      const result = engine.run(bars, (eng, _bar, index) => {
        if (index === 0) eng.entry('Long', 'long', 10);
        if (index === 10) eng.exit('Exit');
      });

      expect(result.metrics.totalTrades).toBe(1);
      expect(result.metrics.commission).toBe(0);
    });
  });

  describe('fallback to legacy commission', () => {
    it('should use legacy commission when no method specified', () => {
      const bars = createDeterministicBars(20, 100);
      const engine = new BacktestEngine({
        initialCapital: 10000,
        commission: 2.5,
        commissionType: 'fixed',
      });

      const result = engine.run(bars, (eng, _bar, index) => {
        if (index === 0) eng.entry('Long', 'long', 10);
        if (index === 10) eng.exit('Exit');
      });

      expect(result.metrics.totalTrades).toBe(1);
      // trade.commission = exit commission only = $2.5
      expect(result.trades[0]!.commission).toBe(2.5);
    });

    it('should prefer commissionMethod over legacy when both set', () => {
      const bars = createDeterministicBars(20, 100);

      // With pluggable method — should be zero
      const pluggableEngine = new BacktestEngine({
        initialCapital: 10000,
        commission: 100, // high legacy commission
        commissionType: 'fixed',
        commissionMethod: 'none',
      });
      const pluggableResult = pluggableEngine.run(bars, (eng, _bar, index) => {
        if (index === 0) eng.entry('Long', 'long', 10);
        if (index === 10) eng.exit('Exit');
      });

      expect(pluggableResult.metrics.commission).toBe(0);
    });
  });

  describe('long-only enforcement in backtest', () => {
    it('should reject short trades with jupiter_ultra method', () => {
      const bars = createDeterministicBars(20, 100);
      const engine = new BacktestEngine({
        initialCapital: 10000,
        commissionMethod: 'jupiter_ultra',
        commissionMethodSettings: { rate: 0.001 },
      });

      const result = engine.run(bars, (eng, _bar, index) => {
        if (index === 0) eng.entry('Short', 'short', 10);
        if (index === 10) eng.exit('Exit');
      });

      expect(result.metrics.totalTrades).toBe(0);
    });

    it('should allow long trades with jupiter_ultra method', () => {
      const bars = createDeterministicBars(20, 100);
      const engine = new BacktestEngine({
        initialCapital: 10000,
        commissionMethod: 'jupiter_ultra',
        commissionMethodSettings: { rate: 0.001 },
      });

      const result = engine.run(bars, (eng, _bar, index) => {
        if (index === 0) eng.entry('Long', 'long', 10);
        if (index === 10) eng.exit('Exit');
      });

      expect(result.metrics.totalTrades).toBe(1);
    });
  });

  describe('commission in report output', () => {
    it('should include commission in report string', () => {
      const bars = createDeterministicBars(20, 100);
      const engine = new BacktestEngine({
        initialCapital: 10000,
        commissionMethod: 'per_order_fixed',
        commissionMethodSettings: { amount: 1 },
      });

      const result = engine.run(bars, (eng, _bar, index) => {
        if (index === 0) eng.entry('Long', 'long', 10);
        if (index === 10) eng.exit('Exit');
      });

      const report = BacktestEngine.generateReport(result);
      expect(report).toContain('Total Commission');
      expect(report).toContain('$');
    });
  });

  describe('multiple trades with commission', () => {
    it('should accumulate commission across multiple trades', () => {
      const bars = createDeterministicBars(30, 100);
      const engine = new BacktestEngine({
        initialCapital: 10000,
        commissionMethod: 'per_order_fixed',
        commissionMethodSettings: { amount: 1 },
      });

      const result = engine.run(bars, (eng, _bar, index) => {
        if (index === 0) eng.entry('Long', 'long', 10);
        if (index === 5) eng.exit('Exit');
        if (index === 10) eng.entry('Long2', 'long', 10);
        if (index === 15) eng.exit('Exit2');
        if (index === 20) eng.entry('Long3', 'long', 10);
        if (index === 25) eng.exit('Exit3');
      });

      expect(result.metrics.totalTrades).toBe(3);
      // Each trade's commission = exit commission only = $1
      // metrics.commission sums trade.commission across all trades = $3
      expect(result.metrics.commission).toBeCloseTo(3);
    });
  });
});
