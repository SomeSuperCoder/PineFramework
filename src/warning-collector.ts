/**
 * Per-run warning collector (OpenSpec backtest-parity-trust, design D4).
 *
 * WHY this module exists: engine diagnostics used to be console-only and
 * unreachable by callers — silent short-order suppressions, hidden baseline
 * defaults, commission-method conflicts. Consumers (the API result payload,
 * the full-data export, the CLI output) need typed, per-run diagnostics so a
 * run's effective behavior is fully explainable.
 *
 * This module is the SSOT for the BacktestWarning record + union. The API
 * contract (backend/src/backtest-contract.ts) re-exports these types from the
 * package main entry. The union is the EXTENSION POINT — append a new literal
 * here instead of widening `message` into a string free-for-all.
 *
 * DI: engines depend only on the narrow `WarningSink` function type. The
 * concrete `WarningCollector` is wired at the composition root
 * (backend/src/backtest-runner.ts / routes/backtest.ts / CLI sinks) — never
 * constructed inside a consumer (architecture law: depend on abstractions,
 * inject don't instantiate).
 */

/** Canonical diagnostic categories. Append new literals — never repurpose. */
export type BacktestWarningType =
  | 'long-only-suppression' // a short entry/order was suppressed by the long-only rule
  | 'fee-decision' // a commission method / explicit fees / live-fee decision was applied
  | 'baseline-applied' // a script-undeclared setting was defaulted by the engine's baseline
  | 'live-fee-cache' // live fee served from cache / stale
  | 'live-fee-failure' // live fee fetch failed; fallback used
  | 'auto-select-method' // an auto-selected method resolved for the run
  | 'export-failure'; // the full-data export could not be produced with full fidelity

/** One diagnostic emitted during a run. */
export interface BacktestWarning {
  type: BacktestWarningType;
  /** Human-readable explanation — the WHAT happened. */
  message: string;
  /** Structured context (names, values, decisions) — the WHY / details. */
  context?: Record<string, unknown>;
  /**
   * Severity of the diagnostic. Absent = 'warning' — only diagnostics that
   * confirm an explicit user choice use 'info' (e.g. a user-explicit
   * commission method); everything else is a genuine warning by default.
   */
  level?: 'info' | 'warning';
}

/**
 * Narrow producer-side seam the engines depend on (dependency inversion):
 * sinks only receive warnings; they never read engine internals.
 */
export type WarningSink = (warning: BacktestWarning) => void;

/** No-op sink — the default for engines constructed without infrastructure. */
export const NO_WARNING_SINK: WarningSink = () => {};

/**
 * Composition-root collector: a single array for the run's diagnostics.
 *
 * `onWarning` (the bound sink) is handed to the engines; the composition root
 * appends its own records via `push`; the API result payload and the export
 * document both serialize `toArray()`, so every consumer sees the SAME array
 * — warnings are never duplicated or drifted between the result and export.
 */
export class WarningCollector {
  private readonly warnings: BacktestWarning[] = [];

  /** Bound sink — pass this to engines (stable identity). */
  readonly onWarning: WarningSink = (warning: BacktestWarning) => {
    this.warnings.push(warning);
  };

  /** Append a warning produced by the composition root itself (e.g. decision records). */
  push(warning: BacktestWarning): void {
    this.warnings.push(warning);
  }

  /** Snapshot of all warnings collected so far (defensive copy). */
  toArray(): BacktestWarning[] {
    return [...this.warnings];
  }

  /** Number of warnings collected — cheap guard for callers. */
  get size(): number {
    return this.warnings.length;
  }
}
