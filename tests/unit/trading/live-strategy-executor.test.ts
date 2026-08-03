import { describe, it, expect, beforeEach, vi } from 'vitest';

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

vi.mock('../../../src/strategy/strategy-engine.js', () => ({
  StrategyEngine: vi.fn().mockImplementation(() => ({
    // Mock strategy engine methods
  })),
}));

import { LiveStrategyExecutor, LiveStrategyConfig, TradeSignal } from '../../../src/trading/live-strategy-executor.js';
import { PairId } from '../../../src/trading/scheduler.js';

describe('LiveStrategyExecutor', () => {
  let executor: LiveStrategyExecutor;
  let mockConfig: LiveStrategyConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      strategySource: '//@version=5\nstrategy("Test")',
      dex: {
        name: 'mock-dex',
        commissionModel: { name: 'mock', feeBps: 0, variable: false, description: 'Mock DEX' },
        slippageConfig: { bps: 50, configurable: true },
        quote: vi.fn().mockResolvedValue({
          inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          outputMint: 'So11111111111111111111111111111111111111112',
          inAmount: '1000000',
          outAmount: '5000000',
          priceImpactPct: 0.1,
          route: 'mock-route',
          slippageBps: 50,
          feeBps: 0,
        }),
        swap: vi.fn().mockResolvedValue({
          success: true,
          signature: 'mock-signature',
          inputAmount: '1000000',
          outputAmount: '5000000',
          fee: '0',
        }),
        getBalance: vi.fn().mockResolvedValue({
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          amount: '10000000',
          decimals: 6,
        }),
        getTransactionStatus: vi.fn().mockResolvedValue('confirmed'),
      } as any,
      walletManager: {
        importWallet: vi.fn(),
        getKeypair: vi.fn().mockResolvedValue({
          value: {
            publicKey: 'mock-public-key',
            privateKey: new Uint8Array(64),
          },
          dispose: vi.fn(),
        }),
        hasWallet: vi.fn().mockResolvedValue(true),
      } as any,
      pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }],
      initialCapital: BigInt(1000000000), // 1000 USDC
      positionSizePercent: 10,
    };

    executor = new LiveStrategyExecutor(mockConfig);
  });

  describe('constructor', () => {
    it('should create executor with config', () => {
      expect(executor).toBeDefined();
    });
  });

  describe('initializeStrategy', () => {
    it('should initialize strategy for a pair', async () => {
      const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
      await executor.initializeStrategy(pair);

      const position = executor.getPosition(pair);
      expect(position).toBeDefined();
      expect(position?.direction).toBe('flat');
    });
  });

  describe('processCandle', () => {
    it('should process candle and return signals', async () => {
      const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
      await executor.initializeStrategy(pair);

      const candle = {
        symbol: 'BTCUSDT',
        timeframe: '60',
        timestamp: Date.now(),
        open: 100,
        high: 110,
        low: 90,
        close: 105,
        volume: 1000,
      };

      const signals = await executor.processCandle(candle);
      expect(Array.isArray(signals)).toBe(true);
    });

    it('should throw error if strategy not initialized', async () => {
      const candle = {
        symbol: 'BTCUSDT',
        timeframe: '60',
        timestamp: Date.now(),
        open: 100,
        high: 110,
        low: 90,
        close: 105,
        volume: 1000,
      };

      await expect(executor.processCandle(candle)).rejects.toThrow('Strategy not initialized');
    });
  });

  describe('executeSignal', () => {
    it('should execute buy signal', async () => {
      const signal: TradeSignal = {
        action: 'buy',
        symbol: 'BTCUSDT',
        quantity: 0.1,
        expectedPrice: 50000,
        timestamp: Date.now(),
      };

      const result = await executor.executeSignal(signal);
      expect(result.success).toBe(true);
      expect(result.signal).toBe(signal);
      expect(result.swapResult).toBeDefined();
    });

    it('should execute sell signal', async () => {
      const signal: TradeSignal = {
        action: 'sell',
        symbol: 'BTCUSDT',
        quantity: 0.1,
        expectedPrice: 50000,
        timestamp: Date.now(),
      };

      const result = await executor.executeSignal(signal);
      expect(result.success).toBe(true);
      expect(result.signal).toBe(signal);
    });
  });

  describe('getState and setState', () => {
    it('should get and set state', async () => {
      const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
      await executor.initializeStrategy(pair);

      const state = executor.getState();
      expect(Object.keys(state)).toHaveLength(1);

      // Create new executor and restore state
      const newExecutor = new LiveStrategyExecutor(mockConfig);
      newExecutor.setState(state);

      const restoredState = newExecutor.getState();
      expect(Object.keys(restoredState)).toHaveLength(1);
    });
  });
});
