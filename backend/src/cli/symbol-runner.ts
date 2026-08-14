import type { Bar, ExecutionEngine, StrategyConfig } from 'pine-framework';
import type { SymbolResult } from './types.js';
import type { BacktestOutcome } from '../backtest-result.js';
import { fetchBars } from '../bybit/fetch-bars.js';
import { runBacktestPipeline } from '../backtest-runner.js';
import { applyDexFee } from '../backtest-config.js';
import { toOutcome, toCliSymbolResult } from '../backtest-result.js';

/**
 * Data handed to an export sink after a symbol backtest completes successfully.
 * `cliOptions` carries the RAW parsed CLI options (the export's `request` layer);
 * `warnings` is mutable — the sink may append non-fatal warnings before building.
 */
export interface ExportContext {
  script: string;
  symbol: string;
  timeframe: string;
  startDate?: number;
  endDate?: number;
  cliOptions: Record<string, unknown>;
  configOverride: Partial<StrategyConfig>;
  bars: Bar[];
  engine: ExecutionEngine;
  outcome: BacktestOutcome;
  warnings: string[];
}

/** Optional per-outcome export hook. May be async; failures are swallowed by the caller. */
export type ExportOutcomeSink = (ctx: ExportContext) => void | Promise<void>;

export async function runSymbolBacktest(
  script: string,
  symbol: string,
  timeframe: string,
  startDate?: number,
  endDate?: number,
  configOverride?: Partial<StrategyConfig>,
  cliOptions?: Record<string, unknown>,
  onOutcome?: ExportOutcomeSink,
): Promise<SymbolResult> {
  try {
    const bars = await fetchBars(symbol, timeframe, startDate, endDate);
    if (bars.length === 0) {
      return { symbol, status: 'failed', error: 'No bar data available' };
    }

    // ── Live DEX fee merge (Jupiter methods only) ──
    const baseOverride = configOverride ? { ...configOverride } : {};
    // NOTE (export divergence-hunt): when the DEX-fee fetch falls back, the
    // export sink receives only the POST-fallback override (commission=0.1,
    // commissionType=percent) and cannot detect that the fallback fired — there
    // is no dexFeeBps on a fallback OR on a non-Jupiter method. Surfacing this
    // in export warnings would require applyDexFee to return a fallback flag.
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

    // ── Export sink (optional): a full-data export must NEVER fail the backtest.
    //    A throwing sink is caught, logged, and recorded as a warning.
    const warnings: string[] = [];
    if (onOutcome) {
      try {
        await onOutcome({
          script,
          symbol,
          timeframe,
          startDate,
          endDate,
          cliOptions: cliOptions ?? {},
          configOverride: override,
          bars,
          engine: pipelineResult.engine!,
          outcome,
          warnings,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Export failed for ${symbol}: ${msg}`);
        console.warn(`[export] ${msg}`);
      }
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
