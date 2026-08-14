/**
 * backtest-contract.ts
 *
 * The explicit-config contract for the backtest parity + trust change
 * (OpenSpec change: backtest-parity-trust, wave W1 — api-designer).
 *
 * This file is PURE TYPES. It declares the wire contract shared by every
 * backtest producer (API/frontend, CLI, auto-select) and every result consumer
 * (API result payload, CLI output, export record):
 *
 *   1. ExplicitBacktestOverride     — the ONE canonical explicit-override shape.
 *                                     Only user-explicit fields. A field absent
 *                                     from the request means "resolve from the
 *                                     script-declared defaults at the engine's
 *                                     single merge point" — never from a
 *                                     producer-side constant.
 *   2. NormalizationResult          — the validation envelope the normalizer
 *                                     returns (implemented by the backend
 *                                     engineer next). ok:false → API 400 /
 *                                     CLI explicit error + non-zero exit.
 *   3. EffectiveBacktestConfig      — the engine's post-merge configuration
 *                                     echoed back to the user: what actually ran.
 *   4. BacktestWarning              — typed diagnostics collected per run.
 *   5. BacktestResultExtension      — effectiveConfig + warnings[] composed onto
 *                                     the API result, CLI output, and export.
 *
 * EXPLICIT-VS-ABSENT SEMANTICS (the core rule):
 *   - ABSENT field  → "resolve from the script-declared defaults at the engine
 *                     merge point" (execution-engine.ts initializeStrategy).
 *   - PRESENT field → "the user explicitly wants this value".
 *   - NULL is NEVER "absent". Null is rejected by the normalizer
 *     (NULL_NOT_ALLOWED). Optional fields are simply omitted from the request.
 *   - Producers MUST NOT inject engine defaults. The frontend currently injects
 *     commission 0, slippage 0, defaultQty 20, pyramiding 0, marginLong/Short 1,
 *     currency USD, initialCapital 10000, solPriceUsd 150 — all of that stops.
 *
 * The engine merge at execution-engine.ts:456-475 stays the SINGLE merge point
 * (design D1). effectiveConfig = that merge's post-merge result.
 *
 * Design decisions are logged in backend/docs/backtest-contract.md.
 */

import type {
  StrategyConfig,
  StrategyMetrics,
  Trade,
  FilledOrder,
  CommissionMethodId,
  JupiterUltraSettings,
  JupiterManualSettings,
  BacktestWarning,
  BacktestWarningType,
} from 'pine-framework';

// ============================================================================
// 1. Canonical commission identity — the ONLY two official methods.
// ============================================================================

/**
 * The two official Jupiter commission methods (commission-methods/types.ts).
 * Every entry point that accepts a commission method MUST validate against this
 * set and reject anything else with an explicit error — never a silent fallback
 * to legacy 0-commission math (commission-methods spec).
 *
 * Canonical display labels (design D8, owned by commission-methods in W2):
 *   jupiter_manual → "Jupiter Swap", jupiter_ultra → "Jupiter Ultra".
 */
export type BacktestCommissionMethodId = CommissionMethodId;

/**
 * User-explicit fee settings for the chosen method. Typed per method — never
 * `Record<string, unknown>`: only the engine's official settings keys are
 * valid. UI-state keys (e.g. `useCustomRate`/`useCustom`) are NOT contract
 * keys; the normalizer rejects them (UNKNOWN_FIELD).
 */
export type BacktestCommissionMethodSettings = JupiterUltraSettings | JupiterManualSettings;

// ============================================================================
// 2. Explicit override + request body (request side).
// ============================================================================

/**
 * The ONE canonical explicit-override shape — unifies the old API
 * BacktestConfigInput (backtest-config.ts) and the CLI override
 * (cli/multi-symbol-runner.ts) into a single object.
 *
 * - EVERY field is optional EXCEPT `commissionMethod` (required by the
 *   commission-methods spec: absent method → explicit error, never a default).
 * - `commission` / `commissionType` are GONE: the legacy fee path is dead
 *   (no path can express 0-commission — accepted by design).
 * - `currency` is GONE: producers never set it; the engine resolves it.
 * - Omitted optional field = "resolve from script-declared defaults".
 * - Null is never allowed (see module doc).
 */
export interface ExplicitBacktestOverride {
  /** REQUIRED. Official commission method. Absent/invalid → validation error. */
  commissionMethod: BacktestCommissionMethodId;
  /**
   * User-explicit fee settings. Omitted (or empty object) = no explicit fee
   * values; the run resolves fees from the method's official behavior / live
   * fetch (design D3 hatches apply).
   */
  commissionMethodSettings?: BacktestCommissionMethodSettings;
  initialCapital?: number;
  slippage?: number;
  slippageType?: StrategyConfig['slippageType'];
  defaultQty?: number;
  defaultQtyType?: StrategyConfig['defaultQtyType'];
  pyramiding?: number;
  marginLong?: number;
  marginShort?: number;
}

/**
 * Full POST /api/backtest request body (flat wire shape — preserved from the
 * existing route; only the explicit-config fields are the new contract).
 *
 * The route strips the job-level keys (symbol/timeframe/script/startDate/
 * endDate/days_back) and passes the rest to the normalizer as
 * `ExplicitBacktestOverride`.
 *
 * `days_back` keeps its existing snake_case wire name for parity — do NOT
 * rename it in the contract. Shared UTC-midnight date-range semantics are the
 * resolve-date-range wave's (D6/W3) concern; this contract only declares the
 * request surface and the resolved range on effectiveConfig.
 */
export interface BacktestRunRequestBody extends ExplicitBacktestOverride {
  symbol: string;
  timeframe: string;
  script: string;
  /** Inclusive start date (YYYY-MM-DD). Absent = earliest available bar. */
  startDate?: string;
  /** Inclusive end date (YYYY-MM-DD). Absent = latest available bar. */
  endDate?: string;
  /** Existing wire name (kept for parity): lookback in days. */
  days_back?: number;
}

// ============================================================================
// 3. Validation envelope (normalizer output).
// ============================================================================

/** Machine-readable error codes emitted by the normalizer. */
export type ContractValidationCode =
  | 'MISSING_COMMISSION_METHOD'
  | 'INVALID_COMMISSION_METHOD'
  | 'INVALID_FIELD_TYPE'
  | 'INVALID_FIELD_VALUE'
  | 'NULL_NOT_ALLOWED'
  | 'UNKNOWN_FIELD';

/** One validation failure. `field` = the offending key (absent for whole-body errors). */
export interface ContractValidationError {
  code: ContractValidationCode;
  message: string;
  field?: string;
  details?: unknown;
}

/**
 * Discriminated validation envelope. ok:false → the run MUST NOT start.
 *   - API: HTTP 400 with ApiValidationErrorResponse.
 *   - CLI: print each error (the commission-method errors name the two accepted
 *     values) and exit non-zero.
 */
export type NormalizationResult =
  | { ok: true; value: ExplicitBacktestOverride }
  | { ok: false; errors: ContractValidationError[] };

/**
 * The normalizer contract (design D1 — a NORMALIZER, not a second merger).
 * Implemented by the backend engineer; injected at the CLI entry and the API
 * route. Validates `raw` against the whitelist, drops nothing silently, rejects
 * unknown keys and null, and returns the canonical override. The returned value
 * is what feeds the engine's single merge — it must be copy-only-present (never
 * emit undefined keys, preserving buildBacktestConfigOverride's load-bearing
 * omission behavior).
 */
export type NormalizeExplicitOverride = (raw: unknown) => NormalizationResult;

/**
 * API 400 body. Follows the existing backend error convention
 * ({ error, code } — see the dex-fee route contract), extended with the
 * normalizer's field-level errors.
 */
export interface ApiValidationErrorResponse {
  error: string;
  code: 'VALIDATION_ERROR';
  details?: ContractValidationError[];
}

// ============================================================================
// 4. Effective config (result side — what actually ran).
// ============================================================================

/**
 * The engine's post-merge configuration echoed back to the user.
 * Extends the engine's own StrategyConfig (pine-framework SSOT — zero drift)
 * plus the resolved date range.
 *
 * Build from `engine.getStrategyEngine().getConfig()` (the export builder
 * already does this at routes/backtest.ts) + the resolved UTC-midnight-aligned
 * range (ms timestamps, matching backtest-engine.ts BacktestConfig).
 */
export interface EffectiveBacktestConfig extends StrategyConfig {
  /** Resolved start timestamp (ms, UTC-midnight aligned). Absent = full history. */
  startDate?: number;
  /** Resolved end timestamp (ms, UTC-midnight aligned). Absent = latest bar. */
  endDate?: number;
}

// ============================================================================
// 5. Warnings (per-run diagnostics).
// ============================================================================

/**
 * Typed per-run diagnostics (design D4 + warnings spec). SSOT: the union and
 * record live in the shared lib (src/warning-collector.ts, re-exported from
 * the package main entry) so the engines, the export builder, and this API
 * contract all share ONE definition — zero drift. The union is the
 * extensibility point — new diagnostics append to it, never to a string
 * free-for-all.
 *
 * Canonical types:
 * - long-only-suppression: a short order was suppressed by a long-only
 *   commission method (was silently dropped today — strategy-engine.ts).
 * - fee-decision: a commission method / explicit fees / live-fee decision was
 *   applied for the run.
 * - baseline-applied: the engine applied a baseline to a script-undeclared
 *   setting (the run's default source).
 * - live-fee-cache: a successfully fetched live fee schedule was reused from
 *   the TTL cache instead of refetched (design D3 hatch b).
 * - live-fee-failure: a NON-FATAL live fee-adjacent fetch failed (e.g. SOL
 *   price outage — the dex-fee route treats it as non-blocking). The FATAL
 *   DEX-fee fetch failure THROWS and aborts the run (design D3) — that path
 *   never emits this warning, it errors.
 * - auto-select-method: auto-select mapped a live bot kind to a backtest
 *   commission method (design D7 — swap → jupiter_manual, ultra → jupiter_ultra).
 * - export-failure: the full-data export could not be produced with full
 *   fidelity (build or write error — the backtest still completed).
 */
export type { BacktestWarning, BacktestWarningType };

// ============================================================================
// 6. Result extension + composed API result.
// ============================================================================

/**
 * The fields every result payload gains (warnings spec):
 *   - API result (toApiResult / job.result)
 *   - CLI user output (toCliSymbolResult)
 *   - full-data export record (buildBacktestExport warnings param)
 */
export interface BacktestResultExtension {
  /** The engine's post-merge configuration — what actually ran. */
  effectiveConfig: EffectiveBacktestConfig;
  /** Diagnostics collected during the run (empty array when none). */
  warnings: BacktestWarning[];
}

/**
 * API metrics shape: StrategyMetrics with the three fields the route sanitizes
 * (Infinity → null, other non-finite → 0 — see toApiResult in backtest-result.ts).
 */
export interface BacktestApiMetrics
  extends Omit<StrategyMetrics, 'profitFactor' | 'sharpeRatio' | 'sortinoRatio'> {
  profitFactor: number | null;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
}

/**
 * The full POST /api/backtest result payload — the existing toApiResult shape
 * (backtest-result.ts is its implementation SSOT) composed with the contract
 * extension. Declaring it here lets TypeScript structurally enforce that
 * toApiResult conforms (the parity suite locks the behavior).
 */
export interface BacktestApiResult extends BacktestResultExtension {
  metrics: BacktestApiMetrics;
  equityCurve: number[];
  drawdownCurve: number[];
  trades: Array<
    Pick<
      Trade,
      | 'id'
      | 'direction'
      | 'entryPrice'
      | 'exitPrice'
      | 'entryTime'
      | 'exitTime'
      | 'quantity'
      | 'pnl'
      | 'pnlPercent'
      | 'commission'
      | 'entryName'
      | 'exitName'
      | 'mae'
      | 'mfe'
      | 'barsHeld'
    >
  >;
  orders: Array<
    Pick<
      FilledOrder,
      | 'id'
      | 'direction'
      | 'action'
      | 'type'
      | 'quantity'
      | 'price'
      | 'fillPrice'
      | 'fillTime'
      | 'entryName'
      | 'commission'
    >
  >;
  equityPoints: Array<{ time: number; equity: number; drawdown: number; balance: number }>;
  monthlyReturns: Record<string, number>;
  buyHoldReturn: number;
  /**
   * Number of bars actually backtested — the resolved bar count. Added per the
   * parity test's coverage-gap recommendation (the API payload previously
   * exposed no per-bar count; the full-data export meta had it, the API result
   * did not). Equals the fetched bars array length at run time.
   */
  barCount: number;
}
