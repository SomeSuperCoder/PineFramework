import { describe, it, expect, vi } from 'vitest';
import { AutoMarketSelector } from '../../../src/trading/auto-select.js';
import type {
  BarFetcher,
  BacktestRunner,
  CandidateEvaluation,
} from '../../../src/trading/auto-select.js';
import type { PairConfig } from '../../../src/trading/types.js';

function createMockBarFetcher(): BarFetcher {
  return {
    fetchBars: vi.fn().mockResolvedValue(
      Array.from({ length: 100 }, (_, i) => ({
        timestamp: Date.now() - (100 - i) * 3600000,
        open: 100 + Math.random() * 10,
        high: 105 + Math.random() * 10,
        low: 95 + Math.random() * 10,
        close: 100 + Math.random() * 10,
        volume: 1000 + Math.random() * 500,
      })),
    ),
  };
}

function createMockBacktestRunner(): BacktestRunner {
  return {
    runBacktest: vi.fn().mockResolvedValue({
      success: true,
      metrics: {
        sharpeRatio: 1.5,
        profitFactor: 2.0,
        totalPnl: 500,
        totalPnlPercent: 50,
        winRate: 0.6,
        totalTrades: 50,
        maxDrawdown: 200,
        maxDrawdownPercent: 0.05,
      },
    }),
  };
}

const SCRIPT =
  '//@version=6\nstrategy("test")\nif (close > open)\n\tstrategy.entry("long", strategy.long)\n';
const CANDIDATES: PairConfig[] = [
  { symbol: 'BTCUSDT', timeframe: '60' },
  { symbol: 'ETHUSDT', timeframe: '60' },
];

describe('AutoMarketSelector', () => {
  it('should evaluate and rank candidates', async () => {
    const barFetcher = createMockBarFetcher();
    const backtestRunner = createMockBacktestRunner();

    const selector = new AutoMarketSelector({
      barFetcher,
      backtestRunner,
      script: SCRIPT,
      dex: 'jupiter-swap',
      metric: 'profitFactor',
    });

    const result = await selector.select(CANDIDATES);

    expect(result.evaluatedCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(result.best).toBeDefined();
    expect(result.ranking).toHaveLength(2);
    expect(result.metric).toBe('profitFactor');
    expect(barFetcher.fetchBars).toHaveBeenCalledTimes(2);
    expect(backtestRunner.runBacktest).toHaveBeenCalledTimes(2);
  });

  it('should handle empty candidates gracefully', async () => {
    const barFetcher = createMockBarFetcher();
    const backtestRunner = createMockBacktestRunner();

    const selector = new AutoMarketSelector({
      barFetcher,
      backtestRunner,
      script: SCRIPT,
      dex: 'jupiter-swap',
    });

    // Use an empty candidate list so no bars are fetched and no backtests run
    // This will throw because there are no evaluations
    await expect(selector.select([])).rejects.toThrow('Auto-selection failed');
  });

  it('should handle fetch failures', async () => {
    const barFetcher: BarFetcher = {
      fetchBars: vi.fn().mockRejectedValue(new Error('API error')),
    };
    const backtestRunner = createMockBacktestRunner();

    const selector = new AutoMarketSelector({
      barFetcher,
      backtestRunner,
      script: SCRIPT,
      dex: 'jupiter-swap',
    });

    await expect(selector.select(CANDIDATES)).rejects.toThrow('Auto-selection failed');
  });

  it('should rank by different metrics', async () => {
    const barFetcher = createMockBarFetcher();
    const backtestRunner = {
      runBacktest: vi
        .fn()
        .mockResolvedValueOnce({
          success: true,
          metrics: {
            sharpeRatio: 2.0,
            profitFactor: 1.5,
            totalPnl: 300,
            totalPnlPercent: 30,
            winRate: 0.7,
            totalTrades: 40,
            maxDrawdown: 100,
            maxDrawdownPercent: 0.03,
          },
        })
        .mockResolvedValueOnce({
          success: true,
          metrics: {
            sharpeRatio: 1.0,
            profitFactor: 3.0,
            totalPnl: 500,
            totalPnlPercent: 50,
            winRate: 0.5,
            totalTrades: 60,
            maxDrawdown: 200,
            maxDrawdownPercent: 0.05,
          },
        }),
    };

    // Rank by profitFactor
    const selector = new AutoMarketSelector({
      barFetcher,
      backtestRunner,
      script: SCRIPT,
      dex: 'jupiter-swap',
      metric: 'profitFactor',
    });

    const result = await selector.select(CANDIDATES);
    // Second candidate has higher profitFactor (3.0 > 1.5)
    expect(result.best.pair.symbol).toBe('ETHUSDT');
  });

  it('should get metric values correctly', () => {
    const evaluation: CandidateEvaluation = {
      pair: { symbol: 'BTCUSDT', timeframe: '60' },
      metrics: {
        sharpeRatio: 2.0,
        profitFactor: 3.0,
        netProfit: 500,
        totalPnlPercent: 50,
        winRate: 0.6,
        totalTrades: 50,
        maxDrawdown: 100,
      },
      label: 'BTCUSDT (60)',
    };

    const selector = new AutoMarketSelector({
      barFetcher: createMockBarFetcher(),
      backtestRunner: createMockBacktestRunner(),
      script: SCRIPT,
      dex: 'jupiter-swap',
      metric: 'profitFactor',
    });

    // Access private method via bracket notation
    const getMetric = (selector as any).getMetricValue.bind(selector);
    expect(getMetric(evaluation)).toBe(3.0);

    // Test with sharpe
    const selectorSharpe = new AutoMarketSelector({
      barFetcher: createMockBarFetcher(),
      backtestRunner: createMockBacktestRunner(),
      script: SCRIPT,
      dex: 'jupiter-swap',
      metric: 'sharpe',
    });
    const getMetricSharpe = (selectorSharpe as any).getMetricValue.bind(selectorSharpe);
    expect(getMetricSharpe(evaluation)).toBe(2.0);
  });

  it('should call progress callback with statuses map', async () => {
    const barFetcher = createMockBarFetcher();
    const backtestRunner = createMockBacktestRunner();
    const onProgress = vi.fn();

    const selector = new AutoMarketSelector({
      barFetcher,
      backtestRunner,
      script: SCRIPT,
      dex: 'jupiter-swap',
    });

    await selector.select(CANDIDATES, onProgress);

    expect(onProgress).toHaveBeenCalled();
    // First call should have statuses map
    const firstCall = onProgress.mock.calls[0][0];
    expect(firstCall.statuses).toBeDefined();
    expect(Object.keys(firstCall.statuses)).toHaveLength(2);
    expect(firstCall.statuses['BTCUSDT (60)']).toBeDefined();
    expect(firstCall.statuses['ETHUSDT (60)']).toBeDefined();
  });
});
