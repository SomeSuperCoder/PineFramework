#!/usr/bin/env node

import { existsSync } from 'fs';
import { resolve } from 'path';
import type { CliOptions, CliCommissionType, CliCommissionMethod, TimeframeResult } from './types.js';
import { VALID_TIMEFRAMES, DEFAULT_SYMBOLS, getDefaultDaysBack } from './types.js';
import { runMultiSymbolBacktest } from './multi-symbol-runner.js';
import { buildTimeframeResult, buildMultiTimeframeOutput } from './result-aggregator.js';
import { printSummaryTable, writeJsonOutput } from './output-formatter.js';

function printUsage(): void {
  console.log(`
Usage: pine-backtest <script.pine> [options]

Options:
  --timeframe <tf>        Timeframe: 1,3,5,15,30,60,120,240,D,W,M (default: 60)
  --timeframes <list>     Comma-separated timeframes to backtest on (overrides --timeframe)
                          Example: --timeframes 5,15,60,240
  --symbols <list>        Comma-separated symbols (default: BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT)
  --days-back <n>         Lookback period in days (default: varies by timeframe)
  --start-date <date>     Start date YYYY-MM-DD (overrides --days-back)
  --end-date <date>       End date YYYY-MM-DD
  --output <path>         Write JSON results to file
  --initial-capital <n>   Starting capital (default: 10000)
  --commission <n>        Commission value (default: 0)
  --commission-type <t>   Commission type: percent, fixed, per_contract, per_order (default: percent)
  --commission-method <m> Commission method: percent_fixed, per_order_fixed, jupiter_ultra, jupiter_manual, none
  --commission-method-settings <json>  JSON string of method-specific settings (e.g. '{"rate":0.001}')
  --slippage <n>          Slippage value (default: 0)
  --default-qty <n>       Default order quantity (default: 1)
  --pyramiding <n>        Max pyramiding entries (default: 0)
  --help                  Show this help message
`);
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const options: CliOptions = {
    scriptPath: '',
    timeframe: '60',
    symbols: [...DEFAULT_SYMBOLS],
    daysBack: 0,
    help: false,
  };

  let positionalCount = 0;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      return options;
    }

    if (arg === '--timeframe') {
      i++;
      options.timeframe = args[i] ?? '';
    } else if (arg === '--timeframes') {
      i++;
      const raw = args[i] ?? '';
      const tfs = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (tfs.length > 0) {
        options.timeframes = tfs;
        // Set primary timeframe to the first one
        options.timeframe = tfs[0]!;
      }
    } else if (arg === '--symbols') {
      i++;
      options.symbols = (args[i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg === '--days-back') {
      i++;
      options.daysBack = parseInt(args[i] ?? '', 10) || 0;
    } else if (arg === '--start-date') {
      i++;
      options.startDate = args[i];
    } else if (arg === '--end-date') {
      i++;
      options.endDate = args[i];
    } else if (arg === '--output') {
      i++;
      options.output = args[i];
    } else if (arg === '--initial-capital') {
      i++;
      options.initialCapital = parseFloat(args[i] ?? '');
    } else if (arg === '--commission') {
      i++;
      options.commission = parseFloat(args[i] ?? '');
    } else if (arg === '--commission-type') {
      i++;
      options.commissionType = args[i] as CliCommissionType;
    } else if (arg === '--commission-method') {
      i++;
      options.commissionMethod = args[i] as CliCommissionMethod;
    } else if (arg === '--commission-method-settings') {
      i++;
      try {
        options.commissionMethodSettings = JSON.parse(args[i] ?? '{}');
      } catch {
        process.stderr.write(`Error: --commission-method-settings must be valid JSON\n`);
        process.exit(2);
      }
    } else if (arg === '--slippage') {
      i++;
      options.slippage = parseFloat(args[i] ?? '');
    } else if (arg === '--default-qty') {
      i++;
      options.defaultQty = parseFloat(args[i] ?? '');
    } else if (arg === '--pyramiding') {
      i++;
      options.pyramiding = parseInt(args[i] ?? '', 10);
    } else if (!arg.startsWith('-')) {
      if (positionalCount === 0) {
        options.scriptPath = arg;
        positionalCount++;
      }
    }
  }

  // If --days-back was NOT given, set it based on the primary timeframe
  // (for multi-timeframe, each gets its own default in the main loop)
  if (!options.daysBack) {
    const rawIdx = argv.indexOf('--days-back');
    if (rawIdx === -1 || rawIdx >= argv.length - 1) {
      // Not explicitly set — keep 0 to trigger per-timeframe defaults in main()
      options.daysBack = 0;
    }
  }

  return options;
}

function validateOptions(options: CliOptions): string | null {
  if (!options.scriptPath) {
    return 'Missing required argument: script path';
  }

  const scriptPath = resolve(options.scriptPath);
  const monorepoRoot = resolve(process.cwd(), '..');
  const monorepoPath = resolve(monorepoRoot, options.scriptPath);

  if (existsSync(scriptPath)) {
    options.scriptPath = scriptPath;
  } else if (existsSync(monorepoPath)) {
    options.scriptPath = monorepoPath;
  } else {
    return `Script file not found: ${options.scriptPath}`;
  }

  // Validate all requested timeframes
  const timeframes = options.timeframes ?? [options.timeframe];
  for (const tf of timeframes) {
    if (!VALID_TIMEFRAMES.includes(tf)) {
      return `Invalid timeframe: ${tf}. Valid: ${VALID_TIMEFRAMES.join(', ')}`;
    }
  }

  if (options.symbols.length === 0) {
    return 'At least one symbol is required';
  }

  // daysBack is checked per-timeframe in main(), not here
  return null;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);

  if (options.help || !options.scriptPath) {
    printUsage();
    process.exit(0);
  }

  const validationError = validateOptions(options);
  if (validationError) {
    process.stderr.write(`Error: ${validationError}\n`);
    process.exit(2);
  }

  const timeframes = options.timeframes ?? [options.timeframe];
  const daysBackExplicitlySet = options.daysBack > 0;
  const endDate = options.endDate ?? new Date().toISOString().split('T')[0]!;

  try {
    const tfResults: TimeframeResult[] = [];

    for (let ti = 0; ti < timeframes.length; ti++) {
      const tf = timeframes[ti]!;

      // Determine daysBack for this timeframe
      const tfDaysBack = daysBackExplicitlySet
        ? options.daysBack
        : getDefaultDaysBack(tf);

      // Build per-timeframe options (override timeframe + daysBack)
      const tfOptions: CliOptions = {
        ...options,
        timeframe: tf,
        daysBack: tfDaysBack,
      };

      const start = new Date();
      start.setDate(start.getDate() - tfDaysBack);
      const startDate = options.startDate ?? start.toISOString().split('T')[0]!;

      process.stderr.write(`\n--- Timeframe: ${tf} (${startDate} to ${endDate}) ---\n`);

      const symbols = await runMultiSymbolBacktest(tfOptions);

      const dateRange = { start: startDate, end: endDate };
      const tfResult = buildTimeframeResult(tf, symbols, dateRange);
      tfResults.push(tfResult);
    }

    // Determine overall date range (earliest start, latest end)
    const overallStart = options.startDate
      ?? new Date(new Date().getTime() - Math.max(...timeframes.map((tf) =>
        daysBackExplicitlySet ? options.daysBack : getDefaultDaysBack(tf),
      )) * 86400000).toISOString().split('T')[0]!;

    const output = buildMultiTimeframeOutput(
      options.scriptPath,
      { start: overallStart, end: endDate },
      tfResults,
    );

    printSummaryTable(output);

    if (options.output) {
      writeJsonOutput(output, options.output);
      process.stderr.write(`Results written to ${options.output}\n`);
    }

    const totalSuccessful = output.timeframes.reduce(
      (sum, tf) => sum + tf.crossPairSummary.successfulSymbols, 0,
    );
    const allFailed = totalSuccessful === 0;
    process.exit(allFailed ? 1 : 0);
  } catch (err) {
    process.stderr.write(
      `Fatal error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
}

main();
