import { aggregateResults } from '../src/cli/result-aggregator.js';
import type { SymbolResult } from '../src/cli/types.js';

function makeCompletedResult(symbol: string, overrides: Partial<{ netProfitPercent: number; profitFactor: number; maxDrawdownPercent: number; winRate: number; sharpeRatio: number; totalTrades: number; buyHoldReturn: number }> = {}): SymbolResult {
  return {
    symbol,
    status: 'completed',
    metrics: {
      netProfit: overrides.netProfitPercent ?? 100,
      netProfitPercent: overrides.netProfitPercent ?? 10,
      profitFactor: overrides.profitFactor ?? 1.5,
      maxDrawdownPercent: overrides.maxDrawdownPercent ?? 5,
      winRate: overrides.winRate ?? 55,
      sharpeRatio: overrides.sharpeRatio ?? 1.2,
      totalTrades: overrides.totalTrades ?? 40,
      buyHoldReturn: overrides.buyHoldReturn ?? 5,
    },
  };
}

function makeFailedResult(symbol: string, error: string): SymbolResult {
  return { symbol, status: 'failed', error };
}

const DATE_RANGE = { start: '2026-04-14', end: '2026-07-13' };

/** Shorthand to get the first timeframe result from aggregateResults. */
function firstTf(output: ReturnType<typeof aggregateResults>) {
  return output.timeframes[0]!;
}

describe('result-aggregator', () => {
  describe('aggregateResults', () => {
    it('returns empty summary when all symbols fail', () => {
      const results = [makeFailedResult('BTCUSDT', 'compile error')];
      const output = aggregateResults('test.pine', '60', results, DATE_RANGE);
      const tf = firstTf(output);
      expect(tf.crossPairSummary.successfulSymbols).toBe(0);
      expect(tf.crossPairSummary.failedSymbols).toBe(1);
      expect(tf.crossPairSummary.overfittingRisk).toBe('HIGH');
    });

    it('computes correct averages for single symbol', () => {
      const results = [makeCompletedResult('BTCUSDT', { netProfitPercent: 10 })];
      const output = aggregateResults('test.pine', '60', results, DATE_RANGE);
      const tf = firstTf(output);
      expect(tf.crossPairSummary.avgNetProfitPercent).toBe(10);
      expect(tf.crossPairSummary.successfulSymbols).toBe(1);
      expect(tf.crossPairSummary.failedSymbols).toBe(0);
    });

    it('computes correct averages for multiple symbols', () => {
      const results = [
        makeCompletedResult('BTCUSDT', { netProfitPercent: 10 }),
        makeCompletedResult('ETHUSDT', { netProfitPercent: 20 }),
        makeCompletedResult('SOLUSDT', { netProfitPercent: 30 }),
      ];
      const output = aggregateResults('test.pine', '60', results, DATE_RANGE);
      const tf = firstTf(output);
      expect(tf.crossPairSummary.avgNetProfitPercent).toBe(20);
    });

    it('computes LOW overfitting risk when returns are consistent', () => {
      const results = [
        makeCompletedResult('BTCUSDT', { netProfitPercent: 10 }),
        makeCompletedResult('ETHUSDT', { netProfitPercent: 12 }),
        makeCompletedResult('SOLUSDT', { netProfitPercent: 11 }),
      ];
      const output = aggregateResults('test.pine', '60', results, DATE_RANGE);
      const tf = firstTf(output);
      expect(tf.crossPairSummary.overfittingRisk).toBe('LOW');
      expect(tf.crossPairSummary.coefficientOfVariation).toBeLessThan(0.5);
    });

    it('computes HIGH overfitting risk when returns vary wildly', () => {
      const results = [
        makeCompletedResult('BTCUSDT', { netProfitPercent: 100 }),
        makeCompletedResult('ETHUSDT', { netProfitPercent: -50 }),
        makeCompletedResult('SOLUSDT', { netProfitPercent: 10 }),
      ];
      const output = aggregateResults('test.pine', '60', results, DATE_RANGE);
      const tf = firstTf(output);
      expect(tf.crossPairSummary.overfittingRisk).toBe('HIGH');
      expect(tf.crossPairSummary.coefficientOfVariation).toBeGreaterThan(1.5);
    });

    it('identifies best and worst pairs correctly', () => {
      const results = [
        makeCompletedResult('BTCUSDT', { netProfitPercent: 10 }),
        makeCompletedResult('ETHUSDT', { netProfitPercent: 30 }),
        makeCompletedResult('SOLUSDT', { netProfitPercent: 5 }),
      ];
      const output = aggregateResults('test.pine', '60', results, DATE_RANGE);
      const tf = firstTf(output);
      expect(tf.crossPairSummary.bestPair).toBe('ETHUSDT');
      expect(tf.crossPairSummary.worstPair).toBe('SOLUSDT');
    });

    it('skips failed symbols in aggregation', () => {
      const results = [
        makeCompletedResult('BTCUSDT', { netProfitPercent: 10 }),
        makeFailedResult('ETHUSDT', 'compile error'),
        makeCompletedResult('SOLUSDT', { netProfitPercent: 20 }),
      ];
      const output = aggregateResults('test.pine', '60', results, DATE_RANGE);
      const tf = firstTf(output);
      expect(tf.crossPairSummary.successfulSymbols).toBe(2);
      expect(tf.crossPairSummary.failedSymbols).toBe(1);
      expect(tf.crossPairSummary.avgNetProfitPercent).toBe(15);
    });

    it('includes all symbol results in output', () => {
      const results = [
        makeCompletedResult('BTCUSDT'),
        makeFailedResult('ETHUSDT', 'error'),
      ];
      const output = aggregateResults('test.pine', '60', results, DATE_RANGE);
      const tf = firstTf(output);
      expect(tf.symbols).toHaveLength(2);
      expect(tf.symbols[0]!.symbol).toBe('BTCUSDT');
      expect(tf.symbols[1]!.symbol).toBe('ETHUSDT');
    });

    it('sets script and timeframe in output', () => {
      const output = aggregateResults('my_strategy.pine', '240', [], DATE_RANGE);
      expect(output.script).toBe('my_strategy.pine');
      expect(firstTf(output).timeframe).toBe('240');
    });

    it('sets date range in output', () => {
      const output = aggregateResults('test.pine', '60', [], DATE_RANGE);
      expect(output.dateRange).toEqual(DATE_RANGE);
      expect(firstTf(output).dateRange).toEqual(DATE_RANGE);
    });

    it('computes median profit factor correctly', () => {
      const results = [
        makeCompletedResult('BTCUSDT', { profitFactor: 1.0 }),
        makeCompletedResult('ETHUSDT', { profitFactor: 3.0 }),
        makeCompletedResult('SOLUSDT', { profitFactor: 2.0 }),
      ];
      const output = aggregateResults('test.pine', '60', results, DATE_RANGE);
      const tf = firstTf(output);
      expect(tf.crossPairSummary.medianProfitFactor).toBe(2.0);
    });

    it('produces exactly one timeframe entry for single-timeframe call', () => {
      const output = aggregateResults('test.pine', '60', [], DATE_RANGE);
      expect(output.timeframes).toHaveLength(1);
    });
  });
});
