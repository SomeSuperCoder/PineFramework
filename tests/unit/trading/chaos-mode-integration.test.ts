/**
 * Integration tests for chaos test mode.
 *
 * Tests the full flow: BotEngine with chaos mode → LiveStrategyExecutor → ChaosSignalGenerator.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before importing
vi.mock('../../../src/trading/solana-config.js', () => ({
  createSolanaConnection: vi.fn().mockReturnValue({}),
  getDefaultSolanaConfig: vi.fn().mockReturnValue({}),
}));

vi.mock('../../../src/trading/solana-wallet.js', () => ({
  createConnection: vi.fn().mockReturnValue({}),
  getSolBalance: vi.fn(),
  getTokenBalance: vi.fn(),
  USDC_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
}));

vi.mock('../../../src/trading/bybit-websocket.js', () => ({
  BybitWebSocketService: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    subscribe: vi.fn(),
    setCandleCallback: vi.fn(),
    setErrorCallback: vi.fn(),
    setConnectionCallback: vi.fn(),
  })),
}));

vi.mock('../../../src/trading/dex/jupiter-swap-adapter.js', () => ({
  JupiterSwapAdapter: vi.fn().mockImplementation(() => ({
    name: 'mock-jupiter',
    quote: vi.fn().mockResolvedValue({}),
    swap: vi.fn().mockResolvedValue({ success: true }),
    getBalance: vi.fn().mockResolvedValue({ amount: '10000000' }),
  })),
}));

vi.mock('../../../src/trading/live-scheduler.js', () => ({
  LiveScheduler: vi.fn().mockImplementation(() => ({
    liveTick: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn(),
  })),
}));

import { BotEngine } from '../../../src/trading/bot-engine.js';
import { BotState } from '../../../src/trading/types.js';
import type { BotConfig } from '../../../src/trading/types.js';
import { ChaosSignalGenerator } from '../../../src/trading/chaos-signal-generator.js';
import { LiveStrategyExecutor } from '../../../src/trading/live-strategy-executor.js';
import type { ClosedCandle } from '../../../src/trading/scheduler.js';

const chaosConfig: BotConfig = {
  strategySource: '', // No strategy needed in chaos mode
  dex: 'jupiter-swap',
  pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }],
  risk: { maxDailyLoss: 100 },
  chaosMode: { enabled: true },
};

const normalConfig: BotConfig = {
  strategySource: '//@version=5\nstrategy("test")',
  dex: 'jupiter-swap',
  pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }],
  risk: { maxDailyLoss: 100 },
  chaosMode: { enabled: false },
};

describe('Chaos Mode Integration', () => {
  let engine: BotEngine;

  beforeEach(() => {
    engine = new BotEngine();
  });

  it('should start with chaos mode enabled in config', () => {
    engine.configure(chaosConfig);
    expect(engine.config?.chaosMode?.enabled).toBe(true);
  });

  it('should report chaosMode in status snapshot', () => {
    engine.configure(chaosConfig);
    const snapshot = engine.getSnapshot();
    // chaosMode is now an object (D1/D4): enabled flag + execution mode
    // ('live' until the engine is started and seeds with a real balance).
    expect(snapshot.chaosMode).toMatchObject({
      enabled: true,
      executionMode: 'live',
    });
  });

  it('should report chaosMode as disabled in status snapshot', () => {
    engine.configure(normalConfig);
    const snapshot = engine.getSnapshot();
    expect(snapshot.chaosMode).toMatchObject({
      enabled: false,
      executionMode: 'live',
    });
  });

  it('should start without strategy source when chaos mode is on', async () => {
    engine.configure(chaosConfig);

    // Mock initialize to avoid real connections
    const initSpy = vi
      .spyOn(engine as unknown as { initialize: () => Promise<void> }, 'initialize')
      .mockResolvedValue(undefined);

    await engine.start();
    expect(engine.state).toBe(BotState.Running);
    initSpy.mockRestore();
  });

  it('should require strategy source when chaos mode is off', async () => {
    const noStrategyConfig = { ...normalConfig, strategySource: '' };
    engine.configure(noStrategyConfig);

    await expect(engine.start()).rejects.toThrow('Strategy source is required');
  });

  it('should create ChaosSignalGenerator when chaos mode is enabled', async () => {
    engine.configure(chaosConfig);

    let capturedConfig: any = null;
    const initSpy = vi
      .spyOn(engine as unknown as { initialize: () => Promise<void> }, 'initialize')
      .mockImplementation(async function (this: any) {
        // Capture what initialize does with the executor config
        capturedConfig = this._config;
      });

    await engine.start();
    expect(capturedConfig?.chaosMode?.enabled).toBe(true);
    initSpy.mockRestore();
  });
});

describe('ChaosSignalGenerator Integration with LiveStrategyExecutor', () => {
  it('should generate random signals through executor', async () => {
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    const generator = new ChaosSignalGenerator(mockLogger);

    const executor = new LiveStrategyExecutor({
      strategySource: '',
      dex: {
        name: 'mock',
        commissionModel: { name: 'mock', feeBps: 0, variable: false, description: 'Mock' },
        slippageConfig: { bps: 50, configurable: true },
        quote: vi.fn(),
        swap: vi.fn(),
        getBalance: vi.fn().mockResolvedValue({ amount: '10000000' }),
        getTransactionStatus: vi.fn(),
      } as any,
      walletManager: {
        getKeypair: vi.fn().mockResolvedValue({
          value: { publicKey: 'mock', privateKey: new Uint8Array(64) },
          dispose: vi.fn(),
        }),
      } as any,
      pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }],
      initialCapital: BigInt(10_000_000), // 10 USDC
      positionSizePercent: 100,
      maxDailyLoss: 100,
      chaosGenerator: generator,
    });

    await executor.initializeStrategy({ symbol: 'BTCUSDT', timeframe: '60' });

    const candle = {
      symbol: 'BTCUSDT',
      timeframe: '60',
      timestamp: Date.now(),
      open: 50000,
      high: 51000,
      low: 49000,
      close: 50000,
      volume: 100,
    };

    // Process multiple candles
    const signals1 = await executor.processCandle(candle as any);
    const signals2 = await executor.processCandle({
      ...candle,
      timestamp: candle.timestamp + 60000,
    } as any);
    const signals3 = await executor.processCandle({
      ...candle,
      timestamp: candle.timestamp + 120000,
    } as any);

    // All signals should come from chaos generator
    expect(generator.getSignalCount()).toBe(3);

    // Signals should have valid actions
    for (const signals of [signals1, signals2, signals3]) {
      if (signals.length > 0) {
        expect(['buy', 'sell']).toContain(signals[0].action);
      }
    }
  });

  it('clearChaosGenerator restores the non-chaos runtime and resumes real strategy execution (D5)', async () => {
    // Strategy that emits a long entry whenever close > sma(close, 3) — a real
    // runtime signal a chaos generator would never produce.
    const crossSource =
      '//@version=5\n' +
      'strategy("Cross", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=100)\n' +
      'if (close > ta.sma(close, 3))\n' +
      '    strategy.entry("Long", strategy.long)\n';

    // Deterministic stub (never 'short'/'exit' on a flat position, which the
    // random real generator could legitimately no-op into a 0-signal candle).
    const generator = {
      generate: vi.fn(() => ({ action: 'long', sizeFraction: 0.1, equity: 10, timestamp: 0 })),
      getSignalCount: vi.fn(() => 0),
    } as any;

    const executor = new LiveStrategyExecutor({
      strategySource: crossSource,
      dex: {
        name: 'mock',
        commissionModel: { name: 'mock', feeBps: 0, variable: false, description: 'Mock' },
        slippageConfig: { bps: 50, configurable: true },
        quote: vi.fn(),
        swap: vi.fn(),
        getBalance: vi.fn().mockResolvedValue({ amount: '10000000' }),
        getTransactionStatus: vi.fn(),
      } as any,
      walletManager: {
        getKeypair: vi.fn().mockResolvedValue({
          value: { publicKey: 'mock', privateKey: new Uint8Array(64) },
          dispose: vi.fn(),
        }),
      } as any,
      pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }],
      initialCapital: BigInt(10_000_000),
      positionSizePercent: 100,
      maxDailyLoss: 100,
      chaosGenerator: generator,
    });

    const pair = { symbol: 'BTCUSDT', timeframe: '60' };
    await executor.initializeStrategy(pair);

    // Chaos path drives a bare engine (real balance 10 USDC → live mode).
    const chaosCandle = {
      symbol: 'BTCUSDT',
      timeframe: '60',
      timestamp: 1_000_000,
      open: 50000,
      high: 51000,
      low: 49000,
      close: 50000,
      volume: 100,
    };
    const chaosSignals = await executor.processCandle(chaosCandle as any);
    expect(chaosSignals.length).toBeGreaterThan(0);
    expect(executor.getChaosExecutionMode()).toEqual({ mode: 'live' });
    const chaosGenerateCallsAtDisable = generator.generate.mock.calls.length;

    // Disable chaos: the generator is removed AND the runtime is rebuilt
    // through the non-chaos initialization path (spec: hot-swap disable).
    await executor.clearChaosGenerator();

    expect(executor.getChaosExecutionMode()).toEqual({ mode: 'live' });
    const state = (executor as any).strategyStates.get('BTCUSDT:60');
    expect(state.runtime).not.toBeNull(); // real compiled runtime, not a bare engine

    // Seed a downtrend so close stays below sma(close,3) (no warm-up entries),
    // then a live candle jumping above it must produce a genuine strategy buy
    // signal — NOT [] and NOT the chaos generator.
    const seed: ClosedCandle[] = [];
    let price = 110;
    for (let i = 0; i < 10; i++) {
      seed.push({
        symbol: 'BTCUSDT',
        timeframe: '60',
        timestamp: 2_000_000 + i * 60000,
        open: price,
        high: price + 2,
        low: price - 3,
        close: price - 1,
        volume: 1000,
      });
      price = price - 1;
    }
    await executor.warmUp(pair, seed);

    const last = seed[seed.length - 1]!;
    const live: ClosedCandle = {
      ...last,
      timestamp: last.timestamp + 60000,
      open: last.close,
      close: last.close + 12,
      high: last.close + 13,
      low: last.close + 8,
    };

    const realSignals = await executor.processCandle(live);
    expect(realSignals.length).toBeGreaterThan(0);
    expect(realSignals.some((s) => s.action === 'buy')).toBe(true);
    // No further chaos signal records are emitted after the toggle-off.
    expect(generator.generate.mock.calls.length).toBe(chaosGenerateCallsAtDisable);
  });
});
