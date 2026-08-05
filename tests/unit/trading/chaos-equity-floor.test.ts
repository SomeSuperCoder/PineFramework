/**
 * Tests for the chaos-mode equity floor + execution-mode honesty
 * (OpenSpec change: fix-chaos-mode-silent-vanish, task 5.1).
 *
 * Contract under test:
 * - A verified empty wallet (getBalance returns a genuine 0) seeds the chaos
 *   engine with CHAOS_FALLBACK_EQUITY (10,000 USDC) and reports
 *   execution mode `simulated` with reason `wallet-empty`.
 * - A transport/RPC failure (getBalance throws) reports `rpc-unreachable` and
 *   STILL falls back to the simulated floor — the strategy machinery keeps
 *   producing markers (never a silent zero-qty entry).
 * - A real balance > 0 reports execution mode `live` and seeds the engine with
 *   the real funds.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before importing (same set as chaos-realistic-engine.test.ts)
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

import { LiveStrategyExecutor } from '../../../src/trading/live-strategy-executor.js';
import type { ClosedCandle } from '../../../src/trading/scheduler.js';
import type {
  ChaosSignalGenerator,
  ChaosAction,
} from '../../../src/trading/chaos-signal-generator.js';
import type { ChaosHeartbeat } from '../../../src/trading/types.js';

/** The documented simulated equity floor: 10,000 USDC in lamports. */
const FLOOR_EQUITY_USDC = 10_000;

// Deterministic chaos generator stub — returns a fixed action sequence.
function makeGenerator(actions: ChaosAction[]) {
  const calls: Array<{ equity: number; timestamp: number }> = [];
  let i = 0;
  const gen = {
    generate: vi.fn((equity: number, timestamp: number) => {
      calls.push({ equity, timestamp });
      const action = actions[i % actions.length];
      i++;
      return { action, sizeFraction: 0.1, equity, timestamp };
    }),
    getSignalCount: vi.fn(() => i),
  };
  return { gen: gen as unknown as ChaosSignalGenerator, calls };
}

/** DEX stub whose getBalance resolves to a fixed amount or rejects. */
function makeDex(balance: { amount: string } | Error) {
  const getBalance =
    balance instanceof Error
      ? vi.fn().mockRejectedValue(balance)
      : vi.fn().mockResolvedValue({ mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', amount: balance.amount, decimals: 6 });
  return {
    name: 'mock',
    commissionModel: { name: 'mock', feeBps: 0, variable: false, description: 'Mock' },
    slippageConfig: { bps: 50, configurable: true },
    quote: vi.fn(),
    swap: vi.fn(),
    getBalance,
    getTransactionStatus: vi.fn(),
  } as any;
}

function makeExecutor(
  dex: ReturnType<typeof makeDex>,
  generator: ChaosSignalGenerator,
  heartbeats: ChaosHeartbeat[],
): LiveStrategyExecutor {
  return new LiveStrategyExecutor({
    strategySource: '',
    dex,
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
    chaosHeartbeat: (hb) => heartbeats.push(hb),
  });
}

function makeCandle(timestamp: number, close = 50000): ClosedCandle {
  return {
    symbol: 'BTCUSDT',
    timeframe: '60',
    timestamp,
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume: 100,
  };
}

const PAIR = { symbol: 'BTCUSDT', timeframe: '60' };

describe('Chaos equity floor + execution mode (task 5.1)', () => {
  let heartbeats: ChaosHeartbeat[];

  beforeEach(() => {
    heartbeats = [];
  });

  it('verified zero balance → simulated floor, wallet-empty, and markers still flow', async () => {
    const { gen, calls } = makeGenerator(['long']);
    const executor = makeExecutor(makeDex({ amount: '0' }), gen, heartbeats);

    await executor.initializeStrategy(PAIR);

    // Execution mode must report the simulated floor with the empty-wallet reason.
    expect(executor.getChaosExecutionMode()).toEqual({
      mode: 'simulated',
      reason: 'wallet-empty',
    });

    // The engine is seeded with the documented floor — 10,000 USDC.
    const signals = await executor.processCandle(makeCandle(1_000_000));

    expect(calls[0]!.equity).toBe(FLOOR_EQUITY_USDC);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.action).toBe('buy');
    expect(signals[0]!.marker).toMatchObject({
      type: 'entry',
      name: 'Long',
      direction: 'long',
      color: '#00FF00',
    });
    // 10,000 USDC × 10% / $50,000 = 0.02 tokens — the floor, not zero.
    expect(signals[0]!.quantity).toBeCloseTo(0.02, 5);

    // The floor must not break the per-candle chaos heartbeat (D3).
    expect(heartbeats).toHaveLength(1);
    expect(heartbeats[0]).toMatchObject({
      pair: 'BTCUSDT:60',
      timeframe: '60',
      outcome: 'signal',
      action: 'long',
    });
  });

  it('transport error → rpc-unreachable, still simulated floor and markers flow', async () => {
    const { gen, calls } = makeGenerator(['long']);
    const executor = makeExecutor(makeDex(new Error('RPC down')), gen, heartbeats);

    await executor.initializeStrategy(PAIR);

    // A transport failure must be distinguishable from an empty wallet.
    expect(executor.getChaosExecutionMode()).toEqual({
      mode: 'simulated',
      reason: 'rpc-unreachable',
    });

    // The strategy machinery keeps running on the floor (no silent zero-qty).
    const signals = await executor.processCandle(makeCandle(1_000_000));
    expect(calls[0]!.equity).toBe(FLOOR_EQUITY_USDC);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.action).toBe('buy');
    expect(signals[0]!.quantity).toBeCloseTo(0.02, 5);
  });

  it('real balance > 0 → live execution mode and engine seeded with real funds', async () => {
    const { gen, calls } = makeGenerator(['long']);
    // 25,000,000 lamports = 25 USDC.
    const executor = makeExecutor(makeDex({ amount: '25000000' }), gen, heartbeats);

    await executor.initializeStrategy(PAIR);

    expect(executor.getChaosExecutionMode()).toEqual({ mode: 'live' });

    const signals = await executor.processCandle(makeCandle(1_000_000));
    expect(calls[0]!.equity).toBe(25);
    expect(signals).toHaveLength(1);
    // 25 USDC × 10% / $50,000 = 0.00005 tokens.
    expect(signals[0]!.quantity).toBeCloseTo(0.00005, 6);
  });

  it('the floor is applied on the hot-swap enable path too (setChaosGenerator)', async () => {
    const { gen } = makeGenerator(['long']);
    const executor = makeExecutor(makeDex({ amount: '0' }), gen, heartbeats);

    // Pre-initialize a bare chaos state the way BotEngine.initialize() does at
    // start, then hot-swap the generator in while running — the
    // toggleChaosMode(true) path.
    await executor.initializeStrategy(PAIR);
    expect(executor.getChaosExecutionMode()).toEqual({
      mode: 'simulated',
      reason: 'wallet-empty',
    });

    await executor.setChaosGenerator(gen);

    expect(executor.getChaosExecutionMode()).toEqual({
      mode: 'simulated',
      reason: 'wallet-empty',
    });

    const signals = await executor.processCandle(makeCandle(1_000_000));
    expect(signals).toHaveLength(1);
    expect(signals[0]!.action).toBe('buy');
  });
});
