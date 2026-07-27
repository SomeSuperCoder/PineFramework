import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Scheduler, Mutex } from '../../../src/trading/scheduler.js';
import type { ClosedCandle, TradeSignal } from '../../../src/trading/scheduler.js';

describe('Mutex', () => {
  it('should run exclusive sections serially', async () => {
    const mutex = new Mutex();
    const results: number[] = [];

    await Promise.all([
      mutex.runExclusive(async () => {
        await new Promise((r) => setTimeout(r, 10));
        results.push(1);
      }),
      mutex.runExclusive(async () => {
        results.push(2);
      }),
    ]);

    expect(results).toEqual([1, 2]); // first acquires lock, second waits
  });

  it('should handle concurrent access without race conditions', async () => {
    const mutex = new Mutex();
    let counter = 0;

    const tasks = Array.from({ length: 10 }, (_, i) =>
      mutex.runExclusive(async () => {
        const val = counter;
        await new Promise((r) => setTimeout(r, Math.random() * 5));
        counter = val + 1;
      }),
    );

    await Promise.all(tasks);
    expect(counter).toBe(10);
  });
});

describe('Scheduler', () => {
  let scheduler: Scheduler;
  const processCandle = vi.fn();
  const submitOrders = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    scheduler = new Scheduler({
      pairs: [
        { symbol: 'SOL/USDC', timeframe: '1m' },
        { symbol: 'BTC/USDC', timeframe: '5m' },
        { symbol: 'SOL/USDC', timeframe: '5m' },
      ],
      processCandle: processCandle as (candle: ClosedCandle) => Promise<TradeSignal[]>,
      submitOrders: submitOrders as (signals: TradeSignal[]) => Promise<void>,
    });
  });

  it('should start not paused', () => {
    expect(scheduler.paused).toBe(false);
  });

  it('should process candles and submit signals', async () => {
    processCandle.mockResolvedValue([
      { pair: { symbol: 'SOL/USDC', timeframe: '1m' }, action: 'buy', quantity: 1, price: 100, timestamp: 1000 },
    ]);

    await scheduler.tick([
      { symbol: 'SOL/USDC', timeframe: '1m', timestamp: 1000, open: 99, high: 101, low: 98, close: 100, volume: 1000 },
    ]);

    expect(processCandle).toHaveBeenCalledTimes(1);
    expect(submitOrders).toHaveBeenCalledTimes(1);
    expect(submitOrders).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ action: 'buy' })])
    );
    expect(scheduler.stats.tickCount).toBe(1);
    expect(scheduler.stats.totalSignalsGenerated).toBe(1);
    expect(scheduler.stats.totalOrdersSubmitted).toBe(1);
  });

  it('should process candles in deterministic order', async () => {
    processCandle.mockResolvedValue([]);

    await scheduler.tick([
      { symbol: 'SOL/USDC', timeframe: '1m', timestamp: 1000, open: 99, high: 101, low: 98, close: 100, volume: 1000 },
      { symbol: 'BTC/USDC', timeframe: '5m', timestamp: 5000, open: 50000, high: 51000, low: 49000, close: 50500, volume: 100 },
      { symbol: 'SOL/USDC', timeframe: '5m', timestamp: 5000, open: 99, high: 102, low: 98, close: 101, volume: 2000 },
    ]);

    // Should have been called 3 times (once per matching pair)
    expect(processCandle).toHaveBeenCalledTimes(3);

    // Order should be: SOL/USDC 1m, BTC/USDC 5m, SOL/USDC 5m (config order)
    const calls = processCandle.mock.calls;
    expect(calls[0]![0]!.symbol).toBe('SOL/USDC');
    expect(calls[0]![0]!.timeframe).toBe('1m');
    expect(calls[1]![0]!.symbol).toBe('BTC/USDC');
    expect(calls[1]![0]!.timeframe).toBe('5m');
    expect(calls[2]![0]!.symbol).toBe('SOL/USDC');
    expect(calls[2]![0]!.timeframe).toBe('5m');
  });

  it('should not submit orders when no signals generated', async () => {
    processCandle.mockResolvedValue([]);

    await scheduler.tick([
      { symbol: 'SOL/USDC', timeframe: '1m', timestamp: 1000, open: 99, high: 101, low: 98, close: 100, volume: 1000 },
    ]);

    expect(submitOrders).not.toHaveBeenCalled();
  });

  it('should skip processing when paused', async () => {
    scheduler.pause();
    expect(scheduler.paused).toBe(true);

    await scheduler.tick([
      { symbol: 'SOL/USDC', timeframe: '1m', timestamp: 1000, open: 99, high: 101, low: 98, close: 100, volume: 1000 },
    ]);

    expect(processCandle).not.toHaveBeenCalled();
    expect(scheduler.stats.tickCount).toBe(0);
  });

  it('should resume processing after pause', async () => {
    scheduler.pause();
    scheduler.resume();
    expect(scheduler.paused).toBe(false);

    processCandle.mockResolvedValue([]);
    await scheduler.tick([
      { symbol: 'SOL/USDC', timeframe: '1m', timestamp: 1000, open: 99, high: 101, low: 98, close: 100, volume: 1000 },
    ]);

    expect(processCandle).toHaveBeenCalled();
  });

  it('should continue processing on individual candle errors', async () => {
    processCandle
      .mockRejectedValueOnce(new Error('Candle processing failed'))
      .mockResolvedValueOnce([
        { pair: { symbol: 'BTC/USDC', timeframe: '5m' }, action: 'buy', quantity: 1, price: 50000, timestamp: 5000 },
      ]);

    await scheduler.tick([
      { symbol: 'SOL/USDC', timeframe: '1m', timestamp: 1000, open: 99, high: 101, low: 98, close: 100, volume: 1000 },
      { symbol: 'BTC/USDC', timeframe: '5m', timestamp: 5000, open: 50000, high: 51000, low: 49000, close: 50500, volume: 100 },
    ]);

    // Second candle still processed even though first failed
    expect(submitOrders).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ action: 'buy' })])
    );
  });

  it('should expose stats', () => {
    expect(scheduler.stats.pairCount).toBe(3);
    expect(scheduler.stats.tickCount).toBe(0);
    expect(typeof scheduler.stats.lastTickTime).toBe('number');
  });

  it('should stop and prevent further processing', async () => {
    scheduler.stop();
    expect(scheduler.running).toBe(false);
    expect(scheduler.paused).toBe(true);

    processCandle.mockResolvedValue([]);
    await scheduler.tick([
      { symbol: 'SOL/USDC', timeframe: '1m', timestamp: 1000, open: 99, high: 101, low: 98, close: 100, volume: 1000 },
    ]);
    expect(processCandle).not.toHaveBeenCalled();
  });

  it('should reset stats', async () => {
    processCandle.mockResolvedValue([
      { pair: { symbol: 'SOL/USDC', timeframe: '1m' }, action: 'buy', quantity: 1, price: 100, timestamp: 1000 },
    ]);

    await scheduler.tick([
      { symbol: 'SOL/USDC', timeframe: '1m', timestamp: 1000, open: 99, high: 101, low: 98, close: 100, volume: 1000 },
    ]);

    expect(scheduler.stats.tickCount).toBe(1);

    scheduler.resetStats();
    expect(scheduler.stats.tickCount).toBe(0);
    expect(scheduler.stats.totalSignalsGenerated).toBe(0);
    expect(scheduler.stats.totalOrdersSubmitted).toBe(0);
  });

  it('should handle multiple ticks with accumulating stats', async () => {
    processCandle.mockResolvedValue([
      { pair: { symbol: 'SOL/USDC', timeframe: '1m' }, action: 'buy', quantity: 1, price: 100, timestamp: 1000 },
    ]);

    await scheduler.tick([
      { symbol: 'SOL/USDC', timeframe: '1m', timestamp: 1000, open: 99, high: 101, low: 98, close: 100, volume: 1000 },
    ]);
    await scheduler.tick([
      { symbol: 'SOL/USDC', timeframe: '1m', timestamp: 2000, open: 100, high: 102, low: 99, close: 101, volume: 1000 },
    ]);
    await scheduler.tick([
      { symbol: 'SOL/USDC', timeframe: '1m', timestamp: 3000, open: 101, high: 103, low: 100, close: 102, volume: 1000 },
    ]);

    expect(scheduler.stats.tickCount).toBe(3);
    expect(scheduler.stats.totalSignalsGenerated).toBe(3);
    expect(scheduler.stats.totalOrdersSubmitted).toBe(3);
  });
});
