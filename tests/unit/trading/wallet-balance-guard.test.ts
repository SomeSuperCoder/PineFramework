import { describe, it, expect, vi } from 'vitest';
import { WalletBalanceGuard } from '../../../src/trading/risk/wallet-balance-guard.js';
import { getTradingDayStart } from '../../../src/trading/risk/daily-stop-loss.js';

// Fixed timestamps: June 1 & June 2 2024 in UTC.
// t1 = 2024-06-01T12:00:00Z (noon UTC; 08:00 EDT in America/New_York)
// t2 = 2024-06-02T01:00:00Z (still 2024-06-01 21:00 EDT in New York)
const t1 = Date.UTC(2024, 5, 1, 12);
const t2 = Date.UTC(2024, 5, 2, 1);

const USDC = 1_000_000n; // 1 whole USDC in micro-USDC

describe('WalletBalanceGuard', () => {
  describe('day reference capture', () => {
    it('captures the reference on first evaluation of a day', () => {
      const guard = new WalletBalanceGuard({ maxDailyWalletLossUsdc: 50, timezone: 'UTC' });
      const breached = guard.updateBalance(100n * USDC, t1);

      expect(breached).toBe(false);
      expect(guard.referenceMicro).toBe(100n * USDC);
      expect(guard.currentMicro).toBe(100n * USDC);
      expect(guard.lossMicro).toBe(0n);
      expect(guard.lossUsdc).toBe(0);
    });

    it('re-captures the reference when a new trading day begins', () => {
      const guard = new WalletBalanceGuard({ maxDailyWalletLossUsdc: 50, timezone: 'UTC' });

      // Day 1: capture 100 USDC, drop to 50 USDC (50 USDC loss, at threshold)
      guard.updateBalance(100n * USDC, t1);
      guard.updateBalance(50n * USDC, t1);
      expect(guard.isBreached).toBe(true);

      // Day 2: balance 90 USDC re-captured as the new reference — no loss
      const breached = guard.updateBalance(90n * USDC, t2);
      expect(breached).toBe(false);
      expect(guard.referenceMicro).toBe(90n * USDC);
      expect(guard.lossMicro).toBe(0n);
      expect(guard.isBreached).toBe(false);
    });

    it('does not re-capture within the same trading day', () => {
      const guard = new WalletBalanceGuard({ maxDailyWalletLossUsdc: 50, timezone: 'UTC' });
      guard.updateBalance(100n * USDC, t1);
      guard.updateBalance(80n * USDC, t1);

      // Same day, same reference (not re-captured to 80)
      expect(guard.referenceMicro).toBe(100n * USDC);
      expect(guard.lossMicro).toBe(20n * USDC);
    });
  });

  describe('monotonic high-water reference', () => {
    it('raises the reference on balance increase and records no loss', () => {
      const guard = new WalletBalanceGuard({ maxDailyWalletLossUsdc: 50, timezone: 'UTC' });
      guard.updateBalance(100n * USDC, t1);

      const breached = guard.updateBalance(150n * USDC, t1);
      expect(breached).toBe(false);
      expect(guard.referenceMicro).toBe(150n * USDC);
      expect(guard.lossMicro).toBe(0n);
    });

    it('counts only drops below the reference as loss', () => {
      const guard = new WalletBalanceGuard({ maxDailyWalletLossUsdc: 50, timezone: 'UTC' });
      guard.updateBalance(100n * USDC, t1);

      // Gain to 150 then fall back to 120: loss is 30 (from peak), not 0
      guard.updateBalance(150n * USDC, t1);
      guard.updateBalance(120n * USDC, t1);

      expect(guard.referenceMicro).toBe(150n * USDC);
      expect(guard.lossMicro).toBe(30n * USDC);
      expect(guard.lossUsdc).toBe(30);
      expect(guard.isBreached).toBe(false);
    });

    it('never goes negative for loss', () => {
      const guard = new WalletBalanceGuard({ maxDailyWalletLossUsdc: 50, timezone: 'UTC' });
      guard.updateBalance(100n * USDC, t1);
      guard.updateBalance(120n * USDC, t1);

      expect(guard.lossMicro).toBe(0n);
    });
  });

  describe('breach detection', () => {
    it('breaches when loss reaches the exact threshold', () => {
      const guard = new WalletBalanceGuard({ maxDailyWalletLossUsdc: 50, timezone: 'UTC' });
      guard.updateBalance(100n * USDC, t1);

      const breached = guard.updateBalance(50n * USDC, t1);
      expect(breached).toBe(true);
      expect(guard.isBreached).toBe(true);
      expect(guard.lossMicro).toBe(50n * USDC);
      expect(guard.lossUsdc).toBe(50);
      expect(guard.canEnterPosition()).toBe(false);
    });

    it('does not breach when loss is below the threshold', () => {
      const guard = new WalletBalanceGuard({ maxDailyWalletLossUsdc: 50, timezone: 'UTC' });
      guard.updateBalance(100n * USDC, t1);

      const breached = guard.updateBalance(51n * USDC, t1);
      expect(breached).toBe(false);
      expect(guard.isBreached).toBe(false);
      expect(guard.lossMicro).toBe(49n * USDC);
      expect(guard.canEnterPosition()).toBe(true);
    });

    it('detects breaches with sub-whole-USDC precision (bigint math)', () => {
      const guard = new WalletBalanceGuard({ maxDailyWalletLossUsdc: 50, timezone: 'UTC' });
      guard.updateBalance(100n * USDC, t1);

      // Drop to 49.3 USDC → loss of 50.7 USDC (50_700_000 micro) ≥ 50 USDC
      guard.updateBalance(100n * USDC - 300_000n, t1);
      expect(guard.isBreached).toBe(false);

      const breached = guard.updateBalance(49_300_000n, t1);
      expect(breached).toBe(true);
      expect(guard.lossMicro).toBe(50_700_000n);
      // lossUsdc truncates to whole USDC
      expect(guard.lossUsdc).toBe(50);
    });
  });

  describe('unlimited config', () => {
    it('never breaches when maxDailyWalletLossUsdc is 0', () => {
      const guard = new WalletBalanceGuard({ maxDailyWalletLossUsdc: 0, timezone: 'UTC' });
      guard.updateBalance(100n * USDC, t1);

      const breached = guard.updateBalance(0n, t1);
      expect(breached).toBe(false);
      expect(guard.isBreached).toBe(false);
      expect(guard.lossMicro).toBe(100n * USDC);
      expect(guard.canEnterPosition()).toBe(true);
    });

    it('never breaches when maxDailyWalletLossUsdc is negative', () => {
      const guard = new WalletBalanceGuard({ maxDailyWalletLossUsdc: -10, timezone: 'UTC' });
      guard.updateBalance(100n * USDC, t1);

      const breached = guard.updateBalance(0n, t1);
      expect(breached).toBe(false);
      expect(guard.isBreached).toBe(false);
    });
  });

  describe('non-integer config defense (R2)', () => {
    it('treats a fractional limit as unlimited (fail-open) and never throws', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const guard = new WalletBalanceGuard({ maxDailyWalletLossUsdc: 50.5, timezone: 'UTC' });

      // A fractional value would make BigInt() throw inside updateBalance;
      // the guard must degrade to unlimited instead of crashing at runtime.
      expect(() => guard.updateBalance(100n * USDC, t1)).not.toThrow();
      const breached = guard.updateBalance(0n, t1);
      expect(breached).toBe(false);
      expect(guard.isBreached).toBe(false);
      expect(guard.canEnterPosition()).toBe(true);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('resetDay', () => {
    it('clears breach and reference until next snapshot', () => {
      const guard = new WalletBalanceGuard({ maxDailyWalletLossUsdc: 50, timezone: 'UTC' });
      guard.updateBalance(100n * USDC, t1);
      guard.updateBalance(0n, t1);
      expect(guard.isBreached).toBe(true);

      guard.resetDay(t2);

      expect(guard.isBreached).toBe(false);
      expect(guard.lossMicro).toBe(0n);
      expect(guard.canEnterPosition()).toBe(true);

      // Next snapshot re-captures the reference for the new day
      guard.updateBalance(80n * USDC, t2);
      expect(guard.referenceMicro).toBe(80n * USDC);
    });
  });

  describe('config management', () => {
    it('returns a copy of the config', () => {
      const guard = new WalletBalanceGuard({ maxDailyWalletLossUsdc: 50, timezone: 'UTC' });
      const config = guard.getConfig();
      expect(config).toEqual({ maxDailyWalletLossUsdc: 50, timezone: 'UTC' });
    });

    it('updates the loss threshold', () => {
      const guard = new WalletBalanceGuard({ maxDailyWalletLossUsdc: 50, timezone: 'UTC' });
      guard.updateConfig({ maxDailyWalletLossUsdc: 200 });

      expect(guard.getConfig().maxDailyWalletLossUsdc).toBe(200);
      expect(guard.maxDailyWalletLossUsdc).toBe(200);

      // Now a 150 USDC loss is below the new threshold
      guard.updateBalance(150n * USDC, t1);
      guard.updateBalance(0n, t1);
      expect(guard.isBreached).toBe(false);
    });

    it('clears an armed breach when the limit becomes unlimited', () => {
      const guard = new WalletBalanceGuard({ maxDailyWalletLossUsdc: 50, timezone: 'UTC' });
      guard.updateBalance(100n * USDC, t1);
      guard.updateBalance(0n, t1);
      expect(guard.isBreached).toBe(true);

      guard.updateConfig({ maxDailyWalletLossUsdc: 0 });
      expect(guard.isBreached).toBe(false);
    });

    it('resets the day when the timezone changes', () => {
      const guard = new WalletBalanceGuard({ maxDailyWalletLossUsdc: 50, timezone: 'UTC' });
      guard.updateBalance(100n * USDC, t1);
      guard.updateBalance(0n, t1);
      expect(guard.isBreached).toBe(true);

      guard.updateConfig({ timezone: 'America/New_York' });
      expect(guard.isBreached).toBe(false);
      expect(guard.referenceMicro).toBe(0n);
    });
  });

  describe('timezone behavior', () => {
    it('uses the configured timezone to determine the trading day boundary', () => {
      // t2 (2024-06-02T01:00:00Z) is a NEW day in UTC but still the SAME day
      // (2024-06-01) in America/New_York.
      const utcGuard = new WalletBalanceGuard({ maxDailyWalletLossUsdc: 50, timezone: 'UTC' });
      utcGuard.updateBalance(100n * USDC, t1);
      utcGuard.updateBalance(50n * USDC, t2); // new UTC day → re-capture, no loss
      expect(utcGuard.referenceMicro).toBe(50n * USDC);
      expect(utcGuard.lossMicro).toBe(0n);

      const nyGuard = new WalletBalanceGuard({
        maxDailyWalletLossUsdc: 50,
        timezone: 'America/New_York',
      });
      nyGuard.updateBalance(100n * USDC, t1);
      nyGuard.updateBalance(50n * USDC, t2); // same NY day → 50 USDC loss, breached
      expect(nyGuard.referenceMicro).toBe(100n * USDC);
      expect(nyGuard.lossMicro).toBe(50n * USDC);
      expect(nyGuard.isBreached).toBe(true);
    });

    it('agrees with getTradingDayStart for the day boundary (D4)', () => {
      const guard = new WalletBalanceGuard({ maxDailyWalletLossUsdc: 50, timezone: 'EST' });
      expect(getTradingDayStart(t1, 'EST')).toBe(getTradingDayStart(t1, 'America/New_York'));
      guard.updateBalance(100n * USDC, t1);
      expect(guard.referenceMicro).toBe(100n * USDC);
    });
  });

  describe('fail-safe semantics (caller-side fetch)', () => {
    it('armed breach persists when a fetch failure skips the snapshot', () => {
      const guard = new WalletBalanceGuard({ maxDailyWalletLossUsdc: 50, timezone: 'UTC' });
      guard.updateBalance(100n * USDC, t1);
      guard.updateBalance(0n, t1);
      expect(guard.isBreached).toBe(true);

      // Fail-safe (D5): a fetch failure means the caller logs + skips
      // updateBalance entirely — the armed breach must persist so the bot
      // stays stopped. It must NOT be cleared by absence of a snapshot.
      expect(guard.isBreached).toBe(true);
      expect(guard.canEnterPosition()).toBe(false);
    });

    it('never throws on any snapshot (guard has no fetch/async path)', () => {
      const guard = new WalletBalanceGuard({ maxDailyWalletLossUsdc: 50, timezone: 'UTC' });
      expect(() => guard.updateBalance(0n, t1)).not.toThrow();
      expect(() => guard.updateBalance(1_000_000_000n * USDC, t2)).not.toThrow();
    });
  });
});
