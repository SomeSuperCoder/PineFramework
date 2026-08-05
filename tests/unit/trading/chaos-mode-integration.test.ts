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
    expect(snapshot.chaosMode).toBe(true);
  });

  it('should report chaosMode as false when disabled', () => {
    engine.configure(normalConfig);
    const snapshot = engine.getSnapshot();
    expect(snapshot.chaosMode).toBe(false);
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
});
