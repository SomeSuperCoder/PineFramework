/**
 * AutoMarketSelector — automatic market selection via historical backtesting.
 *
 * Design (Decision 7):
 * - Delegates to the existing backtest engine for metric computation
 * - Accepts a pluggable data fetcher for bar retrieval
 * - Ranks (Symbol × Timeframe) pairs by a configurable metric
 * - Uses the selected DEX's commission model for consistent evaluation
 *
 * @module trading
 */

import type { Bar } from '../data/bar.js';
import type { PairConfig, DexKind } from './types.js';

// ---- Types ----

/** Ranking metric to optimize for. */
export type RankingMetric = 'sharpe' | 'profitFactor' | 'netProfit' | 'winRate';

/** Result of evaluating a single candidate pair. */
export interface CandidateEvaluation {
  pair: PairConfig;
  /** Metric values for this pair. */
  metrics: {
    sharpeRatio: number;
    profitFactor: number;
    netProfit: number;
    winRate: number;
    totalTrades: number;
    maxDrawdown: number;
  };
  /** Human-readable label. */
  label: string;
}

/** Final ranked result. */
export interface AutoSelectionResult {
  /** Ranked pairs (best first). */
  ranking: CandidateEvaluation[];
  /** The top-ranked pair. */
  best: CandidateEvaluation;
  /** Metric used for ranking. */
  metric: RankingMetric;
  /** Number of pairs evaluated. */
  evaluatedCount: number;
  /** Number of pairs that failed evaluation. */
  failedCount: number;
}

/** Progress callback during auto-selection. */
export type SelectionProgressCallback = (progress: {
  current: number;
  total: number;
  pair: PairConfig;
  phase: 'fetching' | 'backtesting' | 'ranking';
}) => void;

/**
 * Interface for fetching historical bar data.
 * Implemented by the backend using BybitDataSource or similar.
 */
export interface BarFetcher {
  fetchBars(
    symbol: string,
    timeframe: string,
    startDate?: number,
    endDate?: number,
  ): Promise<Bar[]>;
}

/**
 * Interface for running a single backtest.
 * Implemented by the backend using the strategy execution engine.
 */
export interface BacktestRunner {
  runBacktest(options: {
    script: string;
    symbol: string;
    bars: Bar[];
    dex: DexKind;
  }): Promise<{
    success: boolean;
    metrics: {
      sharpeRatio: number;
      profitFactor: number;
      totalPnl: number;
      winRate: number;
      totalTrades: number;
      maxDrawdown: number;
      maxDrawdownPercent: number;
    } | null;
    error?: string;
  }>;
}

// ---- Default candidate pairs ----

/** Default candidate pairs for auto-selection. */
export const DEFAULT_CANDIDATES: PairConfig[] = [
  { symbol: 'BTCUSDT', timeframe: '60' },
  { symbol: 'ETHUSDT', timeframe: '60' },
  { symbol: 'SOLUSDT', timeframe: '60' },
  { symbol: 'BTCUSDT', timeframe: '240' },
  { symbol: 'ETHUSDT', timeframe: '240' },
  { symbol: 'SOLUSDT', timeframe: '240' },
  { symbol: 'BNBUSDT', timeframe: '60' },
  { symbol: 'XRPUSDT', timeframe: '60' },
  { symbol: 'DOGEUSDT', timeframe: '60' },
  { symbol: 'ADAUSDT', timeframe: '60' },
];

// ---- AutoMarketSelector ----

export class AutoMarketSelector {
  private readonly barFetcher: BarFetcher;
  private readonly backtestRunner: BacktestRunner;
  private readonly script: string;
  private readonly dex: DexKind;
  private readonly metric: RankingMetric;
  private readonly defaultDaysBack: number;

  constructor(options: {
    barFetcher: BarFetcher;
    backtestRunner: BacktestRunner;
    script: string;
    dex: DexKind;
    metric?: RankingMetric;
    defaultDaysBack?: number;
  }) {
    this.barFetcher = options.barFetcher;
    this.backtestRunner = options.backtestRunner;
    this.script = options.script;
    this.dex = options.dex;
    this.metric = options.metric ?? 'profitFactor';
    this.defaultDaysBack = options.defaultDaysBack ?? 90;
  }

  /**
   * Evaluate and rank all candidate pairs.
   */
  async select(
    candidates: PairConfig[] = DEFAULT_CANDIDATES,
    onProgress?: SelectionProgressCallback,
  ): Promise<AutoSelectionResult> {
    const evaluations: CandidateEvaluation[] = [];
    let failedCount = 0;

    const endDate = Date.now();
    const startDate = endDate - this.defaultDaysBack * 24 * 60 * 60 * 1000;

    for (let i = 0; i < candidates.length; i++) {
      const pair = candidates[i]!;

      // Phase 1: Fetch data
      onProgress?.({ current: i, total: candidates.length, pair, phase: 'fetching' });
      let bars: Bar[];
      try {
        bars = await this.barFetcher.fetchBars(pair.symbol, pair.timeframe, startDate, endDate);
      } catch {
        failedCount++;
        continue;
      }

      if (bars.length < 50) {
        // Not enough data to evaluate
        failedCount++;
        continue;
      }

      // Phase 2: Run backtest
      onProgress?.({ current: i, total: candidates.length, pair, phase: 'backtesting' });
      const result = await this.backtestRunner.runBacktest({
        script: this.script,
        symbol: pair.symbol,
        bars,
        dex: this.dex,
      });

      if (!result.success || !result.metrics) {
        failedCount++;
        continue;
      }

      // Phase 3: Record evaluation
      evaluations.push({
        pair,
        metrics: {
          sharpeRatio: result.metrics.sharpeRatio,
          profitFactor: result.metrics.profitFactor,
          netProfit: result.metrics.totalPnl,
          winRate: result.metrics.winRate,
          totalTrades: result.metrics.totalTrades,
          maxDrawdown: result.metrics.maxDrawdown,
        },
        label: `${pair.symbol} (${pair.timeframe})`,
      });
    }

    // Rank by configured metric
    evaluations.sort((a, b) => this.compareByMetric(b, a));

    const best = evaluations[0];
    if (!best) {
      throw new Error(
        'Auto-selection failed: no candidate pairs could be evaluated. ' +
        'Check that the strategy compiles and historical data is available.',
      );
    }

    return {
      ranking: evaluations,
      best,
      metric: this.metric,
      evaluatedCount: evaluations.length,
      failedCount,
    };
  }

  /** Get the metric value from a candidate evaluation. */
  getMetricValue(evaluation: CandidateEvaluation): number {
    switch (this.metric) {
      case 'sharpe':
        return evaluation.metrics.sharpeRatio;
      case 'profitFactor':
        return evaluation.metrics.profitFactor;
      case 'netProfit':
        return evaluation.metrics.netProfit;
      case 'winRate':
        return evaluation.metrics.winRate;
    }
  }

  /** Compare two evaluations by the configured metric (for sorting). */
  private compareByMetric(a: CandidateEvaluation, b: CandidateEvaluation): number {
    return this.getMetricValue(a) - this.getMetricValue(b);
  }
}
