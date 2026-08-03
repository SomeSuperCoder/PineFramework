import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock modules before importing
vi.mock('../../../src/trading/live-strategy-executor.js', () => ({
  LiveStrategyExecutor: vi.fn().mockImplementation(() => ({
    processCandle: vi.fn().mockResolvedValue([]),
    executeSignal: vi.fn().mockResolvedValue({
      success: true,
      signal: { action: 'buy', symbol: 'BTCUSDT', quantity: 0.1, expectedPrice: 50000, timestamp: Date.now() },
      swapResult: { success: true, signature: 'mock-signature' },
    }),
    saveState: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../../src/trading/dex/dex-adapter.js', () => ({
  DexAdapter: vi.fn().mockImplementation(() => ({
    name: 'mock-dex',
    commissionModel: { name: 'mock', feeBps: 0, variable: false, description: 'Mock DEX' },
    slippageConfig: { bps: 50, configurable: true },
    quote: vi.fn(),
    swap: vi.fn(),
    getBalance: vi.fn(),
    getTransactionStatus: vi.fn(),
  })),
}));

import { LiveScheduler, LiveSchedulerOptions } from '../../../src/trading/live-scheduler.js';
import { LiveStrategyExecutor } from '../../../src/trading/live-strategy-executor.js';
import { DexAdapter } from '../../../src/trading/dex/dex-adapter.js';
import { ClosedCandle } from '../../../src/trading/scheduler.js';

describe('LiveScheduler', () => {
  let scheduler: LiveScheduler;
  let mockConfig: LiveSchedulerOptions;

  beforeEach(() => {
    vi.clearAllMocks();

    const mockExecutor = new LiveStrategyExecutor();
    const mockDex = new DexAdapter();

    mockConfig = {
      pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }],
      processCandle: vi.fn().mockResolvedValue([]),
      submitOrders: vi.fn(),
      strategyExecutor: mockExecutor as any,
      dex: mockDex as any,
      persistState: false,
    };

    scheduler = new LiveScheduler(mockConfig);
  });

  describe('constructor', () => {
    it('should create scheduler with config', () => {
      expect(scheduler).toBeDefined();
      expect(scheduler.paused).toBe(false);
      expect(scheduler.running).toBe(false);
    });
  });

  describe('liveTick', () => {
    it('should process candles via base tick', async () => {
      const candles: ClosedCandle[] = [
        {
          symbol: 'BTCUSDT',
          timeframe: '60',
          timestamp: Date.now(),
          open: 100,
          high: 110,
          low: 90,
          close: 105,
          volume: 1000,
        },
      ];

      await scheduler.liveTick(candles);

      expect(mockConfig.processCandle).toHaveBeenCalled();
    });

    it('should track live statistics', async () => {
      const candles: ClosedCandle[] = [
        {
          symbol: 'BTCUSDT',
          timeframe: '60',
          timestamp: Date.now(),
          open: 100,
          high: 110,
          low: 90,
          close: 105,
          volume: 1000,
        },
      ];

      await scheduler.liveTick(candles);

      const stats = scheduler.liveStats;
      expect(stats.tickCount).toBe(1);
      expect(stats.successfulOrders).toBe(0);
      expect(stats.failedOrders).toBe(0);
      expect(stats.totalExecutionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('liveStats', () => {
    it('should return live statistics with base stats', async () => {
      const candles: ClosedCandle[] = [
        {
          symbol: 'BTCUSDT',
          timeframe: '60',
          timestamp: Date.now(),
          open: 100,
          high: 110,
          low: 90,
          close: 105,
          volume: 1000,
        },
      ];

      await scheduler.liveTick(candles);

      const stats = scheduler.liveStats;
      expect(stats).toHaveProperty('successfulOrders');
      expect(stats).toHaveProperty('failedOrders');
      expect(stats).toHaveProperty('totalExecutionTimeMs');
      expect(stats).toHaveProperty('tickCount');
      expect(stats).toHaveProperty('pairCount');
    });
  });

  describe('resetLiveStats', () => {
    it('should reset live statistics', async () => {
      const candles: ClosedCandle[] = [
        {
          symbol: 'BTCUSDT',
          timeframe: '60',
          timestamp: Date.now(),
          open: 100,
          high: 110,
          low: 90,
          close: 105,
          volume: 1000,
        },
      ];

      await scheduler.liveTick(candles);
      scheduler.resetLiveStats();

      const stats = scheduler.liveStats;
      expect(stats.tickCount).toBe(0);
      expect(stats.successfulOrders).toBe(0);
      expect(stats.failedOrders).toBe(0);
      expect(stats.totalExecutionTimeMs).toBe(0);
    });
  });
});
