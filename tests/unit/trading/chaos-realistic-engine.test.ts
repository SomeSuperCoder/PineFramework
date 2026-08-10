/**
 * Tests for chaos mode driving the real StrategyEngine and broadcasting
 * genuine markers (OpenSpec change: chaos-mode-realistic-simulation).
 *
 * 5.1 — chaos path drives the engine and produces genuine markers with labels
 *       `Long` / `Exit Short` / `Exit Exit` and the standard colors
 * 5.2 — no-op transitions (long while long, short/exit while flat) emit no marker
 * 5.3 — every chaos entry quantity equals 10% of equity at entry time
 * 5.4 — bot-engine emits `chaosSignal` records with success/failure and pushes
 *       to `chaosHistory`; recent history is exposed for snapshot replay
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
import { LiveStrategyExecutor } from '../../../src/trading/live-strategy-executor.js';
import type { ClosedCandle } from '../../../src/trading/scheduler.js';
import type { TradeSignal as SchedulerTradeSignal } from '../../../src/trading/scheduler.js';
import type {
  ChaosSignalGenerator,
  ChaosAction,
} from '../../../src/trading/chaos-signal-generator.js';

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

function makeExecutor(generator: ChaosSignalGenerator): LiveStrategyExecutor {
  return new LiveStrategyExecutor({
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
    initialCapital: BigInt(10_000_000),
    positionSizePercent: 100,
    maxDailyLoss: 0,
    chaosGenerator: generator,
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

describe('Chaos drives the real StrategyEngine (spec 5.1–5.3)', () => {
  it('produces a genuine "Long" entry marker with the standard color', async () => {
    const { gen } = makeGenerator(['long']);
    const executor = makeExecutor(gen);
    await executor.initializeStrategy({ symbol: 'BTCUSDT', timeframe: '60' });

    const signals = await executor.processCandle(makeCandle(1_000_000));

    expect(signals).toHaveLength(1);
    expect(signals[0]!.action).toBe('buy');
    expect(signals[0]!.marker).toMatchObject({
      type: 'entry',
      name: 'Long',
      direction: 'long',
      color: '#00FF00',
    });
  });

  it('produces an "Exit Short" close marker when a long is closed by "short"', async () => {
    const { gen } = makeGenerator(['long', 'short']);
    const executor = makeExecutor(gen);
    await executor.initializeStrategy({ symbol: 'BTCUSDT', timeframe: '60' });

    await executor.processCandle(makeCandle(1_000_000));
    const signals = await executor.processCandle(makeCandle(2_000_000));

    expect(signals).toHaveLength(1);
    expect(signals[0]!.action).toBe('sell');
    expect(signals[0]!.marker).toMatchObject({
      type: 'close',
      name: 'Exit Short',
      direction: 'long',
      color: '#FF0000',
    });
  });

  it('produces an "Exit Exit" close marker when a long is closed by "exit"', async () => {
    const { gen } = makeGenerator(['long', 'exit']);
    const executor = makeExecutor(gen);
    await executor.initializeStrategy({ symbol: 'BTCUSDT', timeframe: '60' });

    await executor.processCandle(makeCandle(1_000_000));
    const signals = await executor.processCandle(makeCandle(2_000_000));

    expect(signals).toHaveLength(1);
    expect(signals[0]!.marker?.name).toBe('Exit Exit');
    expect(signals[0]!.marker?.type).toBe('close');
  });

  it('emits no marker for no-op transitions (short/exit while flat)', async () => {
    const { gen } = makeGenerator(['exit']);
    const executor = makeExecutor(gen);
    await executor.initializeStrategy({ symbol: 'BTCUSDT', timeframe: '60' });

    const signals = await executor.processCandle(makeCandle(1_000_000));
    expect(signals).toHaveLength(0);
  });

  it('emits no marker for no-op transitions (long while already long)', async () => {
    const { gen } = makeGenerator(['long', 'long']);
    const executor = makeExecutor(gen);
    await executor.initializeStrategy({ symbol: 'BTCUSDT', timeframe: '60' });

    const entry = await executor.processCandle(makeCandle(1_000_000));
    expect(entry).toHaveLength(1);

    const noop = await executor.processCandle(makeCandle(2_000_000));
    expect(noop).toHaveLength(0);
  });

  it('sizes every chaos entry at exactly 10% of current equity', async () => {
    const { gen, calls } = makeGenerator(['long']);
    const executor = makeExecutor(gen);
    await executor.initializeStrategy({ symbol: 'BTCUSDT', timeframe: '60' });

    const price = 50000;
    const signals = await executor.processCandle(makeCandle(1_000_000, price));

    // The mock DEX reports a USDC balance of '10000000' lamports = 10 USDC
    // (1e6 lamports = 1 USDC). Equity is derived from that balance, not 10,000.
    const equityAtEntry = 10;
    const expectedQty = (equityAtEntry * 0.1) / price; // 1 / 50000 = 0.00002

    expect(calls[0]!.equity).toBe(equityAtEntry);
    expect(signals[0]!.quantity).toBeCloseTo(expectedQty, 5);
    expect(signals[0]!.marker?.quantity).toBeCloseTo(expectedQty, 5);
  });
});

describe('BotEngine chaosSignal emission and history (spec 5.4)', () => {
  let engine: BotEngine;

  beforeEach(() => {
    engine = new BotEngine();
  });

  const marker = {
    type: 'entry' as const,
    orderId: '',
    name: 'Long',
    direction: 'long' as const,
    action: 'buy' as const,
    quantity: 0.02,
    price: 50000,
    barIndex: 0,
    timestamp: 1_000_000,
    color: '#00FF00',
  };

  const signal: SchedulerTradeSignal = {
    pair: { symbol: 'BTCUSDT', timeframe: '60' },
    action: 'buy',
    quantity: 0.02,
    price: 50000,
    timestamp: 1_000_000,
    marker,
  };

  it('emits a chaosSignal record on success and appends to history', () => {
    const listener = vi.fn();
    engine.on('chaosSignal', listener);

    (engine as any).emitChaosSignal(signal, { success: true, txSignature: 'mock-sig' });

    expect(listener).toHaveBeenCalledTimes(1);
    const rec = listener.mock.calls[0]![0];
    expect(rec.marker.name).toBe('Long');
    expect(rec.success).toBe(true);
    expect(rec.txSignature).toBe('mock-sig');
    expect(rec.symbol).toBe('BTCUSDT');
    expect(rec.timeframe).toBe('60');
    expect(rec.timestamp).toBe(1_000_000);

    const history = engine.getChaosHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(rec);
  });

  it('emits a chaosSignal record on failure with the error message', () => {
    const listener = vi.fn();
    engine.on('chaosSignal', listener);

    (engine as any).emitChaosSignal(signal, { success: false, error: 'dex down' });

    const rec = listener.mock.calls[0]![0];
    expect(rec.success).toBe(false);
    expect(rec.error).toBe('dex down');
    expect(engine.getChaosHistory()).toHaveLength(1);
  });

  it('ignores signals without a marker (non-chaos producers)', () => {
    const listener = vi.fn();
    engine.on('chaosSignal', listener);

    (engine as any).emitChaosSignal({ ...signal, marker: undefined }, { success: true });

    expect(listener).not.toHaveBeenCalled();
    expect(engine.getChaosHistory()).toHaveLength(0);
  });

  it('caps the history ring buffer at 200 entries (oldest dropped)', () => {
    for (let i = 0; i < 205; i++) {
      (engine as any).emitChaosSignal(
        { ...signal, timestamp: i, marker: { ...marker, timestamp: i } },
        { success: true },
      );
    }
    const history = engine.getChaosHistory();
    expect(history).toHaveLength(200);
    expect(history[0]!.timestamp).toBe(5); // 0..4 dropped
    expect(history[199]!.timestamp).toBe(204);
  });
});
