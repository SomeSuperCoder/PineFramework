import { describe, it, expect, beforeEach } from 'vitest';
import { RollingLossGuard } from '../../../src/trading/risk/rolling-loss-guard.js';

describe('RollingLossGuard', () => {
  let guard: RollingLossGuard;
  const NOW = 1000000000000; // Fixed timestamp

  beforeEach(() => {
    guard = new RollingLossGuard();
  });

  describe('addTrade', () => {
    it('should record a loss trade', () => {
      guard.addTrade(-50, NOW);
      expect(guard.totalLoss()).toBe(50);
    });

    it('should not count profits toward loss', () => {
      guard.addTrade(100, NOW);
      expect(guard.totalLoss()).toBe(0);
    });

    it('should accumulate multiple losses', () => {
      guard.addTrade(-30, NOW);
      guard.addTrade(-20, NOW);
      guard.addTrade(-50, NOW);
      expect(guard.totalLoss()).toBe(100);
    });
  });

  describe('prune', () => {
    it('should remove trades older than 24h', () => {
      const twentyFourHours = 24 * 60 * 60 * 1000;

      guard.addTrade(-50, NOW - twentyFourHours - 1000); // Old trade
      guard.addTrade(-30, NOW); // Recent trade

      guard.prune(NOW);

      expect(guard.totalLoss()).toBe(30);
    });

    it('should keep trades within 24h', () => {
      const twentyThreeHours = 23 * 60 * 60 * 1000;

      guard.addTrade(-50, NOW - twentyThreeHours);
      guard.addTrade(-30, NOW);

      guard.prune(NOW);

      expect(guard.totalLoss()).toBe(80);
    });
  });

  describe('isBreached', () => {
    it('should return false when loss is below limit', () => {
      guard.addTrade(-50, NOW);
      expect(guard.isBreached(100, NOW)).toBe(false);
    });

    it('should return true when loss reaches limit', () => {
      guard.addTrade(-100, NOW);
      expect(guard.isBreached(100, NOW)).toBe(true);
    });

    it('should return true when loss exceeds limit', () => {
      guard.addTrade(-150, NOW);
      expect(guard.isBreached(100, NOW)).toBe(true);
    });

    it('should return false when maxLoss is 0 (unlimited)', () => {
      guard.addTrade(-1000, NOW);
      expect(guard.isBreached(0, NOW)).toBe(false);
    });
  });

  describe('canEnterPosition', () => {
    it('should allow entry when loss is below limit', () => {
      guard.addTrade(-50, NOW);
      expect(guard.canEnterPosition(100, NOW)).toBe(true);
    });

    it('should block entry when loss reaches limit', () => {
      guard.addTrade(-100, NOW);
      expect(guard.canEnterPosition(100, NOW)).toBe(false);
    });

    it('should allow entry when maxLoss is 0 (unlimited)', () => {
      guard.addTrade(-1000, NOW);
      expect(guard.canEnterPosition(0, NOW)).toBe(true);
    });
  });

  describe('totalPnl', () => {
    it('should calculate net PnL including profits', () => {
      guard.addTrade(100, NOW);
      guard.addTrade(-50, NOW);
      guard.addTrade(-30, NOW);
      expect(guard.totalPnl()).toBe(20);
    });
  });

  describe('tradeCount', () => {
    it('should count all trades in window', () => {
      guard.addTrade(100, NOW);
      guard.addTrade(-50, NOW);
      guard.addTrade(-30, NOW);
      expect(guard.tradeCount()).toBe(3);
    });
  });

  describe('clear', () => {
    it('should reset all trades', () => {
      guard.addTrade(-50, NOW);
      guard.addTrade(-30, NOW);
      guard.clear();
      expect(guard.totalLoss()).toBe(0);
      expect(guard.tradeCount()).toBe(0);
    });
  });
});
