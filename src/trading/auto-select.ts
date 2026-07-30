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
    totalPnlPercent: number;
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
  /** Human-readable error message when status is 'failed'. */
  error?: string;
}

/** Progress callback during auto-selection. */
export type SelectionProgressCallback = (progress: {
  current: number;
  total: number;
  pair: PairConfig;
  phase: 'fetching' | 'backtesting' | 'ranking';
  /** Per-pair status map keyed by "SYMBOL (timeframe)". */
  statuses: Record<string, CandidateStatus>;
  /** Per-pair candle fetch progress (only during fetching phase). */
  candleProgress?: { fetched: number; total: number };
}) => void;

/** Maximum bars per backtest (from backend/src/backtest-runner.ts). */
const MAX_BACKTEST_BARS = 1500;

/** Default lookback period in days. */
const DEFAULT_DAYS_BACK = 90;

/**
 * Compute the number of candles to fetch for a given timeframe.
 * Formula: min(1500, floor(90_days * 24 / timeframe_hours))
 */
function computeCandleCount(timeframe: string): number {
  const tfHours = Number(timeframe) / 60;
  const candlesIn90Days = Math.floor((DEFAULT_DAYS_BACK * 24) / tfHours);
  return Math.min(MAX_BACKTEST_BARS, candlesIn90Days);
}

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
    limit?: number,
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
      totalPnlPercent: number;
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

  constructor(options: {
    barFetcher: BarFetcher;
    backtestRunner: BacktestRunner;
    script: string;
    dex: DexKind;
    metric?: RankingMetric;
  }) {
    this.barFetcher = options.barFetcher;
    this.backtestRunner = options.backtestRunner;
    this.script = options.script;
    this.dex = options.dex;
    this.metric = options.metric ?? 'profitFactor';
  }

  /**
   * Evaluate and rank all candidate pairs sequentially.
   *
   * For each pair:
   * 1. Fetch bar data (with candle progress)
   * 2. Run backtest
   * 3. Collect metrics
   *
   * Finally: Rank results by configured metric.
   */
  async select(
    candidates: PairConfig[] = DEFAULT_CANDIDATES,
    onProgress?: SelectionProgressCallback,
  ): Promise<AutoSelectionResult> {
    const total = candidates.length;
    let completedCount = 0;
    let failedCount = 0;

    // Initialize status map — all candidates start as pending
    const statuses: Record<string, CandidateStatus> = {};
    for (const pair of candidates) {
      const key = `${pair.symbol} (${pair.timeframe})`;
      statuses[key] = { phase: 'fetching', status: 'pending' };
    }

    const emitProgress = (pair: PairConfig, phase: CandidateStatus['phase'], candleProgress?: { fetched: number; total: number }) => {
      onProgress?.({
        current: completedCount,
        total,
        pair,
        phase,
        statuses: { ...statuses },
        candleProgress,
      });
    };

    // Sequential evaluation: one pair at a time
    const evaluations: CandidateEvaluation[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const pair = candidates[i]!;
      const key = `${pair.symbol} (${pair.timeframe})`;
      const targetCandles = computeCandleCount(pair.timeframe);

      // ── Fetch phase ──
      console.log(`[auto-select] Fetching bars for ${key}...`);
      statuses[key] = { phase: 'fetching', status: 'active' };
      emitProgress(pair, 'fetching', { fetched: 0, total: targetCandles });

      let bars: Bar[];
      try {
        const endDate = Date.now();
        const startDate = endDate - DEFAULT_DAYS_BACK * 24 * 60 * 60 * 1000;
        bars = await this.barFetcher.fetchBars(pair.symbol, pair.timeframe, startDate, endDate, targetCandles);

        console.log(`[auto-select] Fetched ${bars.length} bars for ${key}`);
        // Update with actual fetched count
        emitProgress(pair, 'fetching', { fetched: bars.length, total: targetCandles });

        if (bars.length < 50) {
          const error = `Insufficient data: ${bars.length} bars (need 50+)`;
          console.log(`[auto-select] Failed: ${key} — ${error}`);
          statuses[key] = { phase: 'fetching', status: 'failed', error };
          completedCount++;
          failedCount++;
          emitProgress(pair, 'fetching');
          continue;
        }

        if (bars.length > MAX_BACKTEST_BARS) {
          const error = `Too many bars: ${bars.length} (max ${MAX_BACKTEST_BARS})`;
          console.log(`[auto-select] Failed: ${key} — ${error}`);
          statuses[key] = { phase: 'fetching', status: 'failed', error };
          completedCount++;
          failedCount++;
          emitProgress(pair, 'fetching');
          continue;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[auto-select] Failed: ${key} — ${msg}`);
        statuses[key] = { phase: 'fetching', status: 'failed', error: `Bar fetch failed: ${msg}` };
        completedCount++;
        failedCount++;
        emitProgress(pair, 'fetching');
        continue;
      }

      // ── Backtest phase ──
      console.log(`[auto-select] Running backtest for ${key}...`);
      statuses[key] = { phase: 'backtesting', status: 'active' };
      emitProgress(pair, 'backtesting');

      const result = await this.backtestRunner.runBacktest({
        script: this.script,
        symbol: pair.symbol,
        bars,
        dex: this.dex,
      });

      if (!result.success || !result.metrics) {
        const error = result.error ?? 'Backtest execution failed';
        console.log(`[auto-select] Failed: ${key} — ${error}`);
        statuses[key] = { phase: 'backtesting', status: 'failed', error };
        failedCount++;
      } else {
        console.log(`[auto-select] Complete: ${key} — PF ${result.metrics.profitFactor.toFixed(2)}, PnL ${result.metrics.totalPnlPercent.toFixed(2)}%`);
        statuses[key] = { phase: 'backtesting', status: 'done' };
        const m = result.metrics;
        evaluations.push({
          pair,
          metrics: {
            sharpeRatio: m.sharpeRatio,
            profitFactor: m.profitFactor,
            netProfit: m.totalPnl,
            totalPnlPercent: m.totalPnlPercent,
            winRate: m.winRate,
            totalTrades: m.totalTrades,
            maxDrawdown: m.maxDrawdown,
          },
          label: `${pair.symbol} (${pair.timeframe})`,
        });
      }

      completedCount++;
      emitProgress(pair, 'backtesting');
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
