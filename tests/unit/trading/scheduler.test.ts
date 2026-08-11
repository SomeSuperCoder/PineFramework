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

    const tasks = Array.from({ length: 10 }, () =>
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
      {
        pair: { symbol: 'SOL/USDC', timeframe: '1m' },
        action: 'buy',
        quantity: 1,
        price: 100,
        timestamp: 1000,
      },
    ]);

    await scheduler.tick([
      {
        symbol: 'SOL/USDC',
        timeframe: '1m',
        timestamp: 1000,
        open: 99,
        high: 101,
        low: 98,
        close: 100,
        volume: 1000,
      },
    ]);

    expect(processCandle).toHaveBeenCalledTimes(1);
    expect(submitOrders).toHaveBeenCalledTimes(1);
    expect(submitOrders).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ action: 'buy' })]),
    );
    expect(scheduler.stats.tickCount).toBe(1);
    expect(scheduler.stats.totalSignalsGenerated).toBe(1);
    expect(scheduler.stats.totalOrdersSubmitted).toBe(1);
  });

  it('should process candles in deterministic order', async () => {
    processCandle.mockResolvedValue([]);

    await scheduler.tick([
      {
        symbol: 'SOL/USDC',
        timeframe: '1m',
        timestamp: 1000,
        open: 99,
        high: 101,
        low: 98,
        close: 100,
        volume: 1000,
      },
      {
        symbol: 'BTC/USDC',
        timeframe: '5m',
        timestamp: 5000,
        open: 50000,
        high: 51000,
        low: 49000,
        close: 50500,
        volume: 100,
      },
      {
        symbol: 'SOL/USDC',
        timeframe: '5m',
        timestamp: 5000,
        open: 99,
        high: 102,
        low: 98,
        close: 101,
        volume: 2000,
      },
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
      {
        symbol: 'SOL/USDC',
        timeframe: '1m',
        timestamp: 1000,
        open: 99,
        high: 101,
        low: 98,
        close: 100,
        volume: 1000,
      },
    ]);

    expect(submitOrders).not.toHaveBeenCalled();
  });

  it('should skip processing when paused', async () => {
    scheduler.pause();
    expect(scheduler.paused).toBe(true);

    await scheduler.tick([
      {
        symbol: 'SOL/USDC',
        timeframe: '1m',
        timestamp: 1000,
        open: 99,
        high: 101,
        low: 98,
        close: 100,
        volume: 1000,
      },
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
      {
        symbol: 'SOL/USDC',
        timeframe: '1m',
        timestamp: 1000,
        open: 99,
        high: 101,
        low: 98,
        close: 100,
        volume: 1000,
      },
    ]);

    expect(processCandle).toHaveBeenCalled();
  });

  it('should continue processing on individual candle errors', async () => {
    processCandle
      .mockRejectedValueOnce(new Error('Candle processing failed'))
      .mockResolvedValueOnce([
        {
          pair: { symbol: 'BTC/USDC', timeframe: '5m' },
          action: 'buy',
          quantity: 1,
          price: 50000,
          timestamp: 5000,
        },
      ]);

    await scheduler.tick([
      {
        symbol: 'SOL/USDC',
        timeframe: '1m',
        timestamp: 1000,
        open: 99,
        high: 101,
        low: 98,
        close: 100,
        volume: 1000,
      },
      {
        symbol: 'BTC/USDC',
        timeframe: '5m',
        timestamp: 5000,
        open: 50000,
        high: 51000,
        low: 49000,
        close: 50500,
        volume: 100,
      },
    ]);

    // Second candle still processed even though first failed
    expect(submitOrders).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ action: 'buy' })]),
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
      {
        symbol: 'SOL/USDC',
        timeframe: '1m',
        timestamp: 1000,
        open: 99,
        high: 101,
        low: 98,
        close: 100,
        volume: 1000,
      },
    ]);
    expect(processCandle).not.toHaveBeenCalled();
  });

  it('should reset stats', async () => {
    processCandle.mockResolvedValue([
      {
        pair: { symbol: 'SOL/USDC', timeframe: '1m' },
        action: 'buy',
        quantity: 1,
        price: 100,
        timestamp: 1000,
      },
    ]);

    await scheduler.tick([
      {
        symbol: 'SOL/USDC',
        timeframe: '1m',
        timestamp: 1000,
        open: 99,
        high: 101,
        low: 98,
        close: 100,
        volume: 1000,
      },
    ]);

    expect(scheduler.stats.tickCount).toBe(1);

    scheduler.resetStats();
    expect(scheduler.stats.tickCount).toBe(0);
    expect(scheduler.stats.totalSignalsGenerated).toBe(0);
    expect(scheduler.stats.totalOrdersSubmitted).toBe(0);
  });

  it('should handle multiple ticks with accumulating stats', async () => {
    processCandle.mockResolvedValue([
      {
        pair: { symbol: 'SOL/USDC', timeframe: '1m' },
        action: 'buy',
        quantity: 1,
        price: 100,
        timestamp: 1000,
      },
    ]);

    await scheduler.tick([
      {
        symbol: 'SOL/USDC',
        timeframe: '1m',
        timestamp: 1000,
        open: 99,
        high: 101,
        low: 98,
        close: 100,
        volume: 1000,
      },
    ]);
    await scheduler.tick([
      {
        symbol: 'SOL/USDC',
        timeframe: '1m',
        timestamp: 2000,
        open: 100,
        high: 102,
        low: 99,
        close: 101,
        volume: 1000,
      },
    ]);
    await scheduler.tick([
      {
        symbol: 'SOL/USDC',
        timeframe: '1m',
        timestamp: 3000,
        open: 101,
        high: 103,
        low: 100,
        close: 102,
        volume: 1000,
      },
    ]);

    expect(scheduler.stats.tickCount).toBe(3);
    expect(scheduler.stats.totalSignalsGenerated).toBe(3);
    expect(scheduler.stats.totalOrdersSubmitted).toBe(3);
  });

  describe('AbortSignal support', () => {
    it('should process zero candles when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      processCandle.mockResolvedValue([]);
      await scheduler.tick(
        [
          {
            symbol: 'SOL/USDC',
            timeframe: '1m',
            timestamp: 1000,
            open: 99,
            high: 101,
            low: 98,
            close: 100,
            volume: 1000,
          },
        ],
        controller.signal,
      );

      expect(processCandle).not.toHaveBeenCalled();
      expect(submitOrders).not.toHaveBeenCalled();
      expect(scheduler.stats.tickCount).toBe(0);
    });

    it('should stop after current pair when signal aborts mid-batch', async () => {
      const controller = new AbortController();

      // First pair processes normally, then abort
      processCandle
        .mockImplementationOnce(async () => {
          controller.abort();
          return [];
        })
        .mockResolvedValue([]);

      await scheduler.tick(
        [
          {
            symbol: 'SOL/USDC',
            timeframe: '1m',
            timestamp: 1000,
            open: 99,
            high: 101,
            low: 98,
            close: 100,
            volume: 1000,
          },
          {
            symbol: 'BTC/USDC',
            timeframe: '5m',
            timestamp: 5000,
            open: 50000,
            high: 51000,
            low: 49000,
            close: 50500,
            volume: 100,
          },
          {
            symbol: 'SOL/USDC',
            timeframe: '5m',
            timestamp: 5000,
            open: 99,
            high: 102,
            low: 98,
            close: 101,
            volume: 2000,
          },
        ],
        controller.signal,
      );

      // Only the first pair (SOL/USDC 1m) was processed before abort
      expect(processCandle).toHaveBeenCalledTimes(1);
      expect(submitOrders).not.toHaveBeenCalled();
    });
  });
});

describe('Scheduler per-candle error surfacing (D3)', () => {
  const solPair = { symbol: 'SOL/USDC', timeframe: '1m' };
  const btcPair = { symbol: 'BTC/USDC', timeframe: '5m' };

  function makeCandle(symbol: string, timeframe: string, timestamp: number): ClosedCandle {
    return {
      symbol,
      timeframe,
      timestamp,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 1000,
    };
  }

  it('emits onCandleError with full context, counts it, and continues with the next pair', async () => {
    const onCandleError = vi.fn();
    const processCandle = vi
      .fn()
      // First pair throws — the per-candle catch must not kill the tick.
      .mockImplementationOnce(async () => {
        throw new Error('rpc boom');
      })
      // Second pair succeeds — its signals must still be collected/submitted.
      .mockImplementationOnce(async (candle: ClosedCandle) => [
        {
          pair: { symbol: candle.symbol, timeframe: candle.timeframe },
          action: 'buy' as const,
          quantity: 0.1,
          price: 100,
          timestamp: candle.timestamp,
        },
      ]);
    const submitOrders = vi.fn().mockResolvedValue(undefined);

    const scheduler = new Scheduler({
      pairs: [solPair, btcPair],
      processCandle: processCandle as (candle: ClosedCandle) => Promise<TradeSignal[]>,
      submitOrders,
      onCandleError,
    });

    await scheduler.tick([
      makeCandle('SOL/USDC', '1m', 1_000_000),
      makeCandle('BTC/USDC', '5m', 1_000_000),
    ]);

    expect(processCandle).toHaveBeenCalledTimes(2);
    expect(onCandleError).toHaveBeenCalledTimes(1);
    expect(onCandleError).toHaveBeenCalledWith({
      type: 'candle-error',
      pair: 'SOL/USDC:1m',
      timeframe: '1m',
      candleTimestamp: 1_000_000,
      message: 'rpc boom',
    });
    expect(scheduler.stats.totalCandleErrors).toBe(1);
    // The surviving pair's signals still flow to submitOrders.
    expect(submitOrders).toHaveBeenCalledTimes(1);
    expect(scheduler.stats.totalSignalsGenerated).toBe(1);
  });

  it('counts every failing candle and keeps processing subsequent pairs', async () => {
    const onCandleError = vi.fn();
    const processCandle = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw new Error('first failure');
      })
      .mockImplementationOnce(async () => {
        throw new Error('second failure');
      })
      .mockImplementationOnce(async () => []); // third pair succeeds cleanly
    const submitOrders = vi.fn().mockResolvedValue(undefined);

    const scheduler = new Scheduler({
      pairs: [solPair, btcPair, { symbol: 'ETH/USDC', timeframe: '15m' }],
      processCandle: processCandle as (candle: ClosedCandle) => Promise<TradeSignal[]>,
      submitOrders,
      onCandleError,
    });

    await scheduler.tick([
      makeCandle('SOL/USDC', '1m', 1_000_000),
      makeCandle('BTC/USDC', '5m', 1_000_000),
      makeCandle('ETH/USDC', '15m', 1_000_000),
    ]);

    expect(processCandle).toHaveBeenCalledTimes(3);
    expect(onCandleError).toHaveBeenCalledTimes(2);
    expect(scheduler.stats.totalCandleErrors).toBe(2);
    expect(onCandleError.mock.calls[0]![0].message).toBe('first failure');
    expect(onCandleError.mock.calls[1]![0].message).toBe('second failure');
  });

  it('does not emit onCandleError or count errors when every candle succeeds', async () => {
    const onCandleError = vi.fn();
    const processCandle = vi.fn().mockResolvedValue([]);
    const scheduler = new Scheduler({
      pairs: [solPair],
      processCandle: processCandle as (candle: ClosedCandle) => Promise<TradeSignal[]>,
      submitOrders: vi.fn().mockResolvedValue(undefined),
      onCandleError,
    });

    await scheduler.tick([makeCandle('SOL/USDC', '1m', 1_000_000)]);

    expect(onCandleError).not.toHaveBeenCalled();
    expect(scheduler.stats.totalCandleErrors).toBe(0);
  });
});
