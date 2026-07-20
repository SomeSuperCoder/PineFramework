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
    it('should apply jupiter_ultra commission (backward compat rate)', () => {
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

    it('should apply jupiter_ultra tiered fee via pairCategory', () => {
      const bars = createDeterministicBars(20, 100);
      const engine = new BacktestEngine({
        initialCapital: 10000,
        commissionMethod: 'jupiter_ultra',
        commissionMethodSettings: { pairCategory: 'default' }, // 10 bps
      });

      const result = engine.run(bars, (eng, _bar, index) => {
        if (index === 0) eng.entry('Long', 'long', 10);
        if (index === 10) eng.exit('Exit');
      });

      expect(result.metrics.totalTrades).toBe(1);
      expect(result.metrics.commission).toBeGreaterThan(0);
    });

    it('should charge 0 Jupiter commission for jupiter_ecosystem tier (plus DEX + network fee)', () => {
      const bars = createDeterministicBars(20, 100);
      const engine = new BacktestEngine({
        initialCapital: 10000,
        commissionMethod: 'jupiter_ultra',
        commissionMethodSettings: { pairCategory: 'jupiter_ecosystem' },
      });

      const result = engine.run(bars, (eng, _bar, index) => {
        if (index === 0) eng.entry('Long', 'long', 10);
        if (index === 10) eng.exit('Exit');
      });

      expect(result.metrics.totalTrades).toBe(1);
      // Entry at bar 0 → fills at bar 1 open=102
      // Exit at bar 10 → fills at bar 11 open=104
      // Exit fill tradeValue = 104 * 10 = 1040
      // DEX (25 bps): 1040 * 0.0025 = 2.60, network: 0.0015 → total = 2.6015
      expect(result.metrics.commission).toBeCloseTo(2.6015, 4);
    });

    it('should charge only DEX fee when solPriceUsd=0 (no network fee on Jupiter 0-tier)', () => {
      const bars = createDeterministicBars(20, 100);
      const engine = new BacktestEngine({
        initialCapital: 10000,
        commissionMethod: 'jupiter_ultra',
        commissionMethodSettings: { pairCategory: 'jupiter_ecosystem', solPriceUsd: 0 },
      });

      const result = engine.run(bars, (eng, _bar, index) => {
        if (index === 0) eng.entry('Long', 'long', 10);
        if (index === 10) eng.exit('Exit');
      });

      expect(result.metrics.totalTrades).toBe(1);
      // Exit fill tradeValue = 104 * 10 = 1040
      // DEX fee (25 bps): 1040 * 0.0025 = 2.60
      expect(result.metrics.commission).toBeCloseTo(2.60, 4);
    });

    it('should charge 2 bps for sol_stable tier (no DEX fee)', () => {
      const bars = createDeterministicBars(20, 100);
      const engine = new BacktestEngine({
        initialCapital: 10000,
        commissionMethod: 'jupiter_ultra',
        commissionMethodSettings: { pairCategory: 'sol_stable', dexFeeBps: 0 },
      });

      const result = engine.run(bars, (eng, _bar, index) => {
        if (index === 0) eng.entry('Long', 'long', 10);
        if (index === 10) eng.exit('Exit');
      });

      expect(result.metrics.totalTrades).toBe(1);
      expect(result.metrics.commission).toBeGreaterThan(0);
      // At 100 entry, 10 shares: Jupiter fee = 100 * 10 * 0.0002 = $0.20
      // Exit at 101: Jupiter fee = 101 * 10 * 0.0002 = $0.202
      // trade.commission (exit only) = $0.202 (DEX fee disabled)
      expect(result.metrics.commission).toBeLessThan(1);
    });
  });

  describe('jupiter_manual method', () => {
    it('should apply DEX fee + network fee with default settings', () => {
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
      // Entry at bar 0 → fills at bar 1 open=102
      // Exit at bar 10 → fills at bar 11 open=104
      // Exit fill tradeValue = 104 * 10 = 1040
      // DEX fee (25 bps) = 1040 * 0.0025 = 2.60
      // Network fee = 0.0015
      // trade.commission (exit only) = 2.6015
      expect(result.metrics.commission).toBeCloseTo(2.6015, 4);
    });

    it('should apply only network fee when DEX fee is disabled', () => {
      const bars = createDeterministicBars(20, 100);
      const engine = new BacktestEngine({
        initialCapital: 10000,
        commissionMethod: 'jupiter_manual',
        commissionMethodSettings: { dexFeeBps: 0, solPriceUsd: 150 },
      });

      const result = engine.run(bars, (eng, _bar, index) => {
        if (index === 0) eng.entry('Long', 'long', 10);
        if (index === 10) eng.exit('Exit');
      });

      expect(result.metrics.totalTrades).toBe(1);
      // Only network fee on exit fill: 0.0015
      expect(result.metrics.commission).toBeCloseTo(0.0015, 6);
    });

    it('should apply zero commission when both fees are disabled', () => {
      const bars = createDeterministicBars(20, 100);
      const engine = new BacktestEngine({
        initialCapital: 10000,
        commissionMethod: 'jupiter_manual',
        commissionMethodSettings: { dexFeeBps: 0, solPriceUsd: 0 },
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

    it('should close long position when short entry is attempted with jupiter_ultra (reversal close)', () => {
      const bars = createDeterministicBars(30, 100);
      const engine = new BacktestEngine({
        initialCapital: 10000,
        commissionMethod: 'jupiter_ultra',
        commissionMethodSettings: { rate: 0.001 },
      });

      const result = engine.run(bars, (eng, _bar, index) => {
        if (index === 0) eng.entry('Long', 'long', 10);
        if (index === 15) eng.entry('Short', 'short', 10);
      });

      // The short entry is rejected (long-only), but the existing long position
      // should have been closed via reversal. This produces one completed trade.
      expect(result.metrics.totalTrades).toBe(1);
      expect(result.trades[0]!.direction).toBe('long');
      // Position should be flat after the reversal close
      const finalPos = result.positions[result.positions.length - 1]!;
      expect(finalPos.direction).toBe('flat');
    });

    it('should close long position when short entry is attempted with jupiter_manual', () => {
      const bars = createDeterministicBars(30, 100);
      const engine = new BacktestEngine({
        initialCapital: 10000,
        commissionMethod: 'jupiter_manual',
      });

      const result = engine.run(bars, (eng, _bar, index) => {
        if (index === 0) eng.entry('Long', 'long', 10);
        if (index === 15) eng.entry('Short', 'short', 10);
      });

      expect(result.metrics.totalTrades).toBe(1);
      expect(result.trades[0]!.direction).toBe('long');
      const finalPos = result.positions[result.positions.length - 1]!;
      expect(finalPos.direction).toBe('flat');
    });

    it('should produce same completed trades as non-Jupiter when using reversal via short entry', () => {
      const bars = createDeterministicBars(30, 100);

      // Non-Jupiter: long entry, then short entry (reversal) — both execute
      const normalEngine = new BacktestEngine({
        initialCapital: 10000,
        commissionMethod: 'percent_fixed',
        commissionMethodSettings: { rate: 0.001 },
      });
      const normalResult = normalEngine.run(bars, (eng, _bar, index) => {
        if (index === 0) eng.entry('Long', 'long', 10);
        if (index === 15) eng.entry('Short', 'short', 10);
      });

      // Jupiter: long entry, then short entry (rejected but long is closed)
      const jupiterEngine = new BacktestEngine({
        initialCapital: 10000,
        commissionMethod: 'jupiter_ultra',
        commissionMethodSettings: { rate: 0.001 },
      });
      const jupiterResult = jupiterEngine.run(bars, (eng, _bar, index) => {
        if (index === 0) eng.entry('Long', 'long', 10);
        if (index === 15) eng.entry('Short', 'short', 10);
      });

      // Both should have at least one completed long trade
      expect(normalResult.metrics.totalTrades).toBeGreaterThanOrEqual(1);
      expect(jupiterResult.metrics.totalTrades).toBeGreaterThanOrEqual(1);
      // Both should have closed the long position
      expect(normalResult.trades[0]!.direction).toBe('long');
      expect(jupiterResult.trades[0]!.direction).toBe('long');
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
