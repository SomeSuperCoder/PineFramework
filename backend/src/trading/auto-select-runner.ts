/**
 * Auto-selection runner — concrete BacktestRunner and BarFetcher
 * implementations for the backend.
 *
 * Bridges the framework-level AutoMarketSelector with backend-specific
 * bar fetching (Bybit) and backtest execution (runBacktestPipeline).
 */

import type { Bar } from 'pine-framework';
import type { DexKind } from 'pine-framework';
import type { BarFetcher, BacktestRunner } from 'pine-framework';
import { fetchBars } from '../bybit/fetch-bars.js';
import { runBacktestPipeline } from '../backtest-runner.js';
import { buildBacktestConfigOverride, applyDexFee, type BacktestConfigInput } from '../backtest-config.js';
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
    // Truncate to limit if specified
    if (limit && bars.length > limit) {
      return bars.slice(0, limit);
    }
    return bars;
  }
}

/**
 * Backend BacktestRunner that uses the production backtest pipeline
 * with DEX-consistent fee evaluation.
 */
export class LiveBacktestRunner implements BacktestRunner {
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
      // Build config override with DEX-consistent fees via the shared glue module
      const isJupiterDex =
        options.dex === 'jupiter-ultra' || options.dex === 'jupiter-swap';
      const configInput: BacktestConfigInput = isJupiterDex
        ? { commissionMethod: 'jupiter_ultra' }
        : { commission: 0.1, commissionType: 'percent' };
      const baseOverride = buildBacktestConfigOverride(configInput);
      const override = await applyDexFee(options.symbol, baseOverride, {
        onFailure: 'fallback',
        fallbackCommission: 0.1,
      });

      // Run the backtest pipeline
      const result = runBacktestPipeline({
        script: options.script,
        bars: options.bars,
        configOverride: override,
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
