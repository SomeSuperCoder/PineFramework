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

import pLimit from 'p-limit';
import type { Bar } from '../data/bar.js';
import type { PairConfig, DexKind } from './types.js';
import { TRADABLE_PAIRS, type TradablePair } from './token-registry.js';

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
  /** Number of pairs evaluated (post PnL filter). */
  evaluatedCount: number;
  /** Number of pairs that failed evaluation (fetch or backtest error). */
  failedCount: number;
}

/**
 * Result returned when auto-selection cannot proceed because no candidate
 * earned a positive net PnL. This is a typed, non-throwing signal so the
 * caller (bot.ts, task B4) can offer the user a "go back and pick another
 * strategy" flow instead of crashing.
 */
export interface AutoSelectBlockedResult {
  blocked: true;
  reason: 'no-positive-pnl';
  /** Number of candidates that were successfully evaluated. */
  evaluatedCount: number;
  /** Number of pairs that failed evaluation (fetch or backtest error). */
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
  /** Partial ranking of completed evaluations so far. */
  ranking?: Array<{ label: string; metrics: Record<string, number> }>;
}) => void;

/** Maximum bars per backtest (from backend/src/backtest-runner.ts). */
const MAX_BACKTEST_BARS = 1500;

/** Default lookback period in days. */
const DEFAULT_DAYS_BACK = 90;

/**
 * Bounded concurrency for parallel backtests (task B2). Backtests hit the
 * network + the strategy engine, so we cap simultaneous runs to keep latency
 * down without overwhelming upstreams. The cap is deliberately modest — enough
 * parallelism to matter, small enough to avoid rate limits / resource spikes.
 */
const MAX_CONCURRENT_BACKTESTS = 4;

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
  runBacktest(options: { script: string; symbol: string; bars: Bar[]; dex: DexKind }): Promise<{
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

/** Default timeframes for auto-selection (in minutes). */
export const DEFAULT_TIMEFRAMES = ['5', '15', '60', '240'];

/** Default symbols for auto-selection. Derived from canonical TRADABLE_PAIRS. */
export const DEFAULT_SYMBOLS: readonly TradablePair[] = TRADABLE_PAIRS;

/** Generate default candidates from symbols × timeframes. */
export function generateDefaultCandidates(timeframes: string[] = DEFAULT_TIMEFRAMES): PairConfig[] {
  return [...DEFAULT_SYMBOLS].flatMap((symbol) =>
    timeframes.map((timeframe) => ({ symbol, timeframe })),
  );
}

/** Default candidate pairs for auto-selection. */
export const DEFAULT_CANDIDATES: PairConfig[] = generateDefaultCandidates();

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
   * Evaluate and rank all candidate pairs.
   *
   * For each pair:
   * 1. Fetch bar data (with candle progress)
   * 2. Run backtest
   * 3. Collect metrics
   *
   * Backtests run in bounded parallel (task B2) to cut wall-clock time while
   * avoiding too many concurrent runs. Completion order is non-deterministic,
   * so ranking is applied POST-collection to stay identical to the prior
   * sequential logic.
   *
   * Hard gate (task B1): a pair with non-positive net PnL is NEVER selected,
   * even if N is not satisfied. If no candidate earned a positive net PnL the
   * method returns a typed `{ blocked: true }` result (it does NOT throw) so
   * the caller can offer the user an alternative strategy.
   *
   * @param candidates Pairs to evaluate.
   * @param onProgress Optional progress callback.
   * @param options.topN If set, return at most this many best pairs (no
   *   padding when fewer qualify). Omit for the previous "all qualifying"
   *   behavior.
   */
  async select(
    candidates: PairConfig[] = DEFAULT_CANDIDATES,
    onProgress?: SelectionProgressCallback,
    options?: { topN?: number },
  ): Promise<AutoSelectionResult | AutoSelectBlockedResult> {
    const total = candidates.length;
    let completedCount = 0;
    let failedCount = 0;

    // Initialize status map — all candidates start as pending
    const statuses: Record<string, CandidateStatus> = {};
    for (const pair of candidates) {
      const key = `${pair.symbol} (${pair.timeframe})`;
      statuses[key] = { phase: 'fetching', status: 'pending' };
    }

    const emitProgress = (
      pair: PairConfig,
      phase: CandidateStatus['phase'],
      candleProgress?: { fetched: number; total: number },
    ) => {
      onProgress?.({
        current: completedCount,
        total,
        pair,
        phase,
        statuses: { ...statuses },
        candleProgress,
        ranking: evaluations.map((e) => ({ label: e.label, metrics: e.metrics })),
      });
    };

    // All successful evaluations, in arbitrary completion order.
    const evaluations: CandidateEvaluation[] = [];

    // Bounded-concurrency scheduler (task B2): each candidate's fetch+backtest
    // runs inside a limiter slot. Order of resolution is undefined; we collect
    // by pushing into `evaluations` and rank afterwards.
    const limit = pLimit(MAX_CONCURRENT_BACKTESTS);
    const tasks = candidates.map((pair) =>
      limit(async () => {
        const evaluation = await this.evaluateCandidate(pair, statuses, emitProgress);
        // Counters are mutated synchronously (no await between read+write),
        // so parallel continuations cannot interleave the increment.
        if (evaluation) {
          evaluations.push(evaluation);
        } else {
          failedCount++;
        }
        completedCount++;
        emitProgress(pair, 'backtesting');
        return evaluation;
      }),
    );

    await Promise.all(tasks);

    // ── POST-collection ranking (deterministic regardless of completion order) ──
    // Hard PnL filter (task B1): never select a pair that did not make money.
    const qualifying = evaluations.filter((e) => e.metrics.netProfit > 0);
    // B4: rank by PnL (netProfit) DESCENDING — the spec requires worlds to be
    // sorted by PnL and the top-N picked from that order. A stable tiebreaker
    // (the previous metric comparator) keeps the result deterministic when two
    // worlds share a PnL, so the bounded-parallel backtest order cannot affect
    // the final ranking.
    qualifying.sort((a, b) => {
      const diff = b.metrics.netProfit - a.metrics.netProfit;
      if (diff !== 0) return diff;
      return this.compareByMetric(b, a);
    });

    // Nothing evaluated at all (all fetch/backtest failed) — no data to rank.
    if (evaluations.length === 0) {
      throw new Error(
        'Auto-selection failed: no candidate pairs could be evaluated. ' +
          'Check that the strategy compiles and historical data is available.',
      );
    }

    // Some evaluated, but NONE profitable → block (do NOT throw).
    if (qualifying.length === 0) {
      return {
        blocked: true,
        reason: 'no-positive-pnl',
        evaluatedCount: evaluations.length,
        failedCount,
      };
    }

    // Top-N selection (no padding when fewer than N qualify).
    const topN = options?.topN;
    const ranking = topN != null ? qualifying.slice(0, Math.max(0, topN)) : qualifying;

    const best = ranking[0]!;
    return {
      ranking,
      best,
      metric: this.metric,
      evaluatedCount: ranking.length,
      failedCount,
    };
  }

  /**
   * Fetch bars + run a single backtest for one candidate. Extracted from the
   * old per-iteration loop so it can run inside a concurrency limiter (task B2)
   * without duplicating the fetch/backtest/status logic.
   *
   * @returns the evaluation on success, or null when the candidate is dropped
   *   (insufficient/too-many bars, fetch error, or backtest failure).
   */
  private async evaluateCandidate(
    pair: PairConfig,
    statuses: Record<string, CandidateStatus>,
    emitProgress: (
      pair: PairConfig,
      phase: CandidateStatus['phase'],
      candleProgress?: { fetched: number; total: number },
    ) => void,
  ): Promise<CandidateEvaluation | null> {
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
      bars = await this.barFetcher.fetchBars(
        pair.symbol,
        pair.timeframe,
        startDate,
        endDate,
        targetCandles,
      );

      console.log(`[auto-select] Fetched ${bars.length} bars for ${key}`);
      emitProgress(pair, 'fetching', { fetched: bars.length, total: targetCandles });

      if (bars.length < 50) {
        const error = `Insufficient data: ${bars.length} bars (need 50+)`;
        console.log(`[auto-select] Failed: ${key} — ${error}`);
        statuses[key] = { phase: 'fetching', status: 'failed', error };
        emitProgress(pair, 'fetching');
        return null;
      }

      if (bars.length > MAX_BACKTEST_BARS) {
        const error = `Too many bars: ${bars.length} (max ${MAX_BACKTEST_BARS})`;
        console.log(`[auto-select] Failed: ${key} — ${error}`);
        statuses[key] = { phase: 'fetching', status: 'failed', error };
        emitProgress(pair, 'fetching');
        return null;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[auto-select] Failed: ${key} — ${msg}`);
      statuses[key] = { phase: 'fetching', status: 'failed', error: `Bar fetch failed: ${msg}` };
      emitProgress(pair, 'fetching');
      return null;
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
      return null;
    }

    console.log(
      `[auto-select] Complete: ${key} — PF ${result.metrics.profitFactor.toFixed(2)}, PnL ${result.metrics.totalPnlPercent.toFixed(2)}%`,
    );
    statuses[key] = { phase: 'backtesting', status: 'done' };
    const m = result.metrics;
    return {
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
