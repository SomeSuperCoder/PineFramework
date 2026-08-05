/**
 * WalletBalanceGuard — balance-based max daily loss safety guard.
 *
 * Unlike the PnL-based DailyStopLoss, this guard's source of truth is the
 * actual wallet USDC balance, so an emergency stop still triggers when real
 * losses occur even if PnL accounting is wrong.
 *
 * Semantics (D3):
 * - The reference is the highest balance observed during the trading day
 *   (monotonic high-water mark). A wallet increase raises the reference and
 *   banks the gain — a gain-then-giveback still counts as loss. This is the
 *   conservative "super safe" choice: deposits are assumed impossible while
 *   the bot runs, so any rise is trading gain.
 * - Loss = max(0, reference - current). Breach when loss >= maxDailyWalletLossUsdc.
 *
 * Fail-safe (D5): this class NEVER fetches a balance. Callers feed snapshots
 * via updateBalance(); a fetch failure is handled caller-side (log + skip).
 * It is deliberately synchronous and free of async/dex dependencies so it can
 * be unit-tested with synthetic snapshots.
 *
 * Units (D2): config is user-facing whole USDC (number); all internal math is
 * bigint micro-USDC (USDC has 6 decimals, 1 USDC = 1_000_000 micro-USDC) to
 * avoid float precision loss on large balances.
 *
 * Day boundary (D4): reuses getTradingDayStart() from daily-stop-loss.ts so
 * both guards agree on what "daily" means.
 *
 * Known limitations (accepted, documented): the high-water reference is
 * in-memory only and resets on restart (R3); runtime config changes via
 * updateConfig() apply immediately but are not persisted across restarts (R7).
 *
 * @module trading
 */

import { getTradingDayStart } from './daily-stop-loss.js';

/** Micro-USDC per whole USDC (USDC has 6 decimals). */
const MICRO_PER_USDC = 1_000_000n;

export interface WalletBalanceGuardConfig {
  /** Maximum daily wallet loss in whole USDC. 0 or negative = unlimited. */
  maxDailyWalletLossUsdc: number;
  /** Timezone for daily reset (e.g., "America/New_York", "UTC"). */
  timezone: string;
}

export class WalletBalanceGuard {
  private config: WalletBalanceGuardConfig;
  /**
   * Normalized max daily wallet loss in whole USDC (0 = unlimited).
   *
   * R2 fail-open: config validation rejects fractional values before the
   * guard is constructed, but a directly-constructed (misconfigured) guard
   * must never crash — BigInt(50.5) throws RangeError inside updateBalance.
   * A non-integer value is therefore treated as unlimited (disabled) with a
   * warning, so the guard can never take the system down at runtime.
   */
  private effectiveMaxLossUsdc: number;
  /** Highest balance observed this trading day (micro-USDC). */
  private _referenceMicro: bigint = 0n;
  /** Most recently observed balance (micro-USDC). */
  private _currentMicro: bigint = 0n;
  /** Start of the trading day the reference belongs to (ms epoch). */
  private currentDayStart: number = 0;
  private breached: boolean = false;

  constructor(config: WalletBalanceGuardConfig) {
    this.config = config;
    warnIfNonInteger(config.maxDailyWalletLossUsdc);
    this.effectiveMaxLossUsdc = normalizeMaxLoss(config.maxDailyWalletLossUsdc);
    // No reference is captured here — day capture is lazy and happens on the
    // first updateBalance() of a day (see updateBalance).
  }

  /** Whether the max daily wallet loss has been breached. */
  get isBreached(): boolean {
    return this.breached;
  }

  /** Current loss in whole USDC (truncated toward zero). */
  get lossUsdc(): number {
    return Number(this.lossMicro / MICRO_PER_USDC);
  }

  /** Current loss in micro-USDC (bigint, exact). */
  get lossMicro(): bigint {
    return this._referenceMicro - this._currentMicro >= 0n
      ? this._referenceMicro - this._currentMicro
      : 0n;
  }

  /** Day's high-water reference balance (micro-USDC). */
  get referenceMicro(): bigint {
    return this._referenceMicro;
  }

  /** Most recently observed balance (micro-USDC). */
  get currentMicro(): bigint {
    return this._currentMicro;
  }

  /** Configured max daily wallet loss in whole USDC (0 = unlimited). */
  get maxDailyWalletLossUsdc(): number {
    return this.config.maxDailyWalletLossUsdc;
  }

  /** Current config (copy). */
  getConfig(): WalletBalanceGuardConfig {
    return { ...this.config };
  }

  /**
   * Update config. Resets the day if the timezone changed; clears a breach if
   * the limit became unlimited.
   */
  updateConfig(partial: Partial<WalletBalanceGuardConfig>): void {
    const tzChanged = partial.timezone !== undefined && partial.timezone !== this.config.timezone;
    this.config = { ...this.config, ...partial };
    warnIfNonInteger(this.config.maxDailyWalletLossUsdc);
    this.effectiveMaxLossUsdc = normalizeMaxLoss(this.config.maxDailyWalletLossUsdc);
    if (tzChanged) {
      this.resetDay(Date.now());
    }
    if (this.effectiveMaxLossUsdc <= 0) {
      this.breached = false; // Unlimited — never breached
    }
  }

  /**
   * Whether a new position entry is allowed (no breach).
   * Note: does not itself re-capture the reference — that requires a fresh
   * balance snapshot via updateBalance().
   */
  canEnterPosition(): boolean {
    return !this.breached;
  }

  /**
   * Reset the guard for a new trading day. The reference becomes unknown
   * (0n) until the next updateBalance() snapshot re-captures it.
   */
  resetDay(now: number = Date.now()): void {
    this.currentDayStart = getTradingDayStart(now, this.config.timezone);
    this._referenceMicro = 0n;
    this._currentMicro = 0n;
    this.breached = false;
  }

  /**
   * Feed a wallet USDC balance snapshot (micro-USDC, 6 decimals).
   *
   * Lazy day-start capture: the first call of a trading day sets the
   * reference to the observed balance; when a later call falls on a new
   * trading day (midnight in the configured timezone passed), the reference
   * is re-captured from the current balance.
   *
   * Monotonic high-water: a balance above the reference raises the reference
   * (banking gains); only drops below the reference count as loss.
   *
   * @param balance wallet USDC balance in smallest units (micro-USDC)
   * @param now evaluation time (ms epoch); defaults to Date.now()
   * @returns whether the max daily wallet loss was breached
   */
  updateBalance(balance: bigint, now: number = Date.now()): boolean {
    const todayStart = getTradingDayStart(now, this.config.timezone);

    // Lazy day-start capture (D4): first evaluation of a day — or a new day
    // boundary — re-baselines the reference from the observed balance.
    if (this.currentDayStart === 0 || todayStart > this.currentDayStart) {
      this.currentDayStart = todayStart;
      this._referenceMicro = balance;
      this.breached = false;
    }

    this._currentMicro = balance;

    // Monotonic high-water reference (D3): gains raise the baseline, never lower it.
    if (balance > this._referenceMicro) {
      this._referenceMicro = balance;
    }

    if (this.effectiveMaxLossUsdc > 0) {
      const threshold = BigInt(this.effectiveMaxLossUsdc) * MICRO_PER_USDC;
      this.breached = this.lossMicro >= threshold;
    } else {
      this.breached = false; // Unlimited (0, negative, or non-integer — R2 fail-open)
    }

    return this.breached;
  }
}

/**
 * Normalize a configured loss limit to a safe whole-USDC value: a positive
 * integer keeps the limit; anything else (0, negative, non-integer) is
 * unlimited. A non-integer value cannot be converted to bigint micro-USDC
 * (BigInt throws RangeError) so it must never reach the comparison.
 */
function normalizeMaxLoss(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/** Warn once-style guard for misconfigured fractional limits (R2). */
function warnIfNonInteger(value: number): void {
  if (typeof value === 'number' && !Number.isInteger(value)) {
    console.warn(
      `[WalletBalanceGuard] Non-integer maxDailyWalletLossUsdc (${value}) is unsupported — treating the guard as unlimited (disabled).`,
    );
  }
}
