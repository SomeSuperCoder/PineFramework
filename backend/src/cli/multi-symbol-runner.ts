import { readFileSync } from 'fs';
import type { CliOptions, SymbolResult } from './types.js';
import { runSymbolBacktest } from './symbol-runner.js';

export async function runMultiSymbolBacktest(
  options: CliOptions,
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
    );

    results.push(result);

    if (result.status === 'failed') {
      process.stderr.write(`  ✗ ${symbol}: ${result.error}\n`);
    } else {
      process.stderr.write(
        `  ✓ ${symbol}: PnL ${result.metrics!.netProfitPercent >= 0 ? '+' : ''}${result.metrics!.netProfitPercent.toFixed(2)}%  PF ${result.metrics!.profitFactor.toFixed(2)}  WinRate ${result.metrics!.winRate.toFixed(1)}%\n`,
      );
    }
  }

  return results;
}

function buildConfig(options: CliOptions): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  if (options.initialCapital !== undefined) config.initialCapital = options.initialCapital;
  if (options.commission !== undefined) config.commission = options.commission;
  if (options.commissionType !== undefined) config.commissionType = options.commissionType;
  if (options.commissionMethod !== undefined) config.commissionMethod = options.commissionMethod;
  if (options.commissionMethodSettings !== undefined) config.commissionMethodSettings = options.commissionMethodSettings;
  if (options.slippage !== undefined) config.slippage = options.slippage;
  if (options.defaultQty !== undefined) config.defaultQty = options.defaultQty;
  if (options.pyramiding !== undefined) config.pyramiding = options.pyramiding;
  return config;
}
