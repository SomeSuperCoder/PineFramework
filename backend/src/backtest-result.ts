/**
 * backtest-result.ts
 *
 * Single source of truth for the backtest "result glue":
 *   1. BacktestOutcome — the canonical, engine-neutral shape of a completed
 *      backtest (metrics + trades + orders + curves). Built once via toOutcome.
 *   2. Mappers that reproduce, EXACTLY, the result objects the existing callers
 *      build today:
 *        - toApiResult         → routes/backtest.ts `job.result`
 *        - toCliSymbolResult   → cli/symbol-runner.ts `SymbolMetrics`
 *        - toAutoSelectMetrics → trading/auto-select-runner.ts LiveBacktestRunner
 *
 * This module is pure glue and does not import any caller. The callers are
 * rewired (a separate task) to consume these mappers so the mappings live in
 * exactly one place. Field names/shapes were copied verbatim from the current
 * sources via CodeGraph; any divergence from the engine's actual types is noted
 * in comments.
 */

import type {
  Bar,
  ExecutionEngine,
  StrategyMetrics,
  Trade,
  FilledOrder,
} from 'pine-framework';
import type {
  BacktestApiResult,
  BacktestWarning,
  EffectiveBacktestConfig,
  ExplicitBacktestOverride,
} from './backtest-contract.js';
import { computeBacktestMetrics } from './backtest-runner.js';

/** Canonical shape of a completed backtest, decoupled from any one caller. */
export interface BacktestOutcome {
  metrics: StrategyMetrics;
  trades: Trade[];
  filledOrders: FilledOrder[];
  equityCurve: number[];
  drawdownCurve: number[];
  equityPoints: Array<{ time: number; equity: number; drawdown: number; balance: number }>;
  monthlyReturns: Record<string, number>;
  /**
   * Unrounded monthly returns (percent) for the full-data export contract
   * ("numeric values MUST NOT be rounded"). Populated by toOutcome; optional
   * so hand-built BacktestOutcome literals elsewhere keep compiling. Consumers
   * that need raw values (the export sink) read this; the API/CLI display
   * paths keep the rounded `monthlyReturns`.
   */
  monthlyReturnsRaw?: Record<string, number>;
  buyHoldReturn: number;
}

/**
 * Run the shared metrics computation and map it into a BacktestOutcome.
 * Returns null when the engine lacks a strategy (mirrors computeBacktestMetrics).
 */
export function toOutcome(bars: Bar[], engine: ExecutionEngine): BacktestOutcome | null {
  const res = computeBacktestMetrics(bars, engine);
  if (!res) return null;

  return {
    metrics: res.metrics,
    trades: res.trades,
    filledOrders: res.filledOrders,
    equityCurve: res.equityCurve,
    drawdownCurve: res.drawdownCurve,
    equityPoints: res.equityPoints,
    monthlyReturns: res.monthlyReturns,
    monthlyReturnsRaw: res.monthlyReturnsRaw,
    buyHoldReturn: res.buyHoldReturn,
  };
}

/**
 * Context for composing the API result payload (contract BacktestResultExtension
 * + the parity coverage-gap barCount). `warnings` is the M5 WarningCollector
 * sink — empty until that wave populates it.
 */
export interface ToApiResultOptions {
  /** The engine's post-merge configuration — what actually ran. */
  effectiveConfig: EffectiveBacktestConfig;
  /** Diagnostics collected during the run (empty array when none). */
  warnings: BacktestWarning[];
  /** Number of bars actually backtested. */
  barCount: number;
}

/**
 * Reproduces EXACTLY the `job.result` object built in routes/backtest.ts,
 * composed with the contract's BacktestResultExtension (effectiveConfig +
 * warnings) and barCount. The return type is BacktestApiResult so TypeScript
 * structurally enforces conformance with the declared wire contract (the parity
 * suite locks behavior).
 * Sanitize (Infinity → null, otherwise non-finite → 0) is applied ONLY to
 * profitFactor / sharpeRatio / sortinoRatio — every other metric is passed raw,
 * matching the route.
 */
export function toApiResult(o: BacktestOutcome, opts: ToApiResultOptions): BacktestApiResult {
  const sanitize = (v: number) => (Number.isFinite(v) ? v : v === Infinity ? null : 0);

  return {
    metrics: {
      totalTrades: o.metrics.totalTrades,
      winningTrades: o.metrics.winningTrades,
      losingTrades: o.metrics.losingTrades,
      winRate: o.metrics.winRate,
      profitFactor: sanitize(o.metrics.profitFactor),
      totalPnl: o.metrics.totalPnl,
      totalPnlPercent: o.metrics.totalPnlPercent,
      maxDrawdown: o.metrics.maxDrawdown,
      maxDrawdownPercent: o.metrics.maxDrawdownPercent,
      sharpeRatio: sanitize(o.metrics.sharpeRatio),
      sortinoRatio: sanitize(o.metrics.sortinoRatio),
      averageWin: o.metrics.averageWin,
      averageLoss: o.metrics.averageLoss,
      largestWin: o.metrics.largestWin,
      largestLoss: o.metrics.largestLoss,
      averageTradeDuration: o.metrics.averageTradeDuration,
      commission: o.metrics.commission,
    },
    equityCurve: o.equityCurve,
    drawdownCurve: o.drawdownCurve,
    trades: o.trades.map((t) => ({
      id: t.id,
      direction: t.direction,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      entryTime: t.entryTime,
      exitTime: t.exitTime,
      quantity: t.quantity,
      pnl: t.pnl,
      pnlPercent: t.pnlPercent,
      commission: t.commission,
      entryName: t.entryName,
      exitName: t.exitName,
      mae: t.mae,
      mfe: t.mfe,
      barsHeld: t.barsHeld,
    })),
    orders: o.filledOrders.map((o2) => ({
      id: o2.id,
      direction: o2.direction,
      action: o2.action,
      type: o2.type,
      quantity: o2.quantity,
      price: o2.price,
      fillPrice: o2.fillPrice,
      fillTime: o2.fillTime,
      entryName: o2.entryName,
      commission: o2.commission,
    })),
    equityPoints: o.equityPoints,
    monthlyReturns: o.monthlyReturns,
    buyHoldReturn: Math.round(o.buyHoldReturn * 100) / 100,
    // Contract BacktestResultExtension — the result payload's trust surface.
    effectiveConfig: opts.effectiveConfig,
    warnings: opts.warnings,
    // Parity coverage-gap: the API payload exposes the resolved bar count.
    barCount: opts.barCount,
  };
}

/**
 * Reproduces EXACTLY the CLI SymbolMetrics built in cli/symbol-runner.ts.
 *
 * NOTE on parity with the historical CLI source:
 *   - netProfit and netProfitPercent ARE now sanitized (Infinity → 0) here, so
 *     the CLI no longer post-sanitizes them. This keeps the historical CLI
 *     SymbolMetrics behavior byte-exact (the old CLI sanitized these two fields)
 *     and makes toCliSymbolResult the single source of truth for CLI metrics.
 *   - profitFactor / maxDrawdownPercent / winRate / sharpeRatio are also run
 *     through sanitize4 (Infinity → 0, otherwise non-finite → 0).
 *   - buyHoldReturn: the CLI rounds it (Math.round(x*100)/100), so it is rounded
 *     here to stay parity-exact with the CLI.
 *   - The engine returns buyHoldReturn at the outcome top-level (not on metrics),
 *     so it is read from o.buyHoldReturn.
 *
 * sanitize4: Infinity → 0 (NOT null), otherwise non-finite → 0.
 */
export function toCliSymbolResult(o: BacktestOutcome) {
  const sanitize4 = (v: number) => (Number.isFinite(v) ? v : 0);

  return {
    netProfit: sanitize4(o.metrics.totalPnl),
    netProfitPercent: sanitize4(o.metrics.totalPnlPercent),
    profitFactor: sanitize4(o.metrics.profitFactor),
    maxDrawdownPercent: sanitize4(o.metrics.maxDrawdownPercent),
    winRate: sanitize4(o.metrics.winRate),
    sharpeRatio: sanitize4(o.metrics.sharpeRatio),
    totalTrades: o.metrics.totalTrades,
    buyHoldReturn: Math.round(o.buyHoldReturn * 100) / 100,
  };
}

/**
 * Reproduces the auto-select subset built in trading/auto-select-runner.ts
 * LiveBacktestRunner.runBacktest. All fields taken RAW from o.metrics.
 */
export function toAutoSelectMetrics(o: BacktestOutcome) {
  return {
    sharpeRatio: o.metrics.sharpeRatio,
    profitFactor: o.metrics.profitFactor,
    totalPnl: o.metrics.totalPnl,
    totalPnlPercent: o.metrics.totalPnlPercent,
    winRate: o.metrics.winRate,
    totalTrades: o.metrics.totalTrades,
    maxDrawdown: o.metrics.maxDrawdown,
    maxDrawdownPercent: o.metrics.maxDrawdownPercent,
  };
}

/**
 * Compose the fee-decision diagnostic for the run (design D4 / M5 WarningCollector).
 *
 * Called at result assembly where BOTH the request's explicit config and the
 * engine's post-merge effective config are visible. Emits ONE fee-decision
 * record per run describing which commission method actually ran and with
 * which effective settings — so the live-fee/auto-select decisions applied
 * below this layer (backtest-config.ts applyDexFee, M3) become observable in
 * the API result payload and the export document.
 *
 * auto-select-method records are emitted by M3's own runner
 * (trading/auto-select-runner.ts) at the composition seam — the HTTP API path
 * has no auto-select mapping to record.
 */
export function buildDecisionWarnings(
  explicit: ExplicitBacktestOverride | null,
  effective: EffectiveBacktestConfig,
): BacktestWarning[] {
  const explicitMethod = explicit?.commissionMethod ?? null;
  const effectiveMethod = effective.commissionMethod;
  const effectiveSettings = effective.commissionMethodSettings ?? null;

  return [
    {
      type: 'fee-decision',
      message:
        explicitMethod !== null && explicitMethod === effectiveMethod
          ? `Commission method '${effectiveMethod}' (user-explicit)`
          : `Commission method '${effectiveMethod}' (${explicitMethod !== null ? `user-requested '${explicitMethod}' overridden` : 'resolved'})`,
      context: {
        explicitMethod,
        effectiveMethod,
        explicitSettings: explicit?.commissionMethodSettings ?? null,
        effectiveSettings,
      },
    },
  ];
}
