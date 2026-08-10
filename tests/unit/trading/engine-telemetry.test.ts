/**
 * Engine-level telemetry tests (OpenSpec change fix-chaos-live-invisibility,
 * task 5.1):
 *
 *  - `bot:position` is emitted ONLY at confirmed order results: a filled buy
 *    emits an open (long) event, a filled sell/close emits a flat event, and
 *    a FAILED order emits NO position event (no phantom open on the dashboard).
 *  - Feed telemetry (`bot:feedStatus`) is emitted for connection changes AND
 *    candle ticks, and persistence is throttled: structural changes
 *    (connection/subscription/error) write immediately, while candle-count-only
 *    updates write at most once per FEED_STATE_PERSIST_THROTTLE_MS window.
 *
 * The engine's real `initialize()` is driven with the heavy I/O dependencies
 * mocked (bar feed, DEX adapter, scheduler) so the REAL submitOrders closure
 * and feed-callback wiring are exercised, not a copy.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

// Captured from the module mocks below — used to drive the real engine wiring.
const { mockSchedulerOpts, mockFeedCallbacks } = vi.hoisted(() => ({
  mockSchedulerOpts: { current: null as { submitOrders?: (signals: unknown[]) => Promise<void> } | null },
  mockFeedCallbacks: {
    candle: null as ((candle: unknown) => void) | null,
    tick: null as ((tick: unknown) => void) | null,
    error: null as ((error: Error) => void) | null,
    connection: null as ((connected: boolean) => void) | null,
  },
}));

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
    fetchHistoricalCandles: vi.fn().mockResolvedValue([]),
    setCandleCallback: (cb: (candle: unknown) => void) => {
      mockFeedCallbacks.candle = cb;
    },
    setTickCallback: (cb: (tick: unknown) => void) => {
      mockFeedCallbacks.tick = cb;
    },
    setErrorCallback: (cb: (error: Error) => void) => {
      mockFeedCallbacks.error = cb;
    },
    setConnectionCallback: (cb: (connected: boolean) => void) => {
      mockFeedCallbacks.connection = cb;
    },
  })),
  // bot-engine imports timeframeToMinutes from this module; without a
  // faithful export the initialize() → updateNextCandleEta path throws.
  timeframeToMinutes: (timeframe: string) => {
    const numeric = Number(timeframe);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const unit = timeframe.toUpperCase();
    if (unit === 'D') return 1440;
    if (unit === 'W') return 10080;
    if (unit === 'M') return 43_200;
    return 0;
  },
  // Same import block in bot-engine.ts pulls this constant for ETA warnings.
  LONG_TIMEFRAME_WARN_MINUTES: 10,
  // bot-engine also imports the shared next-boundary ETA helper (review #3);
  // faithful inline copy so initialize() → updateNextCandleEta works.
  nextBoundaryAfter: (now: number, durationMs: number) => {
    const boundary = Math.ceil(now / durationMs) * durationMs;
    return boundary > now ? boundary : boundary + durationMs;
  },
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
  LiveScheduler: vi.fn().mockImplementation((opts: { submitOrders?: (signals: unknown[]) => Promise<void> }) => {
    mockSchedulerOpts.current = opts;
    return {
      liveTick: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn(),
    };
  }),
}));

vi.mock('../../../src/strategy/strategy-engine.js', () => ({
  StrategyEngine: vi.fn().mockImplementation(() => ({
    updateBar: vi.fn(),
    getEquity: vi.fn().mockReturnValue(10_000_000_000),
    getPosition: vi.fn().mockReturnValue({ direction: 'flat', quantity: 0 }),
    entry: vi.fn(),
    close: vi.fn(),
    getNewMarkers: vi.fn().mockReturnValue([]),
  })),
}));

import { BotEngine } from '../../../src/trading/bot-engine.js';
import {
  LiveStrategyExecutor,
  type ExecutionResult,
  type TradeSignal as ExecutorTradeSignal,
} from '../../../src/trading/live-strategy-executor.js';
import type { PositionEvent, FeedStatus } from '../../../src/trading/bot-engine.js';
import type { TradeSignal as SchedulerTradeSignal } from '../../../src/trading/scheduler.js';

function makeSignal(action: 'buy' | 'sell', timestamp = 1_700_000_000_000): SchedulerTradeSignal {
  return {
    pair: { symbol: 'BTCUSDT', timeframe: '60' },
    action,
    quantity: 0.1,
    price: action === 'buy' ? 50_000 : 51_000,
    timestamp,
    marker: {
      type: action === 'buy' ? 'entry' : 'close',
      orderId: '',
      name: action === 'buy' ? 'Long' : 'Exit',
      direction: 'long',
      action,
      quantity: 0.1,
      price: action === 'buy' ? 50_000 : 51_000,
      barIndex: 0,
      timestamp,
      color: '#00FF00',
    },
  };
}

async function initChaosEngine(): Promise<BotEngine> {
  const engine = new BotEngine();
  engine.configure({
    strategySource: '',
    dex: 'jupiter-swap',
    pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }],
    risk: { maxDailyLoss: 100 },
    chaosMode: { enabled: true },
  });
  await (engine as unknown as { initialize: () => Promise<void> }).initialize();
  return engine;
}

function makeCandle(timestamp = 1_700_000_000_000) {
  return {
    symbol: 'BTCUSDT',
    timeframe: '60',
    timestamp,
    open: 50_000,
    high: 51_000,
    low: 49_000,
    close: 50_500,
    volume: 1000,
  };
}

describe('bot:position emission at confirmed order results (task 1.4 / D3)', () => {
  let engine: BotEngine;
  let execSpy: MockInstance<(signal: ExecutorTradeSignal) => Promise<ExecutionResult>>;

  beforeEach(async () => {
    mockSchedulerOpts.current = null;
    engine = await initChaosEngine();
    // Control the executor's DEX outcome from the engine's REAL submitOrders
    // closure: success → position event; failure → no position event.
    execSpy = vi
      .spyOn(LiveStrategyExecutor.prototype, 'executeSignal')
      .mockResolvedValue({ success: true, signal: makeSignal('buy') } as never);
  });

  afterEach(() => {
    execSpy.mockRestore();
  });

  it('emits bot:position long on a CONFIRMED buy fill', async () => {
    const events: PositionEvent[] = [];
    engine.on('position', (e) => events.push(e));

    await mockSchedulerOpts.current!.submitOrders!([makeSignal('buy')]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      pair: 'BTCUSDT:60',
      symbol: 'BTCUSDT',
      timeframe: '60',
      direction: 'long',
      quantity: 0.1,
    });
  });

  it('emits bot:position flat on a CONFIRMED sell/close fill', async () => {
    execSpy.mockResolvedValue({ success: true, signal: makeSignal('sell') } as never);
    const events: PositionEvent[] = [];
    engine.on('position', (e) => events.push(e));

    await mockSchedulerOpts.current!.submitOrders!([makeSignal('sell')]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      pair: 'BTCUSDT:60',
      direction: 'flat',
      quantity: 0,
      entryPrice: 0,
    });
  });

  it('does NOT emit bot:position when the order FAILS (no phantom open)', async () => {
    execSpy.mockResolvedValue({
      success: false,
      signal: makeSignal('buy'),
      error: 'dex down',
    } as never);

    const events: PositionEvent[] = [];
    const failedSignals: Array<{ success: boolean }> = [];
    engine.on('position', (e) => events.push(e));
    engine.on('chaosSignal', (record) => failedSignals.push(record));

    await mockSchedulerOpts.current!.submitOrders!([makeSignal('buy')]);

    // The failure is surfaced on the chaosSignal channel, never as a position.
    expect(events).toHaveLength(0);
    expect(failedSignals).toHaveLength(1);
    expect(failedSignals[0].success).toBe(false);
  });

  it('increments ordersExecuted on success and ordersFailed on failure', async () => {
    execSpy.mockResolvedValueOnce({ success: true, signal: makeSignal('buy') } as never);
    execSpy.mockResolvedValueOnce({
      success: false,
      signal: makeSignal('buy'),
      error: 'dex down',
    } as never);

    await mockSchedulerOpts.current!.submitOrders!([makeSignal('buy', 1), makeSignal('buy', 2)]);

    expect((engine as unknown as { chaosStats: { ordersExecuted: number; ordersFailed: number } }).chaosStats).toMatchObject({
      ordersExecuted: 1,
      ordersFailed: 1,
    });
  });
});

describe('feed telemetry emit + throttled persistence (task 1.3 / D1)', () => {
  let engine: BotEngine;

  beforeEach(async () => {
    mockFeedCallbacks.candle = null;
    mockFeedCallbacks.tick = null;
    mockFeedCallbacks.connection = null;
    mockFeedCallbacks.error = null;
    engine = await initChaosEngine();
  });

  afterEach(() => {
    // Note: NO vi.restoreAllMocks() here — it also resets the vi.fn()
    // implementations of the module mocks above, breaking the next test's
    // initialize(). Only real timers need resetting.
    vi.useRealTimers();
  });

  it('emits bot:feedStatus immediately on structural changes and throttles candle ticks to ~1/s (review #2)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);

    const statuses: FeedStatus[] = [];
    engine.on('feedStatus', (s) => statuses.push(s));

    // Structural change (connect) → immediate emit (forcePersist bypasses the
    // broadcast throttle).
    mockFeedCallbacks.connection!(true);
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toMatchObject({ connected: true, candleCount: 0 });

    // Structural change (disconnect) inside the throttle window STILL emits.
    mockFeedCallbacks.connection!(false);
    expect(statuses).toHaveLength(2);
    expect(statuses[1]).toMatchObject({ connected: false });

    mockFeedCallbacks.connection!(true);
    expect(statuses).toHaveLength(3);

    // Candle ticks: two candles back-to-back in the same ms are suppressed —
    // tick-level broadcasts fire at most once per FEED_STATUS_BROADCAST_THROTTLE_MS.
    mockFeedCallbacks.candle!(makeCandle(1_700_000_000_000));
    mockFeedCallbacks.candle!(makeCandle(1_700_000_060_000));
    expect(statuses).toHaveLength(3);

    // Once ≥1s has elapsed since the last broadcast, the next tick emits.
    vi.advanceTimersByTime(1_000);
    mockFeedCallbacks.candle!(makeCandle(1_700_000_100_000));
    expect(statuses).toHaveLength(4);
    expect(statuses[3]).toMatchObject({ connected: true, candleCount: 3, lastCandleAt: 1_700_000_100_000 });
  });

  it('persists structural changes immediately but throttles candle-count-only writes to once per window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);

    const persistSpy = vi.spyOn(engine as unknown as { persistFeedState: () => Promise<void> }, 'persistFeedState');

    // Structural change (connect) → immediate write, bypassing the throttle.
    mockFeedCallbacks.connection!(true);
    expect(persistSpy).toHaveBeenCalledTimes(1);

    // Structural change (disconnect) inside the throttle window STILL writes.
    vi.advanceTimersByTime(10_000);
    mockFeedCallbacks.connection!(false);
    expect(persistSpy).toHaveBeenCalledTimes(2);

    // Candle-count-only updates: two candles inside the 60s window are
    // throttled (no write at all beyond the structural ones).
    mockFeedCallbacks.candle!(makeCandle(1_700_000_000_000));
    mockFeedCallbacks.candle!(makeCandle(1_700_000_030_000));
    expect(persistSpy).toHaveBeenCalledTimes(2);

    // Once the window passes, the next candle-count update persists again.
    vi.advanceTimersByTime(61_000);
    mockFeedCallbacks.candle!(makeCandle(1_700_000_100_000));
    expect(persistSpy).toHaveBeenCalledTimes(3);
  });
});

// Starts the engine to Running (initChaosEngine only reaches Idle via a bare
// initialize()). The silence marker is only computed while Running, so the
// S3 scenario must drive the full start() path.
async function startChaosEngine(): Promise<BotEngine> {
  const engine = new BotEngine();
  engine.configure({
    strategySource: '',
    dex: 'jupiter-swap',
    pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }],
    risk: { maxDailyLoss: 100 },
    chaosMode: { enabled: true },
  });
  // start() calls initialize() internally then transitions Running — a bare
  // initialize() (which leaves state Idle) cannot reach Running.
  await engine.start();
  return engine;
}

// Mirrors the executor/BotEngine's silence threshold (FEED_SILENCE_THRESHOLD_MS in
// src/trading/bot-engine.ts). Keep in sync if the production constant moves.
const FEED_SILENCE_THRESHOLD_MS = 90_000;

describe('feed silence marker on a connected feed with zero candles (QA S3 / FIX 1)', () => {
  let engine: BotEngine;

  beforeEach(async () => {
    mockFeedCallbacks.candle = null;
    mockFeedCallbacks.tick = null;
    mockFeedCallbacks.connection = null;
    mockFeedCallbacks.error = null;
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    engine = await startChaosEngine();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // buildFeedStatus is private — cast is consistent with the existing
  // private-method access (persistFeedState) in this file.
  const readStatus = () =>
    (engine as unknown as { buildFeedStatus(): FeedStatus }).buildFeedStatus();

  it('does NOT mark a connected zero-candle feed silent before the threshold elapses', () => {
    // Feed connects at T0 with zero confirmed candles; feedStartedAt = T0.
    mockFeedCallbacks.connection!(true);

    // Immediately connected: still a Running run, lastCandleAt null, but far
    // from the silence threshold.
    const status = readStatus();
    expect(status).toMatchObject({ connected: true, candleCount: 0, lastCandleAt: null });
    expect(status.silentSince).toBeUndefined();

    // Just below the threshold — still not silent.
    vi.advanceTimersByTime(89_999);
    expect(readStatus().silentSince).toBeUndefined();
  });

  it('marks a connected zero-candle feed silent once the threshold elapses (FIX 1)', () => {
    mockFeedCallbacks.connection!(true); // feedStartedAt = T0

    // Cross the threshold: the connected-but-mute feed must now be flagged.
    vi.advanceTimersByTime(FEED_SILENCE_THRESHOLD_MS);
    const status = readStatus();
    expect(status).toMatchObject({ connected: true, candleCount: 0, lastCandleAt: null });
    // silentSince = feedStartedAt (T0) + threshold.
    expect(status.silentSince).toBe(1_700_000_000_000 + FEED_SILENCE_THRESHOLD_MS);
  });
});

// ---------------------------------------------------------------------------
// Telegram position notifications at confirmed order results (BUG 4b)
// ---------------------------------------------------------------------------
// Drives the engine's REAL submitOrders closure (captured through the mocked
// LiveScheduler, same as the telemetry suites above) with an injected
// telegramBot mock: a confirmed buy must fire notifyPositionOpened, a
// confirmed sell/close must fire notifyPositionClosed, and a FAILED order must
// fire nothing (no phantom open/close notification).

describe('Telegram position notifications at confirmed order results (BUG 4b)', () => {
  let execSpy: MockInstance<(signal: ExecutorTradeSignal) => Promise<ExecutionResult>>;
  let telegramBot: {
    notifyPositionOpened: ReturnType<typeof vi.fn>;
    notifyPositionClosed: ReturnType<typeof vi.fn>;
  };

  async function initEngineWithTelegramBot(): Promise<BotEngine> {
    const e = new BotEngine({ telegramBot: telegramBot as never });
    e.configure({
      strategySource: '',
      dex: 'jupiter-swap',
      pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }],
      risk: { maxDailyLoss: 100 },
      chaosMode: { enabled: true },
    });
    await (e as unknown as { initialize: () => Promise<void> }).initialize();
    return e;
  }

  beforeEach(async () => {
    mockSchedulerOpts.current = null;
    telegramBot = {
      notifyPositionOpened: vi.fn().mockResolvedValue(undefined),
      notifyPositionClosed: vi.fn().mockResolvedValue(undefined),
    };
    await initEngineWithTelegramBot();
    // Control the executor's DEX outcome from the engine's REAL submitOrders
    // closure: success → the position notification fires at the confirmed
    // order-result point.
    execSpy = vi
      .spyOn(LiveStrategyExecutor.prototype, 'executeSignal')
      .mockResolvedValue({ success: true, signal: makeSignal('buy') } as never);
  });

  afterEach(() => {
    execSpy.mockRestore();
  });

  it('calls notifyPositionOpened when a buy is confirmed', async () => {
    await mockSchedulerOpts.current!.submitOrders!([makeSignal('buy')]);

    // Fire-and-forget by design: wait for the never-awaited notification.
    await vi.waitFor(() => expect(telegramBot.notifyPositionOpened).toHaveBeenCalledTimes(1));
    expect(telegramBot.notifyPositionClosed).not.toHaveBeenCalled();
    const trade = telegramBot.notifyPositionOpened.mock.calls[0]![0] as {
      symbol: string;
      side: string;
      status: string;
    };
    expect(trade.symbol).toBe('BTCUSDT');
    expect(trade.side).toBe('buy');
    expect(trade.status).toBe('confirmed');
  });

  it('calls notifyPositionClosed when a sell/close with an entry snapshot is confirmed', async () => {
    const sellSignal = makeSignal('sell');
    sellSignal.positionEntryPrice = 50_000;
    execSpy.mockResolvedValue({ success: true, signal: sellSignal } as never);

    await mockSchedulerOpts.current!.submitOrders!([sellSignal]);

    await vi.waitFor(() => expect(telegramBot.notifyPositionClosed).toHaveBeenCalledTimes(1));
    expect(telegramBot.notifyPositionOpened).not.toHaveBeenCalled();
    const trade = telegramBot.notifyPositionClosed.mock.calls[0]![0] as {
      symbol: string;
      realizedPnl: number;
    };
    expect(trade.symbol).toBe('BTCUSDT');
    // (exit 51_000 − entry 50_000) × qty 0.1
    expect(trade.realizedPnl).toBe(100);
  });

  it('does NOT fire a position notification when the order FAILS (no phantom open/close)', async () => {
    execSpy.mockResolvedValue({
      success: false,
      signal: makeSignal('buy'),
      error: 'dex down',
    } as never);

    await mockSchedulerOpts.current!.submitOrders!([makeSignal('buy')]);

    expect(telegramBot.notifyPositionOpened).not.toHaveBeenCalled();
    expect(telegramBot.notifyPositionClosed).not.toHaveBeenCalled();
  });
});
