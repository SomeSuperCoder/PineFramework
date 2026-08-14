#!/usr/bin/env node

import { existsSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'node:crypto';
import { VERSION, buildBacktestExport, scriptHash } from 'pine-framework';
import type { StrategyConfig, BacktestWarning } from 'pine-framework';
import type { CliOptions, CliCommissionMethod, TimeframeResult } from './types.js';
import { VALID_TIMEFRAMES, DEFAULT_SYMBOLS, getDefaultDaysBack } from './types.js';
import { runMultiSymbolBacktest, resolveCliDateRange } from './multi-symbol-runner.js';
import { toUtcDateString, type ResolvedDateRange } from '../backtest-dates.js';
import { buildTimeframeResult, buildMultiTimeframeOutput } from './result-aggregator.js';
import { printSummaryTable, writeJsonOutput } from './output-formatter.js';
import { assertRealisticCommissionMethod } from '../backtest-config.js';
import {
  COMMISSION_METHOD_ACCEPTED_TEXT,
  COMMISSION_METHOD_LABELS,
  resolveCommissionMethodAlias,
} from '../commission-method-meta.js';
import { writeExportFile, type ExportRun } from '../backtest-export.js';
import type { ExportOutcomeSink } from './symbol-runner.js';

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
  --export [dir]          Export full backtest data (bars, series, trades, orders,
                          raw metrics) as JSON files. Optional value: a directory
                          (default: .exports/ at repo root).
  --initial-capital <n>   Starting capital (default: 10000)
  --commission-method <m> REQUIRED. Commission method: ${COMMISSION_METHOD_ACCEPTED_TEXT}
                          (aliases: "jupiter-swap"/"jupiter-ultra" or the labels
                          "${COMMISSION_METHOD_LABELS.jupiter_manual}"/"${COMMISSION_METHOD_LABELS.jupiter_ultra}")
  --commission-method-settings <json>  JSON string of method-specific settings (e.g. '{"rate":0.001}')
  --slippage <n>          Slippage value (default: 0)
  --default-qty <n>       Default order quantity (default: 1)
  --pyramiding <n>        Max pyramiding entries (default: 0)
  --help                  Show this help message

After the results table the CLI prints the EFFECTIVE CONFIG — the resolved date
range, the commission method (label), and the key settings that ACTUALLY ran —
plus any run warnings, so the output always shows what was backtested.
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
    } else if (arg === '--export') {
      // Optional value: `--export ./dir` uses that dir; a bare `--export`
      // (or a value that looks like the next flag) uses the default dir.
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        i++;
        options.exportDir = next;
      } else {
        options.exportDir = '';
      }
    } else if (arg === '--initial-capital') {
      i++;
      options.initialCapital = parseFloat(args[i] ?? '');
    } else if (arg === '--commission-method') {
      i++;
      // Raw value kept; alias resolution + the accepted-values error happen in
      // validateOptions (so labels like "Jupiter Swap" with spaces parse fine).
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

  // --commission-method is REQUIRED (contract D1): absent → explicit error
  // naming the accepted values, never a default. Aliases (kebab names + display
  // labels, from commission-method-meta) resolve to the canonical id here so
  // the normalizer sees exactly the union.
  if (options.commissionMethod === undefined) {
    return `Missing required --commission-method. Accepted values: ${COMMISSION_METHOD_ACCEPTED_TEXT}`;
  }
  const resolvedMethod = resolveCommissionMethodAlias(options.commissionMethod);
  if (resolvedMethod === null) {
    return `Invalid commission method "${options.commissionMethod}". Accepted values: ${COMMISSION_METHOD_ACCEPTED_TEXT}`;
  }
  options.commissionMethod = resolvedMethod;

  // Enforce Jupiter commission method for realistic results (SSOT: backtest-config).
  // Only canonical values reach this point (the meta check above already
  // rejected everything else), so this guard is defense-in-depth. The
  // --allow-unrealistic-results escape hatch was REMOVED (reviewer F7): the
  // normalizer rejects non-Jupiter methods regardless, so the flag was inert —
  // the guard now always enforces (always false) and can never block a run.
  try {
    assertRealisticCommissionMethod(options.commissionMethod, false);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }

  // daysBack is checked per-timeframe in main(), not here
  return null;
}

/**
 * Render the run's effective configuration — "what actually ran" (M6).
 *
 * Parity contract (cli-backtest-tool): the summary MUST come from the effective
 * config and the resolved range, never be re-derived. `dateRange` is the same
 * overallStart/overallEnd the metrics table used (toUtcDateString over the
 * resolved ms values); the commission method and settings come from the
 * engine's post-merge config — NOT from the CLI flags, so the summary is the
 * truth of the run, not the request.
 *
 * Settings values are printed raw (no rounding) — display stays honest and the
 * numbers remain exactly what the engine merged.
 */
function printEffectiveConfigSummary(
  dateRange: { start: string; end: string },
  config: Readonly<StrategyConfig>,
): void {
  const method = config.commissionMethod;
  const methodLabel =
    method !== undefined ? `${COMMISSION_METHOD_LABELS[method]} (${method})` : '(unset)';
  const settings = config.commissionMethodSettings as Record<string, unknown> | null | undefined;

  const lines: string[] = [];
  lines.push('');
  lines.push('  Effective config (what actually ran):');
  lines.push(`    Date range:       ${dateRange.start} → ${dateRange.end}`);
  lines.push(`    Commission:       ${methodLabel}`);
  lines.push(`    Initial capital:  ${String(config.initialCapital)}`);
  lines.push(`    Default qty:      ${String(config.defaultQty)} (${config.defaultQtyType})`);
  lines.push(`    Slippage:         ${String(config.slippage)} (${config.slippageType})`);
  lines.push(`    Pyramiding:       ${String(config.pyramiding)}`);
  // Fee-relevant method settings (present keys only — live-fetched or explicit).
  if (settings !== null && settings !== undefined) {
    for (const key of ['dexFeeBps', 'solPriceUsd', 'pairCategory', 'rate'] as const) {
      const value = settings[key];
      if (value !== undefined) lines.push(`    ${key}: ${String(value)}`);
    }
  }
  process.stdout.write(lines.join('\n') + '\n');
}

/**
 * Render the run's warnings — typed diagnostics (design D4). Quiet by default:
 * NO output when there are no warnings. Each record prints type + message +
 * context (JSON) with a ⚠ prefix. Identical records from multi-symbol runs are
 * deduplicated with a ×N count, so a default 5-symbol run does not spam N
 * copies of the same baseline/fee-decision record.
 */
function printWarningsSection(warnings: BacktestWarning[]): void {
  if (warnings.length === 0) return;

  const seen = new Map<string, { warning: BacktestWarning; count: number }>();
  for (const w of warnings) {
    const key = `${w.type}|${w.message}`;
    const existing = seen.get(key);
    if (existing) {
      existing.count++;
    } else {
      seen.set(key, { warning: w, count: 1 });
    }
  }

  const lines: string[] = [];
  lines.push('');
  lines.push('  Warnings:');
  for (const { warning, count } of seen.values()) {
    const suffix = count > 1 ? ` (×${count})` : '';
    // level absent → 'warning' (SSOT default). 'info' diagnostics (e.g.
    // fee-decision confirming an explicit user choice) get a quiet marker —
    // they inform, they do not alarm. Unknown levels fail safe to ⚠.
    const marker = (warning.level ?? 'warning') === 'info' ? 'ℹ' : '⚠';
    lines.push(`    ${marker} [${warning.type}] ${warning.message}${suffix}`);
    if (warning.context !== undefined && Object.keys(warning.context).length > 0) {
      lines.push(`      context: ${JSON.stringify(warning.context)}`);
    }
  }
  process.stdout.write(lines.join('\n') + '\n');
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

  // ── Full-data export wiring (--export) ────────────────────────────────────
  // exportDir: undefined = export disabled; '' (bare --export) = default dir.
  // The bare-flag default resolves from the MODULE location, not process.cwd():
  // dist/cli/backtest-cli.js -> dirname/../../.. = monorepo root, so `pine-backtest`
  // writes .exports/ at repo root no matter where it is invoked from (a cwd-based
  // resolve(process.cwd(),'..','.exports') lands in the repo's PARENT when the
  // npm bin runs from repo root). import.meta.dirname requires Node >= 20.11.
  const exportDir =
    options.exportDir !== undefined
      ? options.exportDir
        ? resolve(options.exportDir)
        : resolve(import.meta.dirname, '../../..', '.exports')
      : undefined;

  // One ExportRun per CLI invocation: files/symbols accumulate across
  // timeframes so the final manifest.json lists every export of the run.
  const exportRun: ExportRun | undefined = exportDir
    ? {
        runId: randomUUID(),
        source: 'script',
        dir: exportDir,
        files: [],
        symbols: new Set<string>(),
      }
    : undefined;

  // The export sink is the composition root for the full-data export: it builds
  // the export from the pure lib builder + engine surface, writes the file via
  // the backend glue, and records the filename for the manifest. Errors here are
  // swallowed by runSymbolBacktest — an export never fails a backtest.
  const onOutcome: ExportOutcomeSink | undefined = exportRun
    ? async (ctx) => {
        const strategyEngine = ctx.engine.getStrategyEngine();
        if (!strategyEngine) {
          throw new Error('Effective strategy config unavailable (missing strategy engine)');
        }
        const exportObj = buildBacktestExport({
          runId: exportRun.runId,
          source: 'script',
          meta: {
            symbol: ctx.symbol,
            timeframe: ctx.timeframe,
            ...(ctx.startDate !== undefined ? { startDate: ctx.startDate } : {}),
            ...(ctx.endDate !== undefined ? { endDate: ctx.endDate } : {}),
            barCount: ctx.bars.length,
            engineVersion: VERSION,
            scriptHash: scriptHash(ctx.script),
          },
          params: {
            request: ctx.cliOptions,
            configOverride: { ...ctx.configOverride },
            // Mutable copy of the engine's Readonly config — the schema requires
            // the full effective config, and a build MUST fail if it's unavailable.
            effectiveConfig: { ...strategyEngine.getConfig() },
          },
          input: { bars: ctx.bars },
          output: {
            series: ctx.engine.getAllOutputs(),
            barTimestamps: ctx.bars.map((b) => b.timestamp),
            strategyMarkers: ctx.engine.getStrategyMarkers(),
            equityCurve: ctx.outcome.equityCurve,
            drawdownCurve: ctx.outcome.drawdownCurve,
            equityPoints: ctx.outcome.equityPoints,
            // Export contract: numeric values MUST NOT be rounded. toOutcome
            // surfaces the unrounded series via monthlyReturnsRaw; fall back to
            // the rounded record only when an outcome lacks raw values, and say
            // so in warnings so the document stays honest.
            monthlyReturns: ctx.outcome.monthlyReturnsRaw ?? ctx.outcome.monthlyReturns,
            buyHoldReturn: ctx.outcome.buyHoldReturn,
          },
          trades: ctx.outcome.trades,
          orders: ctx.outcome.filledOrders,
          metrics: ctx.outcome.metrics,
          warnings: ctx.outcome.monthlyReturnsRaw
            ? ctx.warnings
            : [
                ...ctx.warnings,
                // Design D4: the export's warnings are typed records. This
                // branch is defensive (toOutcome always provides raw values) —
                // typed as an export-failure so the document stays honest when
                // a caller hands it a rounded-only outcome.
                {
                  type: 'export-failure',
                  message: 'monthlyReturns rounded by caller (backtest-runner.ts:240)',
                  context: { field: 'monthlyReturns' },
                },
              ],
        });
        const filename = await writeExportFile(exportObj, exportRun.dir);
        exportRun.files.push(filename);
        exportRun.symbols.add(ctx.symbol);
        process.stderr.write(`  ↳ exported ${filename}\n`);
      }
    : undefined;

  try {
    const tfResults: TimeframeResult[] = [];
    // Collected per-timeframe resolved ranges (ms) — the overall summary is
    // derived from THESE, never from a third independent date computation.
    const resolvedRanges: ResolvedDateRange[] = [];
    // M6: what actually ran, surfaced after the metrics table. All symbols of a
    // run share the script + override, so ONE representative effective config
    // (the first completed symbol) is printed; warnings aggregate across every
    // completed symbol of every timeframe.
    const effectiveConfigs: Readonly<StrategyConfig>[] = [];
    const allWarnings: BacktestWarning[] = [];
    // F8 (reviewer gap): per-symbol fee truth. The representative config above
    // can MISLEAD when symbols resolved DIFFERENT live DEX fees (separate
    // pools). Collect each completed symbol's resolved dexFeeBps so the summary
    // can state the variance instead of implying one fee for all symbols.
    const feeSources: { symbol: string; dexFeeBps: unknown }[] = [];

    for (let ti = 0; ti < timeframes.length; ti++) {
      const tf = timeframes[ti]!;

      // Determine daysBack for this timeframe
      const tfDaysBack = daysBackExplicitlySet
        ? options.daysBack
        : getDefaultDaysBack(tf);

      // ── Resolve the date range ONCE via the shared UTC-midnight resolver ──
      // The SAME range feeds the fetch (passed into the runner via
      // options.resolvedDateRange) and the summary display. The pre-M4 code
      // computed the fetch window in multi-symbol-runner.ts (raw ms) and a
      // DIFFERENT window here (UTC date strings) — the 720/721 bar drift.
      // Throwing is a fatal CLI error (exit 1): the range is invalid.
      const tfResolved = resolveCliDateRange({ ...options, daysBack: tfDaysBack });
      if (!tfResolved.ok) {
        const detail = tfResolved.errors.map((e) => `${e.field ?? 'body'}: ${e.message}`).join('; ');
        throw new Error(`Invalid date range: ${detail}`);
      }
      const tfRange = tfResolved.value;
      resolvedRanges.push(tfRange);

      // Display labels from the SAME resolved ms — UTC YYYY-MM-DD via the SSOT
      // helper. Open bounds (reachable only when no source sets a bound) fall
      // back to the user's raw string or an honest 'earliest'/'latest' label;
      // the Date.now() fallback is a DISPLAY label for an open end, not a
      // window computation (the fetch end is genuinely open in that case).
      const startLabel =
        tfRange.startDate !== undefined
          ? toUtcDateString(tfRange.startDate)
          : options.startDate ?? 'earliest';
      const endLabel =
        tfRange.endDate !== undefined
          ? toUtcDateString(tfRange.endDate)
          : options.endDate ?? toUtcDateString(Date.now());

      // Build per-timeframe options (override timeframe + daysBack + the
      // resolved range — the runner fetches EXACTLY the displayed window)
      const tfOptions: CliOptions = {
        ...options,
        timeframe: tf,
        daysBack: tfDaysBack,
        resolvedDateRange: tfRange,
      };

      process.stderr.write(`\n--- Timeframe: ${tf} (${startLabel} to ${endLabel}) ---\n`);

      const symbols = await runMultiSymbolBacktest(tfOptions, onOutcome, exportRun);

      // M6: capture the run's effective config + warnings for the summary.
      const completed = symbols.find((s) => s.status === 'completed' && s.effectiveConfig);
      if (completed?.effectiveConfig) effectiveConfigs.push(completed.effectiveConfig);
      for (const s of symbols) {
        if (s.warnings && s.warnings.length > 0) allWarnings.push(...s.warnings);
        // F8: per-symbol fee source (resolved dexFeeBps from the engine's
        // post-merge config — the fee that ACTUALLY ran for this symbol).
        if (s.status === 'completed' && s.effectiveConfig) {
          const settings = s.effectiveConfig.commissionMethodSettings as
            | { dexFeeBps?: unknown }
            | undefined;
          feeSources.push({ symbol: s.symbol, dexFeeBps: settings?.dexFeeBps });
        }
      }

      const dateRange = { start: startLabel, end: endLabel };
      const tfResult = buildTimeframeResult(tf, symbols, dateRange);
      tfResults.push(tfResult);
    }

    // Determine overall date range (earliest resolved start, latest resolved
    // end across timeframes) — from the SAME resolved ms values collected
    // above, never a second raw-now computation.
    const startMsValues = resolvedRanges.flatMap((r) => (r.startDate !== undefined ? [r.startDate] : []));
    const endMsValues = resolvedRanges.flatMap((r) => (r.endDate !== undefined ? [r.endDate] : []));
    const overallStart =
      startMsValues.length > 0
        ? toUtcDateString(Math.min(...startMsValues))
        : options.startDate ?? 'earliest';
    const overallEnd =
      endMsValues.length > 0
        ? toUtcDateString(Math.max(...endMsValues))
        : options.endDate ?? toUtcDateString(Date.now());

    const output = buildMultiTimeframeOutput(
      options.scriptPath,
      { start: overallStart, end: overallEnd },
      tfResults,
    );

    printSummaryTable(output);

    // ── Effective-config summary + warnings (M6) ───────────────────────────
    // Prints what ACTUALLY ran: the resolved date range (the SAME resolved ms
    // values the table labels came from — never re-derived), the effective
    // commission method (label via commission-method-meta), and the key
    // effective settings from the engine's post-merge config. Quiet when no
    // completed run exists (nothing ran to summarize); the warnings section
    // prints ONLY when warnings exist (quiet by default).
    if (effectiveConfigs.length > 0) {
      printEffectiveConfigSummary(
        { start: overallStart, end: overallEnd },
        effectiveConfigs[0]!,
      );
    }
    // F8: when completed symbols resolved DIFFERENT live DEX fees, the
    // representative effective-config line above implies a single fee for the
    // whole batch — state the variance explicitly. (Same-fee batches print
    // nothing extra; quiet by default like the rest of the summary.)
    if (feeSources.length > 1) {
      const uniqueFees = new Set(feeSources.map((f) => f.dexFeeBps));
      if (uniqueFees.size > 1) {
        const feeLines = feeSources
          .map((f) => `${f.symbol}=${f.dexFeeBps !== undefined ? `${String(f.dexFeeBps)} bps` : 'no live/explicit fee'}`)
          .join(', ');
        process.stdout.write(`  Fee sources (vary per symbol): ${feeLines}\n`);
      }
    }
    printWarningsSection(allWarnings);

    if (options.output) {
      writeJsonOutput(output, options.output);
      process.stderr.write(`Results written to ${options.output}\n`);
    }

    if (exportRun && exportRun.files.length > 0) {
      process.stderr.write(
        `Exports written to ${exportRun.dir} (${exportRun.files.length} file(s) + manifest.json)\n`,
      );
    }

    // F5 (reviewer gap): a batch must exit NON-ZERO when ANY symbol failed —
    // the old `allFailed = totalSuccessful === 0` exited 0 on partial failure,
    // silently signaling success to scripts/CI despite failed symbols. Failed
    // symbols are named so the exit code is actionable.
    const failedSymbols = output.timeframes.flatMap((tf) =>
      tf.symbols.filter((s) => s.status === 'failed'),
    );
    if (failedSymbols.length > 0) {
      process.stderr.write(
        `\n⚠ ${failedSymbols.length} symbol(s) failed: ${failedSymbols
          .map((s) => `${s.symbol} (${s.error ?? 'unknown error'})`)
          .join(', ')}\n`,
      );
    }
    process.exit(failedSymbols.length > 0 ? 1 : 0);
  } catch (err) {
    process.stderr.write(
      `Fatal error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
}

main();
