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

/** Status of a single candidate in the progress map. */
export interface CandidateStatus {
  phase: 'fetching' | 'backtesting' | 'ranking';
  status: 'pending' | 'active' | 'done' | 'failed';
}

/** Progress callback during auto-selection. */
export type SelectionProgressCallback = (progress: {
  current: number;
  total: number;
  pair: PairConfig;
  phase: 'fetching' | 'backtesting' | 'ranking';
  /** Per-pair status map keyed by "SYMBOL (timeframe)". */
  statuses: Record<string, CandidateStatus>;
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

// ---- Parallel execution utility ----

/**
 * Run async tasks with bounded concurrency.
 * Returns results in the same order as the input tasks.
 */
export async function runParallel<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<Array<{ success: boolean; value?: T; error?: unknown }>> {
  const results: Array<{ success: boolean; value?: T; error?: unknown }> = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const i = nextIndex++;
      const task = tasks[i]!;
      try {
        const value = await task();
        results[i] = { success: true, value };
      } catch (error) {
        results[i] = { success: false, error };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
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
  private readonly concurrency: number;

  constructor(options: {
    barFetcher: BarFetcher;
    backtestRunner: BacktestRunner;
    script: string;
    dex: DexKind;
    metric?: RankingMetric;
    defaultDaysBack?: number;
    concurrency?: number;
  }) {
    this.barFetcher = options.barFetcher;
    this.backtestRunner = options.backtestRunner;
    this.script = options.script;
    this.dex = options.dex;
    this.metric = options.metric ?? 'profitFactor';
    this.defaultDaysBack = options.defaultDaysBack ?? 90;
    this.concurrency = options.concurrency ?? 4;
  }

  /**
   * Evaluate and rank all candidate pairs using parallel execution.
   *
   * Phase 1: Fetch bar data for all candidates in parallel (bounded by concurrency).
   * Phase 2: Run backtests for all candidates with data in parallel (bounded by concurrency).
   * Phase 3: Rank results by configured metric.
   */
  async select(
    candidates: PairConfig[] = DEFAULT_CANDIDATES,
    onProgress?: SelectionProgressCallback,
  ): Promise<AutoSelectionResult> {
    const total = candidates.length;
    let completedCount = 0;

    // Initialize status map — all candidates start as pending for fetching
    const statuses: Record<string, CandidateStatus> = {};
    for (const pair of candidates) {
      const key = `${pair.symbol} (${pair.timeframe})`;
      statuses[key] = { phase: 'fetching', status: 'pending' };
    }

    const emitProgress = (pair: PairConfig, phase: CandidateStatus['phase']) => {
      onProgress?.({
        current: completedCount,
        total,
        pair,
        phase,
        statuses: { ...statuses },
      });
    };

    const endDate = Date.now();
    const startDate = endDate - this.defaultDaysBack * 24 * 60 * 60 * 1000;

    // ── Phase 1: Parallel bar fetch ──
    const barResults = await runParallel(
      candidates.map((pair, i) => async () => {
        const key = `${pair.symbol} (${pair.timeframe})`;
        statuses[key] = { phase: 'fetching', status: 'active' };
        emitProgress(pair, 'fetching');

        try {
          const bars = await this.barFetcher.fetchBars(pair.symbol, pair.timeframe, startDate, endDate);
          if (bars.length < 50) {
            statuses[key] = { phase: 'fetching', status: 'failed' };
            completedCount++;
            emitProgress(pair, 'fetching');
            return null;
          }
          statuses[key] = { phase: 'backtesting', status: 'pending' };
          emitProgress(pair, 'fetching');
          return bars;
        } catch {
          statuses[key] = { phase: 'fetching', status: 'failed' };
          completedCount++;
          emitProgress(pair, 'fetching');
          return null;
        }
      }),
      this.concurrency,
    );

    // Collect successful fetches for phase 2
    const backtestTasks: Array<{ pair: PairConfig; bars: Bar[]; index: number }> = [];
    for (let i = 0; i < candidates.length; i++) {
      const result = barResults[i]!;
      if (result.success && result.value) {
        backtestTasks.push({ pair: candidates[i]!, bars: result.value, index: i });
      }
    }

    // ── Phase 2: Parallel backtest ──
    const backtestResults = await runParallel(
      backtestTasks.map(({ pair, bars }) => async () => {
        const key = `${pair.symbol} (${pair.timeframe})`;
        statuses[key] = { phase: 'backtesting', status: 'active' };
        emitProgress(pair, 'backtesting');

        const result = await this.backtestRunner.runBacktest({
          script: this.script,
          symbol: pair.symbol,
          bars,
          dex: this.dex,
        });

        if (!result.success || !result.metrics) {
          statuses[key] = { phase: 'backtesting', status: 'failed' };
        } else {
          statuses[key] = { phase: 'backtesting', status: 'done' };
        }
        completedCount++;
        emitProgress(pair, 'backtesting');

        return result;
      }),
      this.concurrency,
    );

    // ── Phase 3: Collect and rank ──
    const evaluations: CandidateEvaluation[] = [];
    let failedCount = 0;

    for (let i = 0; i < backtestTasks.length; i++) {
      const { pair } = backtestTasks[i]!;
      const result = backtestResults[i]!;

      if (!result.success || !result.value?.success || !result.value.metrics) {
        failedCount++;
        continue;
      }

      const m = result.value.metrics;
      evaluations.push({
        pair,
        metrics: {
          sharpeRatio: m.sharpeRatio,
          profitFactor: m.profitFactor,
          netProfit: m.totalPnl,
          winRate: m.winRate,
          totalTrades: m.totalTrades,
          maxDrawdown: m.maxDrawdown,
        },
        label: `${pair.symbol} (${pair.timeframe})`,
      });
    }

    // Count failed from fetch phase too
    failedCount += candidates.length - backtestTasks.length;

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
