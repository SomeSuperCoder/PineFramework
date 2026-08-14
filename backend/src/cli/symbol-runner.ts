import type { Bar, ExecutionEngine, StrategyConfig, BacktestWarning } from 'pine-framework';
import { WarningCollector } from 'pine-framework';
import type { SymbolResult } from './types.js';
import type { BacktestOutcome } from '../backtest-result.js';
import { fetchBars } from '../bybit/fetch-bars.js';
import { runBacktestPipeline } from '../backtest-runner.js';
import { applyDexFee } from '../backtest-config.js';
import { toOutcome, toCliSymbolResult, buildDecisionWarnings } from '../backtest-result.js';
import type { ExplicitBacktestOverride } from '../backtest-contract.js';
import { sanitizeExportErrorMessage } from '../backtest-export.js';

/**
 * Data handed to an export sink after a symbol backtest completes successfully.
 * `cliOptions` carries the RAW parsed CLI options (the export's `request` layer);
 * `warnings` is mutable — the sink may append non-fatal warnings before building.
 * Typed per design D4: the export document carries the run's typed diagnostics
 * (BacktestWarning), not free-form strings.
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
  warnings: BacktestWarning[];
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

    // ── Per-run diagnostic collector (design D4 / M6) ──────────────────────
    // The CLI composition root for THIS symbol's run: engine diagnostics
    // (fee-decision, baseline-applied, long-only-suppression) and the live-fee
    // records from applyDexFee flow into the SAME collector via onWarning, so
    // the export document and the CLI summary see one identical warning set.
    const collector = new WarningCollector();

    // ── Live DEX fee merge (Jupiter methods only) ──
    // POLICY (Wise Old Man ruling B): a live-fee fetch failure THROWS for every
    // producer — there is no flat fallback and no invented fee. If the fee
    // cannot be learned, this symbol fails and the multi-symbol batch reports
    // it (the wrapped error names the symbol). M6: the collector's onWarning
    // records the fee decisions (live-fee-cache / live-fee-failure) alongside
    // the pipeline's engine diagnostics.
    const baseOverride = configOverride ? { ...configOverride } : {};
    const override = await applyDexFee(symbol, baseOverride, collector.onWarning);

    const pipelineResult = runBacktestPipeline({
      script,
      bars,
      configOverride: Object.keys(override).length > 0 ? override : undefined,
      onWarning: collector.onWarning,
    });

    if (!pipelineResult.success) {
      const msg = pipelineResult.error ?? 'Execution failed';
      return { symbol, status: 'failed', error: msg };
    }

    const strategyEngine = pipelineResult.engine!.getStrategyEngine();
    const outcome = toOutcome(bars, pipelineResult.engine!);
    if (!outcome || !strategyEngine) {
      return { symbol, status: 'failed', error: 'Missing strategy engine' };
    }

    // ── Fee-decision record (reviewer F3b) ──────────────────────────────────
    // Parity with the API route (routes/backtest.ts calls buildDecisionWarnings
    // at result assembly): EVERY producer run must emit the commission-method
    // decision diagnostic. The engine's own records (commission conflict,
    // baselines) are already in the collector; THIS is the composition-root
    // decision record — which method actually ran, with which effective
    // settings — built from the CLI's normalized override (explicit) and the
    // engine's post-merge config (effective). `configOverride` here is the
    // PRE-applyDexFee override (like the API's job.configOverride), so
    // identical input → identical message + context across producers.
    // Pushed BEFORE the snapshot below, so the export document AND the CLI
    // summary carry the identical record.
    const explicitOverride: ExplicitBacktestOverride | null =
      configOverride?.commissionMethod !== undefined
        ? {
            commissionMethod: configOverride.commissionMethod,
            // Engine settings allow `null` ("no explicit values"); the contract
            // omits instead — same semantics, so drop null to keep the
            // explicit-shape copy-only-present invariant.
            ...(configOverride.commissionMethodSettings !== undefined && configOverride.commissionMethodSettings !== null
              ? { commissionMethodSettings: configOverride.commissionMethodSettings }
              : {}),
          }
        : null;
    for (const w of buildDecisionWarnings(explicitOverride, { ...strategyEngine.getConfig() })) {
      collector.push(w);
    }

    // ── Export sink (optional): a full-data export must NEVER fail the backtest.
    //    A throwing sink is caught, logged, and recorded as a warning. The
    //    engine + fee diagnostics collected above seed the export's warning
    //    list BEFORE the sink builds, so the document carries the run's full
    //    diagnostic set (the sink may append its own non-fatal records).
    const warnings: BacktestWarning[] = [...collector.toArray()];
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
        // Export-sink failure (design D4): typed diagnostic, not a bare string —
        // the export document and the API result payload share the same union.
        // Security S2: the WARNING payload is sanitized — fs errors can embed
        // absolute paths; the raw message is logged to the terminal below.
        warnings.push({
          type: 'export-failure',
          message: `Export failed for ${symbol}: ${sanitizeExportErrorMessage(err)}`,
          context: { symbol },
        });
        console.warn(`[export] ${msg}`);
      }
    }

    const metrics = toCliSymbolResult(outcome);

    return {
      symbol,
      status: 'completed',
      metrics,
      // M6: the run's diagnostics and the effective post-merge config — what
      // actually ran — surface to the CLI summary. `warnings` is the mutable
      // list the export sink saw (engine + fee + any export-failure records).
      warnings: [...warnings],
      effectiveConfig: strategyEngine.getConfig(),
    };
  } catch (err) {
    return {
      symbol,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
