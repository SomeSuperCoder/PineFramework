import { readFileSync } from 'fs';
import type { StrategyConfig } from 'pine-framework';
import type { CliOptions, SymbolResult } from './types.js';
import { buildBacktestConfigOverride } from '../backtest-config.js';
import { writeExportManifest, type ExportRun } from '../backtest-export.js';
import { runSymbolBacktest, type ExportOutcomeSink } from './symbol-runner.js';

export async function runMultiSymbolBacktest(
  options: CliOptions,
  onOutcome?: ExportOutcomeSink,
  exportRun?: ExportRun,
): Promise<SymbolResult[]> {
  const script = readFileSync(options.scriptPath, 'utf-8');

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - options.daysBack);
  const startDateMs = options.startDate
    ? new Date(options.startDate).getTime()
    : start.getTime();
  const endDateMs = options.endDate
    ? new Date(options.endDate).getTime()
    : end.getTime();

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

    results.push(result);

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

function buildConfig(options: CliOptions): Partial<StrategyConfig> {
  return buildBacktestConfigOverride({
    initialCapital: options.initialCapital,
    commission: options.commission,
    commissionType: options.commissionType,
    commissionMethod: options.commissionMethod,
    commissionMethodSettings: options.commissionMethodSettings,
    slippage: options.slippage,
    defaultQty: options.defaultQty,
    pyramiding: options.pyramiding,
  });
}
