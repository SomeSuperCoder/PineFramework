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
  StrategyEngine: vi.fn().mockImplementation(() => {
    // In-memory engine faithful enough for the chaos drive path
    // (processCandleChaos): updateBar / getEquity / getPosition / entry / close.
    const markers: any[] = [];
    let pos: { direction: string; quantity: number } = { direction: 'flat', quantity: 0 };
    return {
      updateBar: vi.fn(),
      getEquity: vi.fn().mockReturnValue(10_000_000_000),
      getPosition: vi.fn().mockReturnValue(pos),
      entry: vi.fn().mockImplementation((name: string, direction: string, quantity: number) => {
        pos = { direction, quantity };
        markers.push({
          type: 'entry',
          name,
          direction,
          quantity,
          price: 50000,
          barIndex: 0,
          timestamp: Date.now(),
          color: direction === 'long' ? '#00FF00' : '#FF0000',
        });
        return undefined;
      }),
      close: vi.fn().mockImplementation((name: string) => {
        markers.push({
          type: 'close',
          name: `Exit ${name}`,
          direction: pos.direction,
          quantity: pos.quantity,
          price: 50000,
          barIndex: 0,
          timestamp: Date.now(),
          color: '#FF0000',
        });
        pos = { direction: 'flat', quantity: 0 };
        return undefined;
      }),
      getNewMarkers: vi.fn().mockImplementation(() => markers.splice(0)),
    };
  }),
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

    it('should close long position when short signal received', async () => {
      const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
      await executor.initializeStrategy(pair);

      // Set up a long position via state
      const key = 'BTCUSDT:60';
      const state = (executor as any).strategyStates.get(key);
      state.position = {
        symbol: 'BTCUSDT',
        direction: 'long',
        quantity: 0.1,
        entryPrice: 50000,
        entryTime: Date.now() - 60000,
      };

      // Mock strategy engine to return short marker
      state.engine.getNewMarkers = vi.fn().mockReturnValue([
        { direction: 'short', action: 'sell', type: 'entry', name: 'Short', quantity: 0.1, price: 50000, barIndex: 100, timestamp: Date.now(), color: '#FF0000' },
      ]);

      const candle = {
        symbol: 'BTCUSDT',
        timeframe: '60',
        timestamp: Date.now(),
        open: 50000,
        high: 51000,
        low: 49000,
        close: 50500,
        volume: 1000,
      };

      const signals = await executor.processCandle(candle);
      expect(signals).toHaveLength(1);
      expect(signals[0].action).toBe('close');
      expect(signals[0].symbol).toBe('BTCUSDT');
      expect(signals[0].quantity).toBe(0.1);
    });

    it('should ignore short signal when flat and log warning', async () => {
      const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
      await executor.initializeStrategy(pair);

      // Position is flat (default)
      const key = 'BTCUSDT:60';
      const state = (executor as any).strategyStates.get(key);

      // Mock strategy engine to return short marker
      state.engine.getNewMarkers = vi.fn().mockReturnValue([
        { direction: 'short', action: 'sell', type: 'entry', name: 'Short', quantity: 0.1, price: 50000, barIndex: 100, timestamp: Date.now(), color: '#FF0000' },
      ]);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const candle = {
        symbol: 'BTCUSDT',
        timeframe: '60',
        timestamp: Date.now(),
        open: 50000,
        high: 51000,
        low: 49000,
        close: 50500,
        volume: 1000,
      };

      const signals = await executor.processCandle(candle);
      expect(signals).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Short signal received while flat'),
      );

      warnSpy.mockRestore();
    });

    it('should ignore short signal when already short and log warning', async () => {
      const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
      await executor.initializeStrategy(pair);

      // Set up a short position (theoretical)
      const key = 'BTCUSDT:60';
      const state = (executor as any).strategyStates.get(key);
      state.position = {
        symbol: 'BTCUSDT',
        direction: 'short',
        quantity: 0.1,
        entryPrice: 50000,
        entryTime: Date.now() - 60000,
      };

      // Mock strategy engine to return short marker
      state.engine.getNewMarkers = vi.fn().mockReturnValue([
        { direction: 'short', action: 'sell', type: 'entry', name: 'Short', quantity: 0.1, price: 50000, barIndex: 100, timestamp: Date.now(), color: '#FF0000' },
      ]);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const candle = {
        symbol: 'BTCUSDT',
        timeframe: '60',
        timestamp: Date.now(),
        open: 50000,
        high: 51000,
        low: 49000,
        close: 50500,
        volume: 1000,
      };

      const signals = await executor.processCandle(candle);
      expect(signals).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Short signal received while already short'),
      );

      warnSpy.mockRestore();
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

  describe('chaos mode', () => {
    it('should generate random signals when chaosGenerator is provided', async () => {
      const mockGenerator = {
        generate: vi.fn().mockReturnValue({
          action: 'long',
          sizeFraction: 0.1,
          equity: 1000,
          timestamp: Date.now(),
        }),
        getSignalCount: vi.fn().mockReturnValue(1),
      };

      const chaosConfig = { ...mockConfig, chaosGenerator: mockGenerator };
      const chaosExecutor = new LiveStrategyExecutor(chaosConfig);

      const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
      await chaosExecutor.initializeStrategy(pair);

      const candle = {
        symbol: 'BTCUSDT',
        timeframe: '60',
        timestamp: Date.now(),
        open: 50000,
        high: 51000,
        low: 49000,
        close: 50500,
        volume: 100,
      };

      const signals = await chaosExecutor.processCandle(candle as any);

      expect(mockGenerator.generate).toHaveBeenCalled();
      expect(signals.length).toBeGreaterThan(0);
      expect(signals[0].action).toBe('buy');
    });

    it('should use 10% sizing in chaos mode', async () => {
      let capturedEquity = 0;
      const mockGenerator = {
        generate: vi.fn().mockImplementation((equity: number) => {
          capturedEquity = equity;
          return {
            action: 'long',
            sizeFraction: 0.1,
            equity,
            timestamp: Date.now(),
          };
        }),
        getSignalCount: vi.fn().mockReturnValue(1),
      };

      const chaosConfig = { ...mockConfig, chaosGenerator: mockGenerator, initialCapital: BigInt(10_000_000) };
      const chaosExecutor = new LiveStrategyExecutor(chaosConfig);

      const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
      await chaosExecutor.initializeStrategy(pair);

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

      const signals = await chaosExecutor.processCandle(candle as any);

      // 10% of CHAOS_INITIAL_CAPITAL_LAMPORTS equity (10,000 USDC) = 1,000 USDC,
      // at $50000 = 0.02 tokens.
      expect(signals[0].quantity).toBeCloseTo(0.02, 6);
    });

    it('should not run strategy when chaos mode is active', async () => {
      const mockGenerator = {
        generate: vi.fn().mockReturnValue({
          action: 'exit',
          sizeFraction: 0.1,
          equity: 1000,
          timestamp: Date.now(),
        }),
        getSignalCount: vi.fn().mockReturnValue(1),
      };

      const chaosConfig = { ...mockConfig, chaosGenerator: mockGenerator };
      const chaosExecutor = new LiveStrategyExecutor(chaosConfig);

      const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
      await chaosExecutor.initializeStrategy(pair);

      const candle = {
        symbol: 'BTCUSDT',
        timeframe: '60',
        timestamp: Date.now(),
        open: 50000,
        high: 51000,
        low: 49000,
        close: 50500,
        volume: 100,
      };

      // Process multiple candles — should always use chaos generator
      await chaosExecutor.processCandle(candle as any);
      await chaosExecutor.processCandle({ ...candle, timestamp: candle.timestamp + 60000 } as any);

      expect(mockGenerator.generate).toHaveBeenCalledTimes(2);
    });
  });
});
