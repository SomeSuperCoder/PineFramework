/**
 * Auto-selection runner — concrete BacktestRunner and BarFetcher
 * implementations for the backend.
 *
 * Bridges the framework-level AutoMarketSelector with backend-specific
 * bar fetching (Bybit) and backtest execution (runBacktestPipeline).
 */

import type { Bar, DexKind, BarFetcher, BacktestRunner, WarningSink } from 'pine-framework';
import { fetchBars } from '../bybit/fetch-bars.js';
import { runBacktestPipeline } from '../backtest-runner.js';
import { buildBacktestConfigOverride, applyDexFee } from '../backtest-config.js';
import type { ExplicitBacktestOverride } from '../backtest-contract.js';
import { toOutcome, toAutoSelectMetrics } from '../backtest-result.js';

/**
 * Backend BarFetcher that uses Bybit market data.
 */
export class BybitBarFetcher implements BarFetcher {
  async fetchBars(
    symbol: string,
    timeframe: string,
    startDate?: number,
    endDate?: number,
    limit?: number,
  ): Promise<Bar[]> {
    const bars = await fetchBars(symbol, timeframe, startDate, endDate);
    // Truncate to limit if specified.
    // fetchBars now returns GLOBALLY ASCENDING bars. `slice(0, limit)` would
    // keep the OLDEST `limit` bars — auto-select wants the most RECENT
    // `limit` bars (the tail of the window is what the strategy actually
    // trades). Slice from the end to preserve that semantic. (Pre-fix, the
    // buggy newest-page-first order made `slice(0, limit)` accidentally
    // "correct"; the chronological fix makes it wrong, so the slice
    // direction flips.)
    if (limit && bars.length > limit) {
      return bars.slice(-limit);
    }
    return bars;
  }
}

/**
 * Backend BacktestRunner that uses the production backtest pipeline
 * with DEX-consistent fee evaluation.
 */
export class LiveBacktestRunner implements BacktestRunner {
  /**
   * Optional per-run diagnostic sink (design D4 — WarningCollector at the
   * composition root, wired by backend/src/index.ts when the caller wants the
   * auto-select mapping recorded). Absent → the mapping stays silent
   * (NO_WARNING_SINK semantics). The constructor param keeps `new
   * LiveBacktestRunner()` compiling for callers that don't collect warnings.
   */
  constructor(private readonly onWarning?: WarningSink) {}

  async runBacktest(options: {
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
  }> {
    try {
      // Build config override with DEX-consistent fees via the shared glue module.
      // DexKind is 'jupiter-swap' | 'jupiter-ultra' ONLY (the legacy
      // commission/commissionType branch is gone — the legacy fee path is dead,
      // commission-methods spec). D7 mapping (implemented): the live kinds map
      // onto the two canonical commission methods — jupiter-swap → jupiter_manual
      // (venue dexFeeBps only), jupiter-ultra → jupiter_ultra (venue + tiered
      // platform fee). Policy: a live-fee fetch failure THROWS (ruling B) — no
      // fallback fee.
      const commissionMethod = options.dex === 'jupiter-ultra' ? 'jupiter_ultra' : 'jupiter_manual';
      // M6: the auto-select path has no user-explicit method, so record WHICH
      // live dex kind resolved to WHICH canonical method for this run — the
      // `auto-select-method` diagnostic (design D4 union).
      this.onWarning?.({
        type: 'auto-select-method',
        message: `Auto-selected commission method '${commissionMethod}' for live dex kind '${options.dex}'`,
        context: { dexKind: options.dex, commissionMethod, symbol: options.symbol },
      });
      const configInput: ExplicitBacktestOverride = { commissionMethod };
      const baseOverride = buildBacktestConfigOverride(configInput);
      const override = await applyDexFee(options.symbol, baseOverride, this.onWarning);

      // Run the backtest pipeline
      const result = await runBacktestPipeline({
        script: options.script,
        bars: options.bars,
        configOverride: override,
        onWarning: this.onWarning,
      });

      if (!result.success || !result.engine) {
        return {
          success: false,
          metrics: null,
          error: result.error ?? 'Backtest execution failed',
        };
      }

      // Compute metrics from the engine via the shared glue module
      const outcome = toOutcome(options.bars, result.engine);
      if (!outcome) {
        return {
          success: false,
          metrics: null,
          error: 'Script is not a strategy',
        };
      }

      return {
        success: true,
        metrics: toAutoSelectMetrics(outcome),
      };
    } catch (err) {
      return {
        success: false,
        metrics: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
