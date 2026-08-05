/**
 * Wiring-level regression: chaos-mode on-chain buys must spend 10% of equity
 * (the ChaosSignalGenerator sizeFraction = 0.1), NOT positionSizePercent.
 *
 * QA blocker: chaos buys spent ~100% of wallet USDC because executeSignal
 * sized buys from positionSizePercent — and bot-engine.ts defaults it to 100
 * when the config omits it (backend/data/bot-config.json has no
 * positionSizePercent, only chaosMode.enabled: true).
 *
 * Target behavior (QA spec):
 *  - Chaos buy  → 10% of equity → dex.quote input = 1_000_000_000 lamports
 *    for a 10_000 USDC wallet (NOT 10_000_000_000 lamports).
 *  - Non-chaos buy with positionSizePercent=25 → 25% of balance.
 *  - Chaos buy with positionSizePercent=25 → STILL 10%.
 *
 * Wiring driven (not unit-isolated):
 *   BotEngine.configure(bot-config.json-like) → start()
 *   (real initialize: mocked JupiterSwapAdapter, real ChaosSignalGenerator,
 *   real LiveStrategyExecutor, real LiveScheduler) → scheduler.liveTick(candle)
 *   → processCandleChaos → submitOrders → executeSignal → dex.quote/swap.
 * The only mocks are I/O boundaries: DEX, wallet keypair, Bybit bar feed, and
 * the StrategyEngine internals (deterministic in-memory engine).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Boundary mocks — shared instances so the test can assert on the exact
// on-chain amounts passed to dex.quote / dex.swap.
const { jupiterMock, bybitMock } = vi.hoisted(() => {
  const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const ETH = '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs'; // token-registry ETHUSDT
  return {
    jupiterMock: {
      name: 'mock-jupiter',
      commissionModel: { name: 'mock', feeBps: 0, variable: false, description: 'Mock DEX' },
      slippageConfig: { bps: 50, configurable: true },
      quote: vi.fn().mockResolvedValue({
        inputMint: USDC,
        outputMint: ETH,
        inAmount: '1000000000',
        outAmount: '10000000',
        priceImpactPct: 0.1,
        slippageBps: 50,
        feeBps: 0,
      }),
      swap: vi.fn().mockResolvedValue({ success: true, signature: 'mock-signature' }),
      getBalance: vi.fn().mockResolvedValue({
        mint: USDC,
        amount: '10000000000', // 10_000 USDC in lamports (10_000 * 1e6)
        decimals: 6,
      }),
      getTransactionStatus: vi.fn().mockResolvedValue('confirmed'),
    },
    bybitMock: {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      subscribe: vi.fn(),
      setCandleCallback: vi.fn(),
      setErrorCallback: vi.fn(),
      setConnectionCallback: vi.fn(),
      fetchHistoricalCandles: vi.fn().mockResolvedValue([]),
    },
  };
});

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
  BybitWebSocketService: vi.fn().mockImplementation(() => bybitMock),
}));

vi.mock('../../../src/trading/dex/jupiter-swap-adapter.js', () => ({
  JupiterSwapAdapter: vi.fn().mockImplementation(() => jupiterMock),
}));

// Faithful in-memory StrategyEngine for the chaos drive path
// (processCandleChaos). Equity in lamports: 10_000 USDC → 10_000_000_000,
// matching the mocked wallet balance so equity === balance.
vi.mock('../../../src/strategy/strategy-engine.js', () => ({
  StrategyEngine: vi.fn().mockImplementation(() => {
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
          timestamp: 1_000_000_000,
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
          timestamp: 1_000_000_000,
          color: '#FF0000',
        });
        pos = { direction: 'flat', quantity: 0 };
        return undefined;
      }),
      getNewMarkers: vi.fn().mockImplementation(() => markers.splice(0)),
    };
  }),
}));

import { BotEngine } from '../../../src/trading/bot-engine.js';
import { LiveStrategyExecutor } from '../../../src/trading/live-strategy-executor.js';
import type { BotConfig } from '../../../src/trading/types.js';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** Mirrors backend/data/bot-config.json: chaosMode.enabled, positionSizePercent UNSET. */
function prodLikeChaosConfig(overrides?: Partial<BotConfig>): BotConfig {
  return {
    strategySource: '',
    dex: 'jupiter-swap',
    pairs: [{ symbol: 'ETHUSDT', timeframe: '1' }],
    risk: { maxDailyLoss: 0.4525717 },
    chaosMode: { enabled: true },
    // positionSizePercent deliberately omitted — bot-config.json has none
    ...overrides,
  };
}

const walletManager = {
  getKeypair: vi.fn().mockResolvedValue({
    value: { publicKey: 'mock-public-key', privateKey: new Uint8Array(64) },
    dispose: vi.fn(),
  }),
} as any;

const candle = {
  symbol: 'ETHUSDT',
  timeframe: '1',
  timestamp: 1_000_000_000,
  open: 50000,
  high: 51000,
  low: 49000,
  close: 50000,
  volume: 100,
};

/** The input amount (3rd arg) of the most recent dex.quote call. */
function lastQuotedAmount(): bigint {
  const call = jupiterMock.quote.mock.calls.at(-1)!;
  return call[2] as bigint;
}

describe('Chaos buy sizing wiring (sizeFraction 0.1, QA regression)', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // clearAllMocks clears call history but KEEPS implementations (the module
    // mock factories and the hoisted dex/quote/swap mocks must survive).
    vi.clearAllMocks();
    // QA scenario: wallet holds 10_000 USDC = 10_000_000_000 lamports.
    jupiterMock.getBalance.mockResolvedValue({
      mint: USDC_MINT,
      amount: '10000000000',
      decimals: 6,
    });
    // Force the (real) ChaosSignalGenerator to always pick 'long' → buy.
    // NOTE: never restoreAllMocks() here — it resets the module mock factories
    // and hoisted implementations, breaking subsequent tests in this file.
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    randomSpy?.mockRestore();
  });

  it('chaos buy spends 10% of equity when positionSizePercent is UNSET (bot-config.json wiring)', async () => {
    const engine = new BotEngine({ walletManager });
    engine.configure(prodLikeChaosConfig()); // positionSizePercent unset
    await engine.start(); // real initialize → executor gets positionSizePercent ?? 100

    await (engine as any).scheduler.liveTick([candle]);

    expect(jupiterMock.quote).toHaveBeenCalledTimes(1);
    // 10% of 10_000 USDC = 1_000 USDC = 1_000_000_000 lamports
    expect(lastQuotedAmount()).toBe(1_000_000_000n);
    // Regression: must NOT spend the whole wallet (the QA blocker)
    expect(lastQuotedAmount()).not.toBe(10_000_000_000n);
    expect(jupiterMock.swap).toHaveBeenCalledTimes(1);
  });

  it('chaos buy still spends 10% when positionSizePercent IS set (25%)', async () => {
    const engine = new BotEngine({ walletManager });
    engine.configure(prodLikeChaosConfig({ positionSizePercent: 25 }));
    await engine.start();

    await (engine as any).scheduler.liveTick([candle]);

    expect(jupiterMock.quote).toHaveBeenCalledTimes(1);
    // Chaos sizing ignores positionSizePercent — always the signal's 10%
    expect(lastQuotedAmount()).toBe(1_000_000_000n);
    expect(lastQuotedAmount()).not.toBe(2_500_000_000n);
  });

  it('non-chaos strategy buy uses positionSizePercent (25%) when set', async () => {
    const executor = new LiveStrategyExecutor({
      strategySource: '//@version=5\nstrategy("test")',
      dex: jupiterMock as any,
      walletManager,
      pairs: [{ symbol: 'ETHUSDT', timeframe: '1' }],
      initialCapital: BigInt(10_000_000_000),
      positionSizePercent: 25,
      maxDailyLoss: 100,
    });

    const result = await executor.executeSignal({
      action: 'buy',
      symbol: 'ETHUSDT',
      quantity: 0.5,
      expectedPrice: 3000,
      timestamp: 1_000_000_000,
      timeframe: '1',
    });

    expect(result.success).toBe(true);
    expect(jupiterMock.quote).toHaveBeenCalledTimes(1);
    // 25% of 10_000 USDC = 2_500 USDC = 2_500_000_000 lamports
    expect(lastQuotedAmount()).toBe(2_500_000_000n);
  });
});
