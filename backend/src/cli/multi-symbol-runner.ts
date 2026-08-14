import { readFileSync } from 'fs';
import type { StrategyConfig } from 'pine-framework';
import type { CliOptions, SymbolResult } from './types.js';
import { buildBacktestConfigOverride } from '../backtest-config.js';
import { normalizeExplicitOverride } from '../normalize-explicit-config.js';
import {
  resolveDateRange,
  toUtcDateString,
  type DateRangeResolution,
} from '../backtest-dates.js';
import { writeExportManifest, type ExportRun } from '../backtest-export.js';
import { runSymbolBacktest, type ExportOutcomeSink } from './symbol-runner.js';

export async function runMultiSymbolBacktest(
  options: CliOptions,
  onOutcome?: ExportOutcomeSink,
  exportRun?: ExportRun,
): Promise<SymbolResult[]> {
  const script = readFileSync(options.scriptPath, 'utf-8');

  // ── Resolve the fetch window ONCE via the shared UTC-midnight resolver ─────
  // The CLI pre-resolves in backtest-cli.ts and hands the range in via
  // options.resolvedDateRange (single resolution shared by fetch + display);
  // direct callers (tests/embedders) fall back to resolveCliDateRange here.
  // The runner NEVER computes a window itself — the raw-ms now-anchored block
  // this replaces is what caused the 720-vs-721 bar drift.
  const resolved =
    options.resolvedDateRange !== undefined
      ? { ok: true as const, value: options.resolvedDateRange }
      : resolveCliDateRange(options);
  if (!resolved.ok) {
    const detail = resolved.errors.map((e) => `${e.field ?? 'body'}: ${e.message}`).join('; ');
    throw new Error(`Invalid date range: ${detail}`);
  }
  const { startDate: startDateMs, endDate: endDateMs } = resolved.value;

  const configOverride = buildConfig(options);

  const results: SymbolResult[] = [];
  const total = options.symbols.length;

  for (let i = 0; i < total; i++) {
    const symbol = options.symbols[i]!;
    process.stderr.write(`[${i + 1}/${total}] Backtesting ${symbol}...\n`);

    const result = await runSymbolBacktest(
      script,
      symbol,
      options.timeframe,
      startDateMs,
      endDateMs,
      configOverride,
      { ...options },
      onOutcome,
    );

    results.push({
      ...result,
      // M6 seam: the resolved UTC-midnight range this run actually fetched —
      // identical for every symbol; the CLI config summary reads it from here.
      resolvedRange: resolved.value,
    });

    if (result.status === 'failed') {
      const errMsg = result.error ?? 'Unknown error';
      process.stderr.write(`  ✗ ${symbol}: ${errMsg}\n`);
    } else {
      process.stderr.write(
        `  ✓ ${symbol}: PnL ${result.metrics!.netProfitPercent >= 0 ? '+' : ''}${result.metrics!.netProfitPercent.toFixed(2)}%  PF ${result.metrics!.profitFactor.toFixed(2)}  WinRate ${result.metrics!.winRate.toFixed(1)}%\n`,
      );
    }
  }

  // Manifest: written at the point the multi-symbol run completes. files/symbols
  // accumulate across timeframes via the shared ExportRun state, so the final
  // manifest lists every export of the invocation. A manifest failure never
  // fails the backtest (exports are best-effort by design).
  if (exportRun && exportRun.files.length > 0) {
    try {
      await writeExportManifest(
        {
          runId: exportRun.runId,
          source: exportRun.source,
          files: exportRun.files,
          symbols: [...exportRun.symbols],
        },
        exportRun.dir,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[export] Failed to write manifest: ${msg}`);
    }
  }

  return results;
}

/**
 * Resolve the CLI's date input through the shared UTC-midnight resolver —
 * the SINGLE authority for the daysBack-vs-explicit-dates precedence, used by
 * BOTH the fetch path (this runner's fallback) and the display path
 * (backtest-cli.ts pre-resolves with it so the summary shows the SAME window).
 *
 * Pre-M4 CLI precedence (preserved): per bound, an explicit --start-date /
 * --end-date wins over the lookback. The shared resolver's contract says
 * daysBack wins over explicit dates (route parity) — so this mapper pre-
 * computes the lookback range first, then hands BOTH bounds as explicit dates
 * when the user pinned one. daysBack never reaches the resolver alongside an
 * explicit bound, which sidesteps the precedence conflict WITHOUT duplicating
 * date math: the lookback itself is still resolved through resolveDateRange.
 *
 * daysBack <= 0 (or absent) with no explicit dates → full history (open
 * bounds), matching the resolver's absent-bound contract.
 */
export function resolveCliDateRange(
  options: Pick<CliOptions, 'daysBack' | 'startDate' | 'endDate'>,
): DateRangeResolution {
  if (options.daysBack <= 0) {
    return resolveDateRange({ startDate: options.startDate, endDate: options.endDate });
  }
  const lookback = resolveDateRange({ daysBack: options.daysBack });
  if (!lookback.ok) return lookback;
  return resolveDateRange({
    startDate:
      options.startDate ??
      (lookback.value.startDate !== undefined ? toUtcDateString(lookback.value.startDate) : undefined),
    endDate:
      options.endDate ??
      (lookback.value.endDate !== undefined ? toUtcDateString(lookback.value.endDate) : undefined),
  });
}

/**
 * Build the engine override for a CLI run. The normalizer is the single
 * authority (contract D1): commissionMethod is REQUIRED (absent → explicit
 * error naming the accepted values; the CLI enforces presence + alias
 * resolution in backtest-cli.ts validateOptions, so by the time we get here
 * options.commissionMethod is a canonical id). The legacy --commission /
 * --commission-type flags are REMOVED from the CLI surface (commission wave) —
 * no producer can express the dead 0-commission fee path. Errors are thrown
 * here so any CLI entry fails non-zero before a single bar is fetched.
 */
function buildConfig(options: CliOptions): Partial<StrategyConfig> {
  const raw: Record<string, unknown> = {
    ...(options.commissionMethod !== undefined ? { commissionMethod: options.commissionMethod } : {}),
    ...(options.commissionMethodSettings !== undefined ? { commissionMethodSettings: options.commissionMethodSettings } : {}),
    ...(options.initialCapital !== undefined ? { initialCapital: options.initialCapital } : {}),
    ...(options.slippage !== undefined ? { slippage: options.slippage } : {}),
    ...(options.defaultQty !== undefined ? { defaultQty: options.defaultQty } : {}),
    ...(options.pyramiding !== undefined ? { pyramiding: options.pyramiding } : {}),
  };

  const result = normalizeExplicitOverride(raw);
  if (!result.ok) {
    const detail = result.errors.map((e) => e.message).join('\n  ');
    throw new Error(`Invalid backtest configuration:\n  ${detail}`);
  }
  return buildBacktestConfigOverride(result.value);
}
