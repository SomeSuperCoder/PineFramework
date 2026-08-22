/**
 * Multi-world executor integration tests (OpenSpec change:
 * multi-world-portfolio-trading, task B4 / V1 test-engineer deliverable).
 *
 * Runner: vitest (`pnpm test`). This suite LOCKS the behaviors flagged in
 * backend-engineer B4 handoff `next_owner`:
 *   1. independent StrategyState maps keyed by 3-part world key
 *      `${symbol}:${timeframe}:${strategyId}`
 *   2. getWorldKeys() / getRunningPairs() / getPositions() enumerate every world
 *   3. per-world order mutex: different world keys run executeSignal concurrently
 *      while the SAME world key serializes
 *   4. worldFromKey parses both 3-part (v2) and 2-part (legacy) keys
 *   5. CapitalAllocator SEAM (B5 call site): when injected, allocated capital is
 *      consulted; when absent/throws, it falls back to wallet balance.
 *
 * IMPORTANT: B5's CapitalAllocator is a typed SEAM only here. This test does NOT
 * implement allocation logic — it asserts the executor's seam wiring + fallback.
 * NOTE: the executor consumes its OWN local `CapitalAllocator` interface
 * (`allocateForWorld(input): bigint`), which DIFFERS from the `allocate(total,
 * worlds)` interface shipped in src/trading/capital-allocator.ts (see V1 handoff
 * BUG report for the seam mismatch).
 *
 * No production code is modified by this file — tests only.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

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
    const markers: any[] = [];
    let pos: { direction: string; quantity: number } = { direction: 'flat', quantity: 0 };
    return {
      updateBar: vi.fn(),
      setWarningSink: vi.fn(),
      getEquity: vi.fn().mockReturnValue(10_000),
      getPosition: vi.fn().mockImplementation(() => pos),
      entry: vi.fn().mockImplementation((_name: string, direction: string, quantity: number) => {
        pos = { direction, quantity };
        markers.push({ type: 'entry', direction, quantity });
        return undefined;
      }),
      close: vi.fn().mockImplementation(() => {
        pos = { direction: 'flat', quantity: 0 };
        markers.push({ type: 'close' });
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
import { WorldConfig, LEGACY_STRATEGY_ID } from '../../../src/trading/index.js';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Three distinct worlds across symbols / timeframes / strategies.
const WORLDS: WorldConfig[] = [
  { symbol: 'BTCUSDT', timeframe: '60', strategy: 'alpha' },
  { symbol: 'ETHUSDT', timeframe: '60', strategy: 'beta' },
  { symbol: 'SOLUSDT', timeframe: '15', strategy: 'gamma' },
];

const worldKey = (w: WorldConfig) => `${w.symbol}:${w.timeframe}:${w.strategy}`;

function buildDexMock(swapImpl?: (q: any, k: any) => any) {
  return {
    name: 'mock-dex',
    commissionModel: { name: 'mock', feeBps: 0, variable: false, description: 'Mock DEX' },
    slippageConfig: { bps: 50, configurable: true },
    quote: vi.fn().mockResolvedValue({
      inputMint: USDC_MINT,
      outputMint: 'So11111111111111111111111111111111111111112',
      inAmount: '1000000',
      outAmount: '5000000',
      priceImpactPct: 0.1,
      route: 'mock-route',
      slippageBps: 50,
      feeBps: 0,
    }),
    swap: swapImpl ?? vi.fn().mockResolvedValue({
      success: true,
      signature: 'mock-signature',
      inputAmount: '1000000',
      outputAmount: '5000000',
      fee: '0',
    }),
    getBalance: vi.fn().mockResolvedValue({
      mint: USDC_MINT,
      amount: '10000000', // 10 USDC
      decimals: 6,
    }),
    getTransactionStatus: vi.fn().mockResolvedValue('confirmed'),
  } as any;
}

function buildConfig(overrides: Partial<LiveStrategyConfig> = {}): LiveStrategyConfig {
  return {
    strategySource: '//@version=5\nstrategy("Test")',
    dex: buildDexMock(),
    walletManager: {
      importWallet: vi.fn(),
      getKeypair: vi.fn().mockResolvedValue({
        value: { publicKey: 'mock-public-key', privateKey: new Uint8Array(64) },
        dispose: vi.fn(),
      }),
      hasWallet: vi.fn().mockResolvedValue(true),
    } as any,
    pairs: WORLDS.map((w) => ({ symbol: w.symbol, timeframe: w.timeframe })),
    initialCapital: BigInt(1000000000), // 1000 USDC
    positionSizePercent: 10,
    maxDailyLoss: 100,
    worlds: WORLDS,
    ...overrides,
  };
}

const buySignal = (w: WorldConfig, qty = 0.1, price = 50000): TradeSignal => ({
  action: 'buy',
  symbol: w.symbol,
  quantity: qty,
  expectedPrice: price,
  timestamp: Date.now(),
  timeframe: w.timeframe,
});

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('multi-world LiveStrategyExecutor — independent state maps', () => {
  let executor: LiveStrategyExecutor;

  beforeEach(async () => {
    vi.clearAllMocks();
    executor = new LiveStrategyExecutor(buildConfig());
    for (const w of WORLDS) await executor.initializeWorld(w);
  });

  it('keys each world by its 3-part world key (independent StrategyState maps)', () => {
    const keys = executor.getWorldKeys().sort();
    expect(keys).toEqual(WORLDS.map(worldKey).sort());
    for (const k of keys) expect(k.split(':')).toHaveLength(3);
  });

  it('getRunningPairs() enumerates every world (symbol + timeframe)', () => {
    const pairs = executor.getRunningPairs();
    expect(pairs).toHaveLength(3);
    expect(pairs).toEqual(
      expect.arrayContaining([
        { symbol: 'BTCUSDT', timeframe: '60' },
        { symbol: 'ETHUSDT', timeframe: '60' },
        { symbol: 'SOLUSDT', timeframe: '15' },
      ]),
    );
  });

  it('getPositions() enumerates every world once positions are confirmed', () => {
    for (const w of WORLDS) {
      const key = worldKey(w);
      (executor as any).strategyStates.get(key).position = {
        symbol: w.symbol,
        direction: 'long',
        quantity: 0.1,
        entryPrice: 50000,
        entryTime: Date.now(),
      };
      (executor as any).confirmedPositions.set(key, {} as any);
    }
    const positions = executor.getPositions();
    expect(positions).toHaveLength(3);
    expect(positions.map((p) => p.symbol).sort()).toEqual(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
    const sol = positions.find((p) => p.symbol === 'SOLUSDT')!;
    expect(sol.timeframe).toBe('15');
  });

  it('worldFromKey parses a 3-part v2 world key', () => {
    const parsed = (executor as any).worldFromKey('BTCUSDT:60:alpha');
    expect(parsed).toEqual({ symbol: 'BTCUSDT', timeframe: '60', strategy: 'alpha' });
    // A 2-part key is parsed via the legacy fallback (worlds lookup misses,
    // then the 2-part split still yields a usable world identity).
    expect((executor as any).worldFromKey('BTCUSDT:60')).toEqual({
      symbol: 'BTCUSDT',
      timeframe: '60',
      strategy: LEGACY_STRATEGY_ID,
    });
  });

  describe('per-world order mutex isolation', () => {
    it('serializes executeSignal for the SAME world key (no overlap)', async () => {
      let inFlight = 0;
      let peak = 0;
      (executor as any).config.dex.swap = vi.fn().mockImplementation(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await delay(25);
        inFlight--;
        return { success: true, signature: 's', inputAmount: '1', outputAmount: '5', fee: '0' };
      });

      const w = WORLDS[0];
      await Promise.all([executor.executeSignal(buySignal(w)), executor.executeSignal(buySignal(w))]);

      // Same-world mutex must serialize: at most one swap in flight at a time.
      expect(peak).toBe(1);
    });

    it('allows DIFFERENT world keys to run executeSignal concurrently', async () => {
      let inFlight = 0;
      let peak = 0;
      (executor as any).config.dex.swap = vi.fn().mockImplementation(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await delay(25);
        inFlight--;
        return { success: true, signature: 's', inputAmount: '1', outputAmount: '5', fee: '0' };
      });

      await Promise.all([
        executor.executeSignal(buySignal(WORLDS[0])),
        executor.executeSignal(buySignal(WORLDS[1])),
      ]);

      // Different worlds have independent mutexes -> concurrent execution.
      expect(peak).toBe(2);
    });
  });

  describe('worldFromKey — legacy (2-part) keys', () => {
    it('parses a 2-part legacy key to a LEGACY_STRATEGY_ID world', () => {
      const legacyExec = new LiveStrategyExecutor(buildConfig({ worlds: undefined }));
      const parsed = (legacyExec as any).worldFromKey('BTCUSDT:60');
      expect(parsed).toEqual({ symbol: 'BTCUSDT', timeframe: '60', strategy: LEGACY_STRATEGY_ID });
    });
  });

  describe('CapitalAllocator SEAM (B5 call site + fallback)', () => {
    it('returns the injected allocated capital (USDC) when an allocator is wired', async () => {
      const allocator = {
        allocateForWorld: vi.fn().mockResolvedValue(BigInt(4_000_000)), // 4 USDC
      };
      const exec = new LiveStrategyExecutor(buildConfig({ capitalAllocator: allocator as any }));
      const result = await (exec as any).resolveWorldCapital('BTCUSDT:60:alpha', 'BTCUSDT', '60', 'alpha');
      expect(result).toBe(4); // 4_000_000 micro / 1e6
      expect(allocator.allocateForWorld).toHaveBeenCalledWith(
        expect.objectContaining({ worldKey: 'BTCUSDT:60:alpha', symbol: 'BTCUSDT', timeframe: '60', strategyId: 'alpha' }),
      );
    });

    it('falls back to null (wallet balance) when no allocator is injected', async () => {
      const exec = new LiveStrategyExecutor(buildConfig());
      const result = await (exec as any).resolveWorldCapital('BTCUSDT:60:alpha', 'BTCUSDT', '60', 'alpha');
      expect(result).toBeNull();
    });

    it('gracefully falls back to null when the allocator throws', async () => {
      const allocator = {
        allocateForWorld: vi.fn().mockRejectedValue(new Error('allocator boom')),
      };
      const exec = new LiveStrategyExecutor(buildConfig({ capitalAllocator: allocator as any }));
      const result = await (exec as any).resolveWorldCapital('BTCUSDT:60:alpha', 'BTCUSDT', '60', 'alpha');
      expect(result).toBeNull();
    });

    it('end-to-end: injected allocation narrows the spendable basis vs wallet fallback', async () => {
      // positionSizePercent = 100 so the whole basis is spent, isolating the
      // capital-allocator effect on the swap input amount.
      const baseExec = new LiveStrategyExecutor(buildConfig({ positionSizePercent: 100 }));
      const quoteSpyFallback = (baseExec as any).config.dex.quote;
      await baseExec.executeSignal(buySignal(WORLDS[0]));
      const fallbackAmount = quoteSpyFallback.mock.calls[0][2]; // 3rd arg = amount (micro-USDC)
      expect(fallbackAmount).toBe(BigInt(10_000_000)); // 10 USDC wallet balance

      const allocator = {
        allocateForWorld: vi.fn().mockResolvedValue(BigInt(4_000_000)), // 4 USDC
      };
      const allocExec = new LiveStrategyExecutor(
        buildConfig({ positionSizePercent: 100, capitalAllocator: allocator as any }),
      );
      const quoteSpyAlloc = (allocExec as any).config.dex.quote;
      await allocExec.executeSignal(buySignal(WORLDS[0]));
      const allocAmount = quoteSpyAlloc.mock.calls[0][2];
      expect(allocAmount).toBe(BigInt(4_000_000)); // min(wallet 10, allocated 4) = 4 USDC
    });
  });
});
