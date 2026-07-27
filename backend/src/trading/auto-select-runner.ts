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
import { fetchDexFeeBps } from 'pine-framework/strategy/jupiter-fee-fetcher';
import { fetchBars } from '../bybit/fetch-bars.js';
import { runBacktestPipeline } from '../backtest-runner.js';

/**
 * Backend BarFetcher that uses Bybit market data.
 */
export class BybitBarFetcher implements BarFetcher {
  async fetchBars(
    symbol: string,
    timeframe: string,
    startDate?: number,
    endDate?: number,
  ): Promise<Bar[]> {
    return fetchBars(symbol, timeframe, startDate, endDate);
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
      winRate: number;
      totalTrades: number;
      maxDrawdown: number;
      maxDrawdownPercent: number;
    } | null;
    error?: string;
  }> {
    try {
      // Build config override with DEX-consistent fees
      const configOverride: Record<string, unknown> = {};

      // Fetch DEX fee for this symbol
      if (options.dex === 'jupiter-ultra' || options.dex === 'jupiter-swap') {
        try {
          const { dexFeeBps } = await fetchDexFeeBps(options.symbol);
          configOverride.commissionMethod = 'jupiter_ultra';
          configOverride.commissionMethodSettings = { dexFeeBps };
        } catch {
          // Fall back to default fees if DEX fee fetch fails
          configOverride.commission = 0.1;
          configOverride.commissionType = 'percent';
        }
      } else {
        configOverride.commission = 0.1;
        configOverride.commissionType = 'percent';
      }

      // Run the backtest pipeline
      const result = runBacktestPipeline({
        script: options.script,
        bars: options.bars,
        configOverride: configOverride as any,
      });

      if (!result.success || !result.engine) {
        return {
          success: false,
          metrics: null,
          error: result.error ?? 'Backtest execution failed',
        };
      }

      // Compute metrics from the engine
      const strategyEngine = result.engine.getStrategyEngine();
      if (!strategyEngine) {
        return {
          success: false,
          metrics: null,
          error: 'Script is not a strategy',
        };
      }

      const metrics = strategyEngine.getMetrics();

      return {
        success: true,
        metrics: {
          sharpeRatio: metrics.sharpeRatio,
          profitFactor: metrics.profitFactor,
          totalPnl: metrics.totalPnl,
          winRate: metrics.winRate,
          totalTrades: metrics.totalTrades,
          maxDrawdown: metrics.maxDrawdown,
          maxDrawdownPercent: metrics.maxDrawdownPercent,
        },
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
