import type { StrategyConfig } from 'pine-framework';
import type { SymbolResult } from './types.js';
import { fetchBars } from '../bybit/fetch-bars.js';
import { runBacktestPipeline } from '../backtest-runner.js';
import { applyDexFee } from '../backtest-config.js';
import { toOutcome, toCliSymbolResult } from '../backtest-result.js';

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

    // ── Live DEX fee merge (Jupiter methods only) ──
    const baseOverride = configOverride ? { ...configOverride } : {};
    const override = await applyDexFee(symbol, baseOverride, {
      onFailure: 'fallback',
      fallbackCommission: 0.1,
    });

    const pipelineResult = runBacktestPipeline({
      script,
      bars,
      configOverride: Object.keys(override).length > 0 ? override : undefined,
    });

    if (!pipelineResult.success) {
      const msg = pipelineResult.error ?? 'Execution failed';
      return { symbol, status: 'failed', error: msg };
    }

    const outcome = toOutcome(bars, pipelineResult.engine!);
    if (!outcome) {
      return { symbol, status: 'failed', error: 'Missing strategy engine' };
    }

    const metrics = toCliSymbolResult(outcome);

    return {
      symbol,
      status: 'completed',
      metrics,
    };
  } catch (err) {
    return {
      symbol,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}


