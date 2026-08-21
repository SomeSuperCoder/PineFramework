/**
 * runTelegramBacktest.ts
 *
 * Neutral producer seam for the Telegram /backtest wizard (OpenSpec
 * telegram-backtest-flow, design D1).
 *
 * WHY this module exists: the Telegram bot must run the SAME backtest pipeline
 * as CLI/HTTP with ZERO behavior drift — same UTC-midnight date resolution,
 * same commission normalization authority, same live-fee policy (THROW on
 * fetch failure, explicit-fee bypass, 10-min cache), same 1500-bar cap, same
 * canonical BacktestApiResult contract. This seam COMPOSES the existing core
 * producers exactly like routes/backtest.ts does
 * (normalize → buildBacktestConfigOverride → applyDexFee → runBacktestPipeline
 * → toOutcome → toApiResult); it re-implements none of that logic.
 *
 * Lane rules honored here:
 *  - Imports ONLY backend core modules (backtest-*, normalize-*, bybit, cache,
 *    store) — never anything from backend/src/telegram/ — so no import cycle
 *    exists; the wizard imports THIS module, never the reverse.
 *  - Does NOT reuse runSymbolBacktest (cli/symbol-runner.ts): that producer
 *    returns the CLI-shaped SymbolResult and accepts CLI export options. The
 *    seam's success shape is the canonical BacktestApiResult and it must never
 *    trigger file exports.
 *  - Errors are returned as a typed discriminated union with user-safe
 *    messages (URLs/hostnames redacted, no stack traces) — the wizard
 *    localizes them for display.
 */

import type { Bar, StrategyConfig } from 'pine-framework';
import { WarningCollector } from 'pine-framework';
import type {
  BacktestApiResult,
  BacktestCommissionMethodId,
  BacktestCommissionMethodSettings,
  EffectiveBacktestConfig,
} from '../../backtest-contract.js';
import { resolveDateRange } from '../../backtest-dates.js';
import { normalizeExplicitOverride } from '../../normalize-explicit-config.js';
import { applyDexFee, buildBacktestConfigOverride } from '../../backtest-config.js';
import { MAX_BARS, runBacktestPipeline } from '../../backtest-runner.js';
import { buildDecisionWarnings, toApiResult, toOutcome } from '../../backtest-result.js';
import { fetchBars } from '../../bybit/fetch-bars.js';
import type { ScriptFileManager } from '../../store/ScriptFileManager.js';
import { getBuiltInScript } from '../../store/builtInScripts.js';
import type { DiskOHLCVCache } from '../../cache/DiskOHLCVCache.js';
import { sanitizeUserMessage } from '../../utils/sanitize.js';

/** Wizard input — the four settings the /backtest wizard collects, nothing more. */
export interface TelegramBacktestParams {
  strategyId: string;
  symbol: string;
  timeframe: string;
  /** Lookback in days — resolved via the shared UTC-midnight resolver (must be a positive integer). */
  daysBack: number;
  /** Official commission method — validated by normalizeExplicitOverride (the single authority). */
  commissionMethod: BacktestCommissionMethodId;
  /** Per-method fee settings (official keys only — the normalizer rejects unknown keys). */
  commissionMethodSettings?: BacktestCommissionMethodSettings;
  /** Optional initial capital (CLI default is 10000 when omitted). */
  initialCapital?: number;
}

/** Injected infrastructure (architecture law D: inject, don't instantiate). */
export interface TelegramBacktestDeps {
  /** Strategy library accessor — the seam resolves a SOURCE STRING, never an id/path. */
  scripts: ScriptFileManager;
  /** Built-in scripts directory (test_indicators). When set, `builtin_*` ids
   *  that miss the user library resolve through the shared built-in store —
   *  the same module the /scripts/built-in route serves (never written to the
   *  manifest). Absent: builtin_* ids fall through to STRATEGY_NOT_FOUND
   *  (pre-fix behavior). */
  builtInScriptsDir?: string;
  /** Optional persistent OHLCV cache, forwarded to fetchBars. */
  diskCache?: DiskOHLCVCache;
  /** Injectable clock (ms) for deterministic date resolution. */
  now?: number;
}

/** User-safe failure codes the wizard can map to localized messages. */
export type TelegramBacktestErrorCode =
  | 'NO_STRATEGIES'
  | 'STRATEGY_NOT_FOUND'
  | 'NOT_A_STRATEGY'
  | 'TOO_MANY_BARS'
  | 'INVALID_SETTINGS'
  | 'FEE_FETCH_FAILED'
  | 'ENGINE_FAILED'
  | 'DATA_FETCH_FAILED';

export interface TelegramBacktestError {
  code: TelegramBacktestErrorCode;
  /** User-safe message — no stack traces, URLs/hostnames redacted. */
  message: string;
}

export type TelegramBacktestResult =
  | { ok: true; result: BacktestApiResult }
  | { ok: false; error: TelegramBacktestError };

/** One place to build failure results — keeps the discriminated union honest. */
function failure(code: TelegramBacktestErrorCode, message: string): TelegramBacktestResult {
  return { ok: false, error: { code, message } };
}

/**
 * Run a backtest from Telegram wizard settings. Returns the canonical
 * BacktestApiResult on success; every failure path returns a typed, user-safe
 * error instead of throwing (the wizard never sees a raw exception).
 */
export async function runTelegramBacktest(
  params: TelegramBacktestParams,
  deps: TelegramBacktestDeps,
): Promise<TelegramBacktestResult> {
  // ── 1. Strategy resolution — SOURCE STRING only, never id/path ───────────
  // User scripts resolve from the manifest-backed library first; `builtin_*`
  // ids fall through to the shared built-in store. The built-in is adapted to
  // the canonical ScriptEntry shape (zero timestamps) so the NOT_A_STRATEGY
  // check below and the engine call work identically for both sources.
  let entry = await deps.scripts.getById(params.strategyId);
  if (!entry && deps.builtInScriptsDir) {
    const builtIn = getBuiltInScript(deps.builtInScriptsDir, params.strategyId);
    if (builtIn) {
      entry = {
        id: builtIn.id,
        name: builtIn.name,
        source: builtIn.source,
        scriptType: builtIn.type,
        createdAt: 0,
        updatedAt: 0,
      };
    }
  }
  if (!entry) {
    // Distinguish an empty library from a missing id: the manifest is currently
    // empty, and an empty library deserves its own user-facing message.
    const all = await deps.scripts.getAll();
    if (all.length === 0) {
      return failure('NO_STRATEGIES', 'No strategies available. Create a strategy first.');
    }
    return failure('STRATEGY_NOT_FOUND', `Strategy '${params.strategyId}' not found.`);
  }
  // ScriptEntry.scriptType is 'strategy' | 'indicator'; a manifest 'library'
  // entry is cast to one of them, so ANY non-strategy fails here.
  if (entry.scriptType !== 'strategy') {
    return failure(
      'NOT_A_STRATEGY',
      `Script '${entry.name}' is not a strategy — only strategy() scripts can be backtested.`,
    );
  }

  // ── 2. Date resolution — shared UTC-midnight resolver (contract D6) ──────
  const range = resolveDateRange({ daysBack: params.daysBack, now: deps.now });
  if (!range.ok) {
    return failure('INVALID_SETTINGS', range.errors[0]?.message ?? 'Invalid backtest date range.');
  }

  // ── 3. Commission normalization — the SINGLE authority (contract D1) ─────
  // Route commissionMethod + optional settings through normalizeExplicitOverride
  // exactly like CLI/HTTP: method required, official ids only, per-method
  // settings keys, unknown keys rejected.
  const rawOverride: Record<string, unknown> = { commissionMethod: params.commissionMethod };
  if (params.commissionMethodSettings !== undefined)
    rawOverride.commissionMethodSettings = params.commissionMethodSettings;
  if (params.initialCapital !== undefined) rawOverride.initialCapital = params.initialCapital;
  const normalized = normalizeExplicitOverride(rawOverride);
  if (!normalized.ok) {
    return failure(
      'INVALID_SETTINGS',
      normalized.errors[0]?.message ?? 'Invalid backtest settings.',
    );
  }
  const explicit = normalized.value;

  // ── 4. Bars — async fetch (disk cache first), then the 1500-bar cap ──────
  let bars: Bar[];
  try {
    bars = await fetchBars(
      params.symbol,
      params.timeframe,
      range.value.startDate,
      range.value.endDate,
      undefined, // no granular progress for the bot — the wizard shows a simple status
      deps.diskCache,
    );
  } catch (err) {
    return failure('DATA_FETCH_FAILED', sanitizeUserMessage(err));
  }
  if (bars.length === 0) {
    return failure('DATA_FETCH_FAILED', 'No bar data available for the requested range.');
  }
  // Pre-validate BEFORE the live-fee fetch and the engine: a too-large range is
  // a user fix, not a run failure — the wizard displays it directly.
  if (bars.length > MAX_BARS) {
    return failure(
      'TOO_MANY_BARS',
      `Too many bars (${bars.length}). Maximum is ${MAX_BARS}. Use a shorter date range or a larger timeframe.`,
    );
  }

  // ── 5. Per-run diagnostic collector + live DEX fee merge ─────────────────
  // One collector per run (design D4): the engine writes through onWarning,
  // applyDexFee emits fee records (live-fee-cache / live-fee-failure), and the
  // composition root appends the fee-decision record — the API result carries
  // the SAME array as CLI/HTTP runs.
  const collector = new WarningCollector();
  const baseOverride = buildBacktestConfigOverride(explicit);
  let override: Partial<StrategyConfig>;
  try {
    // POLICY (ruling B): a live-fee fetch failure THROWS — no fallback, no
    // invented fee. Explicit dexFeeBps bypasses the fetch (hatch a).
    override = await applyDexFee(params.symbol, baseOverride, collector.onWarning);
  } catch (err) {
    return failure('FEE_FETCH_FAILED', sanitizeUserMessage(err));
  }

  // ── 6. Engine — the shared SYNC pipeline ─────────────────────────────────
  const pipelineResult = await runBacktestPipeline({
    script: entry.source,
    bars,
    configOverride: Object.keys(override).length > 0 ? override : undefined,
    onWarning: collector.onWarning,
  });
  if (!pipelineResult.success) {
    return failure(
      'ENGINE_FAILED',
      sanitizeUserMessage(pipelineResult.error ?? 'Execution failed.'),
    );
  }

  const engine = pipelineResult.engine!;
  const strategyEngine = engine.getStrategyEngine();
  const outcome = toOutcome(bars, engine);
  if (!outcome || !strategyEngine) {
    return failure(
      'ENGINE_FAILED',
      'Backtest completed but metrics could not be computed (missing strategy engine).',
    );
  }

  // ── 7. Effective config + decision diagnostics + canonical result ────────
  // "What actually ran": the engine's post-merge config plus the resolved
  // UTC-midnight range (contract BacktestResultExtension — route parity).
  const effectiveConfig: EffectiveBacktestConfig = {
    ...strategyEngine.getConfig(),
    ...(range.value.startDate !== undefined ? { startDate: range.value.startDate } : {}),
    ...(range.value.endDate !== undefined ? { endDate: range.value.endDate } : {}),
  };
  for (const w of buildDecisionWarnings(explicit, effectiveConfig)) {
    collector.push(w);
  }

  const result = toApiResult(outcome, {
    effectiveConfig,
    warnings: collector.toArray(),
    barCount: bars.length,
  });
  return { ok: true, result };
}
