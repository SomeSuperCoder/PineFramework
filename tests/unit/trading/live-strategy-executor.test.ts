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
      // D4 warning-sink seam (strategy-engine.ts:144) — ExecutionEngine
      // calls setWarningSink non-optionally after construction.
      setWarningSink: vi.fn(),
      // Engine equity basis is decimal quote units USDC (Director formula —
      // getEquity() includes floating PnL while open). 10,000 USDC = the chaos
      // fallback floor. OLD basis was lamports (10_000_000_000) and the chaos
      // path divided by 1e6; the executor now reads getEquity() directly.
      getEquity: vi.fn().mockReturnValue(10_000),
      getPosition: vi.fn().mockImplementation(() => pos),
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

import {
  LiveStrategyExecutor,
  LiveStrategyConfig,
  TradeSignal,
} from '../../../src/trading/live-strategy-executor.js';
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
      maxDailyLoss: 100,
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

      // Drive the live path through the runtime's executeBar returning a short marker
      state.runtime = {
        // Live-wiring seam (strategy.equity): processCandle injects the real
        // USDC wallet balance via setEquitySource before each bar runs.
        setEquitySource: vi.fn(),
        executeBar: vi.fn().mockReturnValue({
          success: true,
          strategyMarkers: [
            {
              direction: 'short',
              action: 'sell',
              type: 'entry',
              name: 'Short',
              quantity: 0.1,
              price: 50000,
              barIndex: 100,
              timestamp: Date.now(),
              color: '#FF0000',
            },
          ],
        }),
      } as any;
      state.warmUpComplete = true;
      state.lastBarTimestamp = 0;

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

      // Drive the live path through the runtime's executeBar returning a short marker
      state.runtime = {
        // Live-wiring seam (strategy.equity): processCandle injects the real
        // USDC wallet balance via setEquitySource before each bar runs.
        setEquitySource: vi.fn(),
        executeBar: vi.fn().mockReturnValue({
          success: true,
          strategyMarkers: [
            {
              direction: 'short',
              action: 'sell',
              type: 'entry',
              name: 'Short',
              quantity: 0.1,
              price: 50000,
              barIndex: 100,
              timestamp: Date.now(),
              color: '#FF0000',
            },
          ],
        }),
      } as any;
      state.warmUpComplete = true;
      state.lastBarTimestamp = 0;

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

      // Drive the live path through the runtime's executeBar returning a short marker
      state.runtime = {
        // Live-wiring seam (strategy.equity): processCandle injects the real
        // USDC wallet balance via setEquitySource before each bar runs.
        setEquitySource: vi.fn(),
        executeBar: vi.fn().mockReturnValue({
          success: true,
          strategyMarkers: [
            {
              direction: 'short',
              action: 'sell',
              type: 'entry',
              name: 'Short',
              quantity: 0.1,
              price: 50000,
              barIndex: 100,
              timestamp: Date.now(),
              color: '#FF0000',
            },
          ],
        }),
      } as any;
      state.warmUpComplete = true;
      state.lastBarTimestamp = 0;

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

    describe('live wallet equity injection (F3 — fetch-before-bar money path)', () => {
      const candle = {
        symbol: 'BTCUSDT',
        timeframe: '60',
        timestamp: 1_700_000_000_000,
        open: 100,
        high: 110,
        low: 90,
        close: 105,
        volume: 1000,
      };

      /** Drive the live path with a recording runtime: replace state.runtime
       *  with a mock that CAPTURES the injected equity source (so the produced
       *  VALUE at the seam can be asserted) and records executeBar. */
      function recordingRuntime(exec: LiveStrategyExecutor): {
        injectedSource: (() => number) | null;
        setEquitySource: ReturnType<typeof vi.fn>;
        executeBar: ReturnType<typeof vi.fn>;
      } {
        const state = (exec as any).strategyStates.get('BTCUSDT:60');
        const rec = {
          injectedSource: null as (() => number) | null,
          setEquitySource: vi.fn(),
          executeBar: vi.fn().mockReturnValue({ success: true, strategyMarkers: [] }),
        };
        rec.setEquitySource.mockImplementation((source: () => number) => {
          rec.injectedSource = source;
        });
        state.runtime = { setEquitySource: rec.setEquitySource, executeBar: rec.executeBar } as any;
        state.warmUpComplete = true;
        state.lastBarTimestamp = 0;
        return rec;
      }

      it('fetches the wallet balance and injects the equity source BEFORE executeBar runs', async () => {
        const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
        await executor.initializeStrategy(pair);
        const { setEquitySource, executeBar } = recordingRuntime(executor);

        // Real fetch path (walletManager + dex are mocked in config): the spy
        // records the call while the original implementation still runs.
        const fetchSpy = vi.spyOn(
          executor as unknown as { fetchUsdcBalance: () => Promise<bigint> },
          'fetchUsdcBalance',
        );

        await executor.processCandle(candle);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(setEquitySource).toHaveBeenCalledTimes(1);
        expect(executeBar).toHaveBeenCalledTimes(1);
        // Strict ordering: fetch → inject → bar. The bar must never run on a
        // balance that hasn't been injected first.
        expect(fetchSpy.mock.invocationCallOrder[0]).toBeLessThan(
          setEquitySource.mock.invocationCallOrder[0],
        );
        expect(setEquitySource.mock.invocationCallOrder[0]).toBeLessThan(
          executeBar.mock.invocationCallOrder[0],
        );
      });

      it('injects Number(microUsdc) / 1e6 — exactly 42.5 for 42500000 micro, never blended with the engine default', async () => {
        const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
        await executor.initializeStrategy(pair);
        // Keep the recording object (not a destructured copy) — the injected
        // source is written onto `rec.injectedSource` while processCandle runs.
        const rec = recordingRuntime(executor);

        vi.spyOn(
          executor as unknown as { fetchUsdcBalance: () => Promise<bigint> },
          'fetchUsdcBalance',
        ).mockResolvedValue(42500000n); // 42.5 USDC in micro units

        await executor.processCandle(candle);

        expect(rec.setEquitySource).toHaveBeenCalledWith(expect.any(Function));
        expect(rec.injectedSource).not.toBeNull();
        // OR semantics (engine contract): the injected source is the ONLY value
        // strategy.equity reads — not 42500000 (raw micro), not the engine
        // default (10,000 USDC decimal basis), not a blend. Exactly 42.5.
        expect(rec.injectedSource!()).toBe(42.5);
      });

      it('skips equity injection entirely when no wallet manager is configured — bar still runs, never throws', async () => {
        const exec = new LiveStrategyExecutor({
          ...mockConfig,
          walletManager: undefined,
        } as LiveStrategyConfig);
        const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
        await exec.initializeStrategy(pair);
        const { setEquitySource, executeBar } = recordingRuntime(exec);

        const signals = await exec.processCandle(candle);

        expect(setEquitySource).not.toHaveBeenCalled();
        expect(executeBar).toHaveBeenCalledTimes(1);
        // Engine default equity applies; evaluation completes normally.
        expect(signals).toEqual([]);
      });

      it('propagates the RPC failure from fetchUsdcBalance — the bar never runs, never caught-and-zeroed', async () => {
        const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
        await executor.initializeStrategy(pair);
        const { executeBar } = recordingRuntime(executor);

        const rpcError = new Error('RPC down: getBalance failed');
        vi.spyOn(
          executor as unknown as { fetchUsdcBalance: () => Promise<bigint> },
          'fetchUsdcBalance',
        ).mockRejectedValue(rpcError);

        // Identity assertion: the SAME error instance surfaces — a fake zero
        // here would mis-size live orders, so catch-and-zero would be a bug.
        await expect(executor.processCandle(candle)).rejects.toBe(rpcError);
        expect(executeBar).not.toHaveBeenCalled();
      });
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
      } as any;

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
      const mockGenerator = {
        generate: vi.fn().mockImplementation((equity: number) => {
          return {
            action: 'long',
            sizeFraction: 0.1,
            equity,
            timestamp: Date.now(),
          };
        }),
        getSignalCount: vi.fn().mockReturnValue(1),
      } as any;

      const chaosConfig = {
        ...mockConfig,
        chaosGenerator: mockGenerator,
        initialCapital: BigInt(10_000_000),
      };
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
      } as any;

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

  describe('risk manager integration', () => {
    function createRiskManagerMock() {
      return {
        recordTrade: vi.fn().mockReturnValue(false),
        recordBalance: vi.fn().mockReturnValue(false),
        onEvent: vi.fn(),
        isWalletBalanceEnabled: true,
      } as any;
    }

    async function seedLongPosition(exec: LiveStrategyExecutor): Promise<void> {
      const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
      await exec.initializeStrategy(pair);
      const state = (exec as any).strategyStates.get('BTCUSDT:60');
      state.position = {
        symbol: 'BTCUSDT',
        direction: 'long',
        quantity: 0.1,
        entryPrice: 50000,
        entryTime: Date.now() - 60000,
      };
    }

    function sellSignal(price: number): TradeSignal {
      return {
        action: 'sell',
        symbol: 'BTCUSDT',
        quantity: 0.1,
        expectedPrice: price,
        timestamp: Date.now(),
        timeframe: '60',
      };
    }

    it('should feed realized PnL to recordTrade after a completed sell', async () => {
      const riskManager = createRiskManagerMock();
      const exec = new LiveStrategyExecutor({ ...mockConfig, riskManager });
      await seedLongPosition(exec);

      const result = await exec.executeSignal(sellSignal(51000));

      expect(result.success).toBe(true);
      // realized PnL = (51000 − 50000) × 0.1 = 100
      expect(riskManager.recordTrade).toHaveBeenCalledTimes(1);
      expect(riskManager.recordTrade).toHaveBeenCalledWith(100);
    });

    it('should record realized PnL through the full processCandle -> executeSignal path (B1 regression)', async () => {
      const riskManager = createRiskManagerMock();
      const exec = new LiveStrategyExecutor({ ...mockConfig, riskManager });
      const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
      await exec.initializeStrategy(pair);

      // Seed a long position and drive the runtime to emit a close marker on
      // the next candle — the production entry path (not executeSignal with
      // pre-seeded state, which never reproduces the flattening bug).
      const state = (exec as any).strategyStates.get('BTCUSDT:60');
      state.position = {
        symbol: 'BTCUSDT',
        direction: 'long',
        quantity: 0.1,
        entryPrice: 50000,
        entryTime: Date.now() - 60000,
      };
      state.runtime = {
        // Live-wiring seam (strategy.equity): processCandle injects the real
        // USDC wallet balance via setEquitySource before each bar runs.
        setEquitySource: vi.fn(),
        executeBar: vi.fn().mockReturnValue({
          success: true,
          strategyMarkers: [
            {
              type: 'close',
              direction: 'long',
              action: 'sell',
              name: 'Exit',
              quantity: 0.1,
              price: 51000,
              barIndex: 100,
              timestamp: Date.now(),
              color: '#FF0000',
            },
          ],
        }),
      } as any;
      state.warmUpComplete = true;
      state.lastBarTimestamp = 0;

      const candle = {
        symbol: 'BTCUSDT',
        timeframe: '60',
        timestamp: Date.now(),
        open: 50500,
        high: 51500,
        low: 49500,
        close: 51000,
        volume: 1000,
      };

      const signals = await exec.processCandle(candle);
      expect(signals).toHaveLength(1);
      expect(signals[0]!.action).toBe('sell');
      // reconcilePosition() flattens state.position right after signal
      // generation — the entry price MUST ride on the signal itself (B1) or
      // the realized PnL feed is skipped on every close in production.
      expect((signals[0] as any).positionEntryPrice).toBe(50000);

      const result = await exec.executeSignal(signals[0]!);
      expect(result.success).toBe(true);
      // realized PnL = (51000 − 50000) × 0.1 = 100
      expect(riskManager.recordTrade).toHaveBeenCalledTimes(1);
      expect(riskManager.recordTrade).toHaveBeenCalledWith(100);
    });

    it('should feed a balance snapshot to recordBalance after a completed trade', async () => {
      const riskManager = createRiskManagerMock();
      const exec = new LiveStrategyExecutor({ ...mockConfig, riskManager });
      await seedLongPosition(exec);

      const result = await exec.executeSignal(sellSignal(51000));

      expect(result.success).toBe(true);
      // dex.getBalance mock returns '10000000' micro-USDC (10 USDC)
      expect(riskManager.recordBalance).toHaveBeenCalledTimes(1);
      expect(riskManager.recordBalance).toHaveBeenCalledWith(10000000n);
    });

    it('should feed a balance snapshot once per candle via captureBalanceSnapshot', async () => {
      const riskManager = createRiskManagerMock();
      const exec = new LiveStrategyExecutor({ ...mockConfig, riskManager });

      await exec.captureBalanceSnapshot();

      expect(riskManager.recordBalance).toHaveBeenCalledTimes(1);
      expect(riskManager.recordBalance).toHaveBeenCalledWith(10000000n);
    });

    it('should skip the balance fetch entirely when the wallet guard is disabled (R4)', async () => {
      const riskManager = createRiskManagerMock();
      riskManager.isWalletBalanceEnabled = false;
      const exec = new LiveStrategyExecutor({ ...mockConfig, riskManager });

      const fetchSpy = vi.spyOn(
        exec as unknown as { fetchUsdcBalance: () => Promise<bigint> },
        'fetchUsdcBalance',
      );
      await exec.captureBalanceSnapshot();

      // No RPC fetch, no guard evaluation — a disabled guard must never incur
      // a per-candle fetch (jupiter-ultra zero-returning adapters warn on it).
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(riskManager.recordBalance).not.toHaveBeenCalled();
    });

    it('should never feed a zero/unusable balance to the guard', async () => {
      const riskManager = createRiskManagerMock();
      const exec = new LiveStrategyExecutor({ ...mockConfig, riskManager });
      (mockConfig.dex as any).getBalance.mockResolvedValue({
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: '0',
        decimals: 6,
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await exec.captureBalanceSnapshot();

      expect(riskManager.recordBalance).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Balance snapshot is zero/unusable'),
      );
      warnSpy.mockRestore();
    });

    it('should log and skip (not block) when the balance snapshot fetch fails', async () => {
      const riskManager = createRiskManagerMock();
      const exec = new LiveStrategyExecutor({ ...mockConfig, riskManager });
      await seedLongPosition(exec);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(
        exec as unknown as { fetchUsdcBalance: () => Promise<bigint> },
        'fetchUsdcBalance',
      ).mockRejectedValue(new Error('RPC down'));

      const result = await exec.executeSignal(sellSignal(51000));

      // The trade itself must still succeed and the PnL still be recorded
      expect(result.success).toBe(true);
      expect(riskManager.recordTrade).toHaveBeenCalledWith(100);
      expect(riskManager.recordBalance).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Balance snapshot fetch failed'),
        expect.anything(),
      );
      warnSpy.mockRestore();
    });

    it('should not demote trade success when the risk balance call throws', async () => {
      const riskManager = createRiskManagerMock();
      riskManager.recordBalance.mockImplementation(() => {
        throw new Error('guard exploded');
      });
      const exec = new LiveStrategyExecutor({ ...mockConfig, riskManager });
      await seedLongPosition(exec);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await exec.executeSignal(sellSignal(51000));

      expect(result.success).toBe(true);
      expect(riskManager.recordTrade).toHaveBeenCalledWith(100);
      expect(riskManager.recordBalance).toHaveBeenCalledWith(10000000n);
      warnSpy.mockRestore();
    });

    it('should be a no-op for balance snapshots when no risk manager is configured', async () => {
      const exec = new LiveStrategyExecutor(mockConfig);

      await expect(exec.captureBalanceSnapshot()).resolves.toBeUndefined();
    });
  });

  describe('getPositions() confirmed-fill truth (task 1.4)', () => {
    // The swap mock in beforeEach succeeds; failed-swap tests override it.
    function failNextSwap(error = 'dex down'): void {
      (mockConfig.dex as any).swap.mockResolvedValue({ success: false, error });
    }

    function buySignal(price = 50000): TradeSignal {
      return {
        action: 'buy',
        symbol: 'BTCUSDT',
        quantity: 0.1,
        expectedPrice: price,
        timestamp: Date.now(),
        timeframe: '60',
      };
    }

    function sellSignal(price = 51000): TradeSignal {
      return {
        action: 'sell',
        symbol: 'BTCUSDT',
        quantity: 0.1,
        expectedPrice: price,
        timestamp: Date.now(),
        timeframe: '60',
      };
    }

    it('omits a staged buy whose swap FAILED — no phantom position', async () => {
      const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
      await executor.initializeStrategy(pair);

      // Optimistically the state holds the staged long (set by the engine
      // before the DEX call); the swap fails — the position MUST NOT survive.
      const state = (executor as any).strategyStates.get('BTCUSDT:60');
      state.position = {
        symbol: 'BTCUSDT',
        direction: 'long',
        quantity: 0.1,
        entryPrice: 50000,
        entryTime: Date.now(),
      };
      failNextSwap();

      const result = await executor.executeSignal(buySignal());

      expect(result.success).toBe(false);
      // No phantom: the failed order is invisible to the dashboard.
      expect(executor.getPositions()).toEqual([]);
      // The optimistic stage is reverted to flat, not left as a false long.
      expect(executor.getPosition(pair)?.direction).toBe('flat');
    });

    it('reports a long position after a CONFIRMED buy fill', async () => {
      const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
      await executor.initializeStrategy(pair);

      const result = await executor.executeSignal(buySignal(50000));

      expect(result.success).toBe(true);
      const positions = executor.getPositions();
      expect(positions).toHaveLength(1);
      expect(positions[0]).toMatchObject({
        symbol: 'BTCUSDT',
        timeframe: '60',
        direction: 'long',
        quantity: 0.1,
        entryPrice: 50000,
      });
    });

    it('reports flat (omitted) after a CONFIRMED sell/close', async () => {
      await executor.initializeStrategy({ symbol: 'BTCUSDT', timeframe: '60' });

      // Open first — confirmed fill.
      await executor.executeSignal(buySignal(50000));
      expect(executor.getPositions()).toHaveLength(1);

      // Close — confirmed fill → the DEX is flat → position disappears.
      const result = await executor.executeSignal(sellSignal(51000));
      expect(result.success).toBe(true);
      expect(executor.getPositions()).toEqual([]);
    });

    it('reverts to the last confirmed fill when a close FAILS — no false flat', async () => {
      await executor.initializeStrategy({ symbol: 'BTCUSDT', timeframe: '60' });

      // Open first — confirmed fill.
      await executor.executeSignal(buySignal(50000));
      expect(executor.getPositions()).toHaveLength(1);

      // Close fails: the DEX still holds the position, so the panel must keep
      // showing the confirmed long instead of a false flat.
      failNextSwap();
      const result = await executor.executeSignal(sellSignal(51000));

      expect(result.success).toBe(false);
      const positions = executor.getPositions();
      expect(positions).toHaveLength(1);
      expect(positions[0]).toMatchObject({
        symbol: 'BTCUSDT',
        timeframe: '60',
        direction: 'long',
        quantity: 0.1,
        entryPrice: 50000,
      });
    });

    it('does NOT revert a prior confirmation when a swap THROWS (unknown outcome — no reconcile)', async () => {
      await executor.initializeStrategy({ symbol: 'BTCUSDT', timeframe: '60' });

      // Open first — confirmed fill.
      await executor.executeSignal(buySignal(50000));
      expect(executor.getPositions()).toHaveLength(1);

      // A throwing swap means the on-chain outcome is UNKNOWN (the tx may have
      // broadcast). Unlike a known failure (swapResult.success === false), the
      // exception path must NOT reconcile: no flat revert, no lost confirmation.
      (mockConfig.dex as any).swap.mockRejectedValue(new Error('jupiter rpc timeout'));

      const result = await executor.executeSignal(sellSignal(51000));

      // Reported as a failure with the error surfaced — but position state is
      // left untouched for external reconciliation.
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/jupiter rpc timeout/);

      // The prior confirmed long is still visible — no false flat, no deletion.
      const positions = executor.getPositions();
      expect(positions).toHaveLength(1);
      expect(positions[0]).toMatchObject({
        symbol: 'BTCUSDT',
        timeframe: '60',
        direction: 'long',
        quantity: 0.1,
        entryPrice: 50000,
      });

      // The staged position is also untouched (still long), not reverted to flat.
      const state = (executor as any).strategyStates.get('BTCUSDT:60');
      expect(state.position.direction).toBe('long');
    });
  });

  describe('timeframe-gate regression (incident 2026-08-06 chaos money bug)', () => {
    // Existing test helpers everywhere hardcode timeframe:'60', which is exactly
    // why the incident passed CI: the `!signal.timeframe` bail was never hit.
    // These tests drive the missing-timeframe shape the bug actually delivered.

    it('tracks a CONFIRMED buy whose signal lacks `timeframe` via the symbol fallback (never silently dropped)', async () => {
      const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
      await executor.initializeStrategy(pair);

      // Chaos drive stages the long optimistically; the signal arrives without
      // timeframe; the swap confirms. getStateKeyForSignal must resolve via the
      // non-flat symbol fallback and record the confirmed fill.
      const state = (executor as any).strategyStates.get('BTCUSDT:60');
      state.position = {
        symbol: 'BTCUSDT',
        direction: 'long',
        quantity: 0.1,
        entryPrice: 50000,
        entryTime: Date.now(),
      };

      const noTimeframeBuy: TradeSignal = {
        action: 'buy',
        symbol: 'BTCUSDT',
        quantity: 0.1,
        expectedPrice: 50000,
        timestamp: Date.now(),
        // `timeframe` deliberately ABSENT — the incident delivery shape.
      };

      const result = await executor.executeSignal(noTimeframeBuy);
      expect(result.success).toBe(true);

      // Pre-fix this was the failing assertion: `expected [] to have a length
      // of 1` — the confirmed chaos fill vanished from getPositions().
      const positions = executor.getPositions();
      expect(positions).toHaveLength(1);
      expect(positions[0]).toMatchObject({
        symbol: 'BTCUSDT',
        timeframe: '60',
        direction: 'long',
      });
    });

    it('emits a LOUD failure (never a silent drop) when a confirmed buy matches no strategy state', async () => {
      // No initializeStrategy → no state can resolve this confirmed fill.
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const result = await executor.executeSignal({
          action: 'buy',
          symbol: 'ALGORAND',
          quantity: 0.1,
          expectedPrice: 50000,
          timestamp: Date.now(),
        });
        expect(result.success).toBe(true);

        // The old code silently `return`ed here — the loud path is the guard.
        expect(errorSpy).toHaveBeenCalled();
        const loud = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
        expect(loud).toContain('Cannot track confirmed fill');
        expect(loud).toContain('ALGORAND');
        expect(loud).toContain('no strategy state');
        expect(executor.getPositions()).toEqual([]);
      } finally {
        errorSpy.mockRestore();
      }
    });
  });
});
