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
      : vi.fn().mockResolvedValue({
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          amount: balance.amount,
          decimals: 6,
        });
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

// ============================================================================
// CORRECTED equity formula in chaos mode (Director-mandated):
//   Strategy Equity = Initial Capital + Closed Net Profit + Open Position Profit
// The chaos path reads `engine.getEquity() / 1e6` (processCandleChaos) — the
// SAME call the backtest path uses. Open chaos positions must contribute their
// floating PnL at the current candle close; realized PnL folds in on close and
// floating vanishes. RED until the backend folds position.unrealizedPnl into
// getEquity(). The engine is seeded with the real wallet balance in lamports
// (1 USDC = 1e6 lamports).
// ============================================================================

/** Candle with an explicit open ≠ close, so an entry fill and a moved price are hand-computable. */
function makeCandleMove(timestamp: number, open: number, close: number): ClosedCandle {
  return {
    symbol: 'BTCUSDT',
    timeframe: '60',
    timestamp,
    open,
    high: Math.max(open, close) * 1.01,
    low: Math.min(open, close) * 0.99,
    close,
    volume: 100,
  };
}

describe('Chaos equity formula — seed + closed + floating (corrected)', () => {
  let heartbeats: ChaosHeartbeat[];

  beforeEach(() => {
    heartbeats = [];
  });

  it('open chaos position at a moved price reads seed + floating PnL (42.5 → 43.35)', async () => {
    // 42,500,000 lamports = 42.5 USDC → seeds the engine with 42_500_000.
    const { gen, calls } = makeGenerator(['long', 'long']);
    const executor = makeExecutor(makeDex({ amount: '42500000' }), gen, heartbeats);

    await executor.initializeStrategy(PAIR);

    // Candle 1: close 50 → no position → equity read = seed 42.5 → 'long'
    // entry pending, qty = 0.1 × 42.5 / 50 = 0.085 tokens.
    await executor.processCandle(makeCandleMove(1_000_000, 50, 50));

    // Candle 2: open 50 (fills the entry at 50 → avgPrice 50, qty 0.085),
    // close 60 (currentPrice). CORRECTED: equity = seed + closed (0) +
    // floating = 42.5 + (60 − 50) × 0.085 = 42.5 + 0.85 = 43.35.
    // RED today: the engine returns realized-only 42.5 (floating missing).
    await executor.processCandle(makeCandleMove(2_000_000, 50, 60));

    expect(calls[0]!.equity).toBeCloseTo(42.5, 6); // seed read
    expect(calls[1]!.equity).toBeCloseTo(43.35, 6); // seed + floating
    // The OLD realized-only seed must NOT be returned once the price moved —
    // proves the floating component is present.
    expect(calls[1]!.equity).not.toBeCloseTo(42.5, 6);
  });

  it('after a chaos close, floating vanishes and realized PnL folds into equity', async () => {
    const { gen, calls } = makeGenerator(['long', 'exit', 'exit']);
    const executor = makeExecutor(makeDex({ amount: '42500000' }), gen, heartbeats);

    await executor.initializeStrategy(PAIR);

    // Candle 1: close 50 → entry pending qty 0.085.
    await executor.processCandle(makeCandleMove(1_000_000, 50, 50));

    // Candle 2: open 50 fills entry, close 60 → read 43.35 (with fix) →
    // 'exit' submits a market close.
    await executor.processCandle(makeCandleMove(2_000_000, 50, 60));

    // Candle 3: open 60 fills the close → realized (60 − 50) × 0.085 = 0.85
    // folds into equity; position flat → floating 0. CORRECTED final:
    // 42.5 + 0.85 + 0 = 43.35 (stays GREEN — realized PnL already folds in).
    await executor.processCandle(makeCandleMove(3_000_000, 60, 55));

    expect(calls[2]!.equity).toBeCloseTo(43.35, 6);
  });
});
