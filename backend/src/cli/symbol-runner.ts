import { fetchDexFeeBps, type StrategyConfig } from 'pine-framework';
import type { SymbolResult, SymbolMetrics } from './types.js';
import { fetchBars } from '../bybit/fetch-bars.js';
import { runBacktestPipeline, computeBacktestMetrics } from '../backtest-runner.js';

function isJupiterMethod(method: unknown): method is 'jupiter_manual' | 'jupiter_ultra' {
  return method === 'jupiter_manual' || method === 'jupiter_ultra';
}

export async function runSymbolBacktest(
  script: string,
  symbol: string,
  timeframe: string,
  startDate?: number,
  endDate?: number,
  configOverride?: Partial<StrategyConfig>,
): Promise<SymbolResult> {
  try {
    const bars = await fetchBars(symbol, timeframe, startDate, endDate);
    if (bars.length === 0) {
      return { symbol, status: 'failed', error: 'No bar data available' };
    }

    // ── Live DEX fee fetch (Jupiter methods only) ──
    const effectiveConfig = configOverride ? { ...configOverride } : {};
    if (symbol && isJupiterMethod(effectiveConfig.commissionMethod)) {
      try {
        const { dexFeeBps, source, dexLabel } = await fetchDexFeeBps(symbol);
        const existingSettings = (effectiveConfig.commissionMethodSettings as Record<string, unknown>) ?? {};
        effectiveConfig.commissionMethodSettings = { ...existingSettings, dexFeeBps };
        process.stderr.write(
          `  ℹ ${symbol}: using DEX fee ${dexFeeBps} bps (source: ${source})${dexLabel ? ' via ' + dexLabel : ''}\n`,
        );
      } catch (err) {
        process.stderr.write(
          `  ⚠ ${symbol}: failed to fetch live DEX fee — ${err instanceof Error ? err.message : String(err)}\n`,
        );
        throw err;
      }
    }

    const pipelineResult = runBacktestPipeline({
      script,
      bars,
      configOverride: Object.keys(effectiveConfig).length > 0 ? effectiveConfig : undefined,
    });

    if (!pipelineResult.success) {
      return { symbol, status: 'failed', error: pipelineResult.error || 'Execution failed' };
    }

    const metricsResult = computeBacktestMetrics(bars, pipelineResult.engine!);
    if (!metricsResult) {
      return { symbol, status: 'failed', error: 'Missing strategy engine' };
    }

    const sanitize = (v: number) => (Number.isFinite(v) ? v : 0);

    const resultMetrics: SymbolMetrics = {
      netProfit: sanitize(metricsResult.metrics.totalPnl),
      netProfitPercent: sanitize(metricsResult.metrics.totalPnlPercent),
      profitFactor: sanitize(metricsResult.metrics.profitFactor),
      maxDrawdownPercent: sanitize(metricsResult.metrics.maxDrawdownPercent),
      winRate: sanitize(metricsResult.metrics.winRate),
      sharpeRatio: sanitize(metricsResult.metrics.sharpeRatio),
      totalTrades: metricsResult.metrics.totalTrades,
      buyHoldReturn: Math.round(metricsResult.buyHoldReturn * 100) / 100,
    };

    return { symbol, status: 'completed', metrics: resultMetrics };
  } catch (err) {
    return {
      symbol,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}


