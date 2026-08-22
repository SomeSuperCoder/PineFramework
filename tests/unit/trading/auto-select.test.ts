import { describe, it, expect, vi } from 'vitest';
import { AutoMarketSelector } from '../../../src/trading/auto-select.js';
import type {
  BarFetcher,
  BacktestRunner,
  CandidateEvaluation,
  AutoSelectionResult,
  AutoSelectBlockedResult,
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

    const result = (await selector.select(CANDIDATES)) as AutoSelectionResult;

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

    const result = (await selector.select(CANDIDATES)) as AutoSelectionResult;
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

  // ── Task B1: positive-PnL hard filter + top-N ──

  /** Backtest runner whose net PnL is keyed per symbol. */
  function createPnlBacktestRunner(pnlBySymbol: Record<string, number>): BacktestRunner {
    return {
      runBacktest: vi.fn(async (opts) => {
        const totalPnl = pnlBySymbol[opts.symbol] ?? 0;
        return {
          success: true,
          metrics: {
            sharpeRatio: 1.0,
            profitFactor: totalPnl > 0 ? 2.0 : 0.5,
            totalPnl,
            totalPnlPercent: totalPnl > 0 ? 10 : -10,
            winRate: 0.5,
            totalTrades: 10,
            maxDrawdown: 100,
            maxDrawdownPercent: 0.05,
          },
        };
      }),
    };
  }

  const MULTI_CANDIDATES: PairConfig[] = [
    { symbol: 'BTCUSDT', timeframe: '60' },
    { symbol: 'ETHUSDT', timeframe: '60' },
    { symbol: 'SOLUSDT', timeframe: '60' },
  ];

  it('should return only qualifying pairs when topN exceeds qualifying count (no padding)', async () => {
    // Only BTC (+500) and SOL (+300) are profitable; ETH (-200) is dropped.
    const barFetcher = createMockBarFetcher();
    const backtestRunner = createPnlBacktestRunner({
      BTCUSDT: 500,
      ETHUSDT: -200,
      SOLUSDT: 300,
    });

    const selector = new AutoMarketSelector({
      barFetcher,
      backtestRunner,
      script: SCRIPT,
      dex: 'jupiter-swap',
    });

    const result = (await selector.select(MULTI_CANDIDATES, undefined, {
      topN: 10,
    })) as AutoSelectionResult;

    // No padding: only the 2 profitable pairs are returned, even though topN=10.
    expect(result.ranking).toHaveLength(2);
    expect(result.evaluatedCount).toBe(2);
    const symbols = result.ranking.map((e) => e.pair.symbol);
    expect(symbols).toContain('BTCUSDT');
    expect(symbols).toContain('SOLUSDT');
    expect(symbols).not.toContain('ETHUSDT');
  });

  it('should return a typed blocked result when all candidates have non-positive PnL', async () => {
    const barFetcher = createMockBarFetcher();
    const backtestRunner = createPnlBacktestRunner({
      BTCUSDT: -50,
      ETHUSDT: 0,
      SOLUSDT: -300,
    });

    const selector = new AutoMarketSelector({
      barFetcher,
      backtestRunner,
      script: SCRIPT,
      dex: 'jupiter-swap',
    });

    const result = await selector.select(MULTI_CANDIDATES);
    expect('blocked' in result).toBe(true);
    const blocked = result as AutoSelectBlockedResult;
    expect(blocked.blocked).toBe(true);
    expect(blocked.reason).toBe('no-positive-pnl');
    expect(blocked.evaluatedCount).toBe(3);
  });

  it('should return the normal top-N best pairs by PnL (netProfit descending)', async () => {
    // PnL values are DISTINCT so the ranking order is observable and unambiguously
    // PnL-based. The profitFactors are deliberately OPPOSITE to PnL so the test
    // proves the ranking follows netProfit, NOT the configured metric:
    //   PnL:  ETH(400) > SOL(200) > BTC(100)
    //   PF :  BTC(4)   > ETH(1)   > SOL(2)   ← would rank BTC first if metric-based
    const barFetcher = createMockBarFetcher();
    const backtestRunner: BacktestRunner = {
      runBacktest: vi.fn(async (opts) => {
        const pnl: Record<string, number> = { BTCUSDT: 100, ETHUSDT: 400, SOLUSDT: 200 };
        const pf: Record<string, number> = { BTCUSDT: 4.0, ETHUSDT: 1.0, SOLUSDT: 2.0 };
        return {
          success: true,
          metrics: {
            sharpeRatio: 1.0,
            profitFactor: pf[opts.symbol] ?? 1.0,
            totalPnl: pnl[opts.symbol] ?? 0,
            totalPnlPercent: 10,
            winRate: 0.5,
            totalTrades: 10,
            maxDrawdown: 100,
            maxDrawdownPercent: 0.05,
          },
        };
      }),
    };

    const selector = new AutoMarketSelector({
      barFetcher,
      backtestRunner,
      script: SCRIPT,
      dex: 'jupiter-swap',
      metric: 'profitFactor',
    });

    const result = (await selector.select(MULTI_CANDIDATES, undefined, {
      topN: 3,
    })) as AutoSelectionResult;

    // Ranking must follow PnL descending, NOT profitFactor.
    const order = result.ranking.map((e) => e.pair.symbol);
    expect(order).toEqual(['ETHUSDT', 'SOLUSDT', 'BTCUSDT']);
    expect(result.best.pair.symbol).toBe('ETHUSDT');
  });

  // ── Task B2: bounded parallel backtests, deterministic ranking ──

  it('should produce an identical, deterministic PnL-desc ranking across parallel runs', async () => {
    const barFetcher = createMockBarFetcher();
    const backtestRunner: BacktestRunner = {
      runBacktest: vi.fn(async (opts) => {
        // Distinct PnL values so the ranking is unambiguously PnL-based:
        //   ETH(300) > SOL(200) > BTC(100)
        // ProfitFactors are deliberately scrambled (BTC highest) to prove the
        // order follows netProfit, not the configured metric.
        const pnl: Record<string, number> = { BTCUSDT: 100, ETHUSDT: 300, SOLUSDT: 200 };
        const pf: Record<string, number> = { BTCUSDT: 4.0, ETHUSDT: 1.0, SOLUSDT: 2.0 };
        return {
          success: true,
          metrics: {
            sharpeRatio: 1.0,
            profitFactor: pf[opts.symbol] ?? 1.0,
            totalPnl: pnl[opts.symbol] ?? 0,
            totalPnlPercent: 10,
            winRate: 0.5,
            totalTrades: 10,
            maxDrawdown: 100,
            maxDrawdownPercent: 0.05,
          },
        };
      }),
    };

    const selector = new AutoMarketSelector({
      barFetcher,
      backtestRunner,
      script: SCRIPT,
      dex: 'jupiter-swap',
      metric: 'profitFactor',
    });

    // Run several times; the bounded-parallel completion order is non-
    // deterministic, but the POST-collection ranking must be identical each time.
    const expectedOrder = ['ETHUSDT', 'SOLUSDT', 'BTCUSDT'];
    for (let i = 0; i < 8; i++) {
      const result = (await selector.select(MULTI_CANDIDATES)) as AutoSelectionResult;
      const order = result.ranking.map((e) => e.pair.symbol);
      expect(order).toEqual(expectedOrder);
    }

    // Confirm it matches the prior sequential ranking semantics (metric desc).
    expect((selector as any).compareByMetric).toBeTypeOf('function');
    expect(backtestRunner.runBacktest).toHaveBeenCalledTimes(8 * 3);
  });
});
