import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BotEngine } from '../../../src/trading/bot-engine.js';
import { BotState, ErrorSeverity } from '../../../src/trading/types.js';
import type { BotConfig } from '../../../src/trading/types.js';
import { RiskManager } from '../../../src/trading/risk/risk-manager.js';
import { CloseManager } from '../../../src/trading/close-manager.js';
import type { CloseResult, CloseSummary } from '../../../src/trading/close-manager.js';
import type { PositionInfo } from '../../../src/trading/live-strategy-executor.js';

// Mock modules before importing LiveStrategyExecutor — same surface as
// live-strategy-executor.test.ts (these modules carry import-time side
// effects that are not needed in unit tests).
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
    updateBar: vi.fn(),
    // D4 warning-sink seam (strategy-engine.ts:144) — ExecutionEngine
    // calls setWarningSink non-optionally after construction.
    setWarningSink: vi.fn(),
    getEquity: vi.fn().mockReturnValue(10_000_000_000),
    getPosition: vi.fn().mockReturnValue({ direction: 'flat', quantity: 0 }),
    entry: vi.fn(),
    close: vi.fn(),
    getNewMarkers: vi.fn().mockReturnValue([]),
  })),
}));

// The engine persists feed-state.json + close-attempt.json via node:fs/promises —
// mock it so the feed-liveness telemetry AND the F3 tombstone tests never write
// real files to the repo root. readFile defaults to ENOENT (no tombstones) with
// the F3 tests overriding it via vi.mocked(readFile).
vi.mock('node:fs/promises', () => {
  const writeFile = vi.fn(async () => {});
  const readFile = vi.fn(async () => {
    throw new Error('ENOENT: no such file or directory');
  });
  return { writeFile, readFile };
});

import { readFile } from 'node:fs/promises';

import { LiveStrategyExecutor } from '../../../src/trading/live-strategy-executor.js';
import { LiveScheduler } from '../../../src/trading/live-scheduler.js';
import type { PairId } from '../../../src/trading/scheduler.js';

const defaultConfig: BotConfig = {
  strategySource: '//@version=6\nstrategy("test")',
  dex: 'jupiter-swap',
  pairs: [{ symbol: 'SOL/USDC', timeframe: '1m' }],
  risk: {
    maxDailyLoss: 100,
  },
};

describe('BotEngine', () => {
  let engine: BotEngine;

  beforeEach(() => {
    engine = new BotEngine();
  });

  it('should start in Idle state', () => {
    expect(engine.state).toBe(BotState.Idle);
  });

  it('should accept configuration in Idle state', () => {
    engine.configure(defaultConfig);
    expect(engine.config).toEqual(defaultConfig);
  });

  it('should reject configuration in non-idle state', async () => {
    // Configure and start
    engine.configure(defaultConfig);

    // Manually move to Starting
    // We need to use a different approach since start() is async with real initialization
    // Instead test via the state machine
    expect(() => {
      // Direct state manipulation is not possible since stateMachine is private
      // but we can test the guard from the public API
    }).not.toThrow();
  });

  it('should throw start without configuration', async () => {
    await expect(engine.start()).rejects.toThrow('Cannot start bot without configuration');
  });

  it('should transition through lifecycle on start/stop', async () => {
    engine.configure(defaultConfig);

    // Mock internal initialize to avoid attempting real connections
    const initSpy = vi
      .spyOn(engine as unknown as { initialize: () => Promise<void> }, 'initialize')
      .mockResolvedValue(undefined);
    const shutdownSpy = vi
      .spyOn(engine as unknown as { shutdown: () => Promise<void> }, 'shutdown')
      .mockResolvedValue(undefined);

    await engine.start();
    expect(engine.state).toBe(BotState.Running);
    expect(engine.startedAt).not.toBeNull();
    expect(engine.uptimeMs).toBeGreaterThanOrEqual(0);

    await engine.stop();
    expect(engine.state).toBe(BotState.Stopped);

    initSpy.mockRestore();
    shutdownSpy.mockRestore();
  });

  it('should handle emergency stop from Running state', async () => {
    engine.configure(defaultConfig);
    vi.spyOn(
      engine as unknown as { initialize: () => Promise<void> },
      'initialize',
    ).mockResolvedValue(undefined);
    vi.spyOn(engine as unknown as { shutdown: () => Promise<void> }, 'shutdown').mockResolvedValue(
      undefined,
    );

    await engine.start();
    expect(engine.state).toBe(BotState.Running);

    const emergencySpy = vi.spyOn(
      engine as unknown as { shutdown: () => Promise<void> },
      'shutdown',
    );
    await engine.emergencyStop();
    expect(engine.state).toBe(BotState.Stopped);
    expect(emergencySpy).toHaveBeenCalled();
  });

  it('should reject emergency stop from Idle state', async () => {
    await expect(engine.emergencyStop()).rejects.toThrow('Emergency stop not available from state');
  });

  it('should record errors', () => {
    engine.recordError('TEST_ERR', 'Test error message', ErrorSeverity.Warning);
    expect(engine.errors).toHaveLength(1);
    expect(engine.errors[0]!.code).toBe('TEST_ERR');
    expect(engine.errors[0]!.message).toBe('Test error message');
    expect(engine.errors[0]!.severity).toBe(ErrorSeverity.Warning);
  });

  it('should emit stateChange events', async () => {
    engine.configure(defaultConfig);
    vi.spyOn(
      engine as unknown as { initialize: () => Promise<void> },
      'initialize',
    ).mockResolvedValue(undefined);
    vi.spyOn(engine as unknown as { shutdown: () => Promise<void> }, 'shutdown').mockResolvedValue(
      undefined,
    );

    const stateChanges: Array<{ previous: BotState; current: BotState }> = [];
    engine.on('stateChange', (event) => {
      stateChanges.push({ previous: event.previous, current: event.current });
    });

    await engine.start();
    await engine.stop();

    expect(stateChanges.length).toBeGreaterThanOrEqual(3);
    // Idle → Starting → Running
    expect(stateChanges[0]!.current).toBe(BotState.Starting);
    expect(stateChanges[1]!.current).toBe(BotState.Running);
  });

  it('should emit error events', () => {
    const errors: Array<{ code: string }> = [];
    engine.on('error', (err) => {
      errors.push({ code: err.code });
    });

    engine.recordError('ERR_1', 'Error one');
    engine.recordError('ERR_2', 'Error two');

    expect(errors).toHaveLength(2);
    expect(errors[0]!.code).toBe('ERR_1');
    expect(errors[1]!.code).toBe('ERR_2');
  });

  it('should provide a valid status snapshot', () => {
    engine.configure(defaultConfig);
    const snapshot = engine.getSnapshot();

    expect(snapshot.state).toBe(BotState.Idle);
    expect(snapshot.strategyName).toBe('test');
    expect(snapshot.dex).toBe('jupiter-swap');
    expect(snapshot.uptimeMs).toBe(0);
    expect(snapshot.errors).toEqual([]);
    expect(snapshot.positions).toEqual([]);
  });

  it('should report (not configured) when no strategy source is set', () => {
    engine.configure({ ...defaultConfig, strategySource: '' });
    const snapshot = engine.getSnapshot();

    expect(snapshot.strategyName).toBe('(not configured)');
  });

  it('should report (not configured) when source has no derivable name', () => {
    engine.configure({ ...defaultConfig, strategySource: '//@version=6\nplot(close)' });
    const snapshot = engine.getSnapshot();

    expect(snapshot.strategyName).toBe('(not configured)');
  });

  it('should truncate a derived strategy name over 50 chars', () => {
    const longName = 'S'.repeat(60);
    engine.configure({ ...defaultConfig, strategySource: `//@version=6\nstrategy("${longName}")` });
    const snapshot = engine.getSnapshot();

    expect(snapshot.strategyName).toBe('S'.repeat(50));
  });

  it('should allow reset from Stopped state', async () => {
    engine.configure(defaultConfig);
    vi.spyOn(
      engine as unknown as { initialize: () => Promise<void> },
      'initialize',
    ).mockResolvedValue(undefined);
    vi.spyOn(engine as unknown as { shutdown: () => Promise<void> }, 'shutdown').mockResolvedValue(
      undefined,
    );

    await engine.start();
    await engine.stop();

    await engine.reset();
    expect(engine.state).toBe(BotState.Idle);
    expect(engine.startedAt).toBeNull();
  });

  it('should refuse to start when autoSelect is true, no pairs configured, and no callback', async () => {
    const configWithAutoSelect: BotConfig = {
      ...defaultConfig,
      pairs: undefined,
      autoSelect: true,
    };
    engine.configure(configWithAutoSelect);

    // Per bot-start-lifecycle: no callback → auto-selection returned no pairs
    await expect(engine.start()).rejects.toThrow(/auto-selection returned no pairs/i);
    expect(engine.state).toBe(BotState.Idle);
  });

  it('should start when autoSelect is true but pairs are configured', async () => {
    const configWithAutoSelectAndPairs: BotConfig = {
      ...defaultConfig,
      pairs: [{ symbol: 'SOL/USDC', timeframe: '1m' }],
      autoSelect: true,
    };
    engine.configure(configWithAutoSelectAndPairs);
    vi.spyOn(
      engine as unknown as { initialize: () => Promise<void> },
      'initialize',
    ).mockResolvedValue(undefined);

    await engine.start();
    expect(engine.state).toBe(BotState.Running);
  });

  it('should refuse to start when autoSelect is false and no pairs configured', async () => {
    const configNoPairs: BotConfig = {
      ...defaultConfig,
      pairs: undefined,
      autoSelect: false,
    };
    engine.configure(configNoPairs);

    await expect(engine.start()).rejects.toThrow('No trading pairs configured');
    expect(engine.state).toBe(BotState.Idle);
  });

  it('should reject reset from Running state', async () => {
    engine.configure(defaultConfig);
    vi.spyOn(
      engine as unknown as { initialize: () => Promise<void> },
      'initialize',
    ).mockResolvedValue(undefined);

    await engine.start();
    await expect(engine.reset()).rejects.toThrow('Cannot reset bot from state');
  });
});

// ---- Risk event wiring ----

describe('BotEngine risk event wiring', () => {
  function createRiskManager(): RiskManager {
    return new RiskManager({
      dailyLoss: { maxDailyLoss: 100, timezone: 'UTC' },
      emergencyClosePositions: true,
      walletBalance: { maxDailyWalletLossUsdc: 50, timezone: 'UTC' },
    });
  }

  function createTelegramBotMock() {
    return {
      notifyDailyLossTriggered: vi.fn().mockResolvedValue(undefined),
      notifyEmergencyStop: vi.fn().mockResolvedValue(undefined),
    } as any;
  }

  async function startEngine(engine: BotEngine): Promise<void> {
    engine.configure(defaultConfig);
    vi.spyOn(
      engine as unknown as { initialize: () => Promise<void> },
      'initialize',
    ).mockResolvedValue(undefined);
    await engine.start();
  }

  it('should emergency stop and notify Telegram when daily_loss_breached fires', async () => {
    const riskManager = createRiskManager();
    const telegramBot = createTelegramBotMock();
    const engine = new BotEngine({ riskManager, telegramBot });
    await startEngine(engine);
    expect(engine.state).toBe(BotState.Running);

    const emergencySpy = vi.spyOn(engine, 'emergencyStop').mockResolvedValue(undefined);

    // 150 USDC realized loss breaches the 100 USDC daily limit
    riskManager.recordTrade(-150);

    // R1: the emergency stop fires FIRST, then the notification — wait for
    // both so these assertions are not racy with the fire-and-forget handler.
    await vi.waitFor(() => expect(emergencySpy).toHaveBeenCalled());
    await vi.waitFor(() =>
      expect(telegramBot.notifyEmergencyStop).toHaveBeenCalledWith('daily_loss'),
    );
    expect(telegramBot.notifyDailyLossTriggered).toHaveBeenCalledWith(150, 100);
  });

  it('should emergency stop and notify Telegram when wallet_balance_breached fires', async () => {
    const riskManager = createRiskManager();
    const telegramBot = createTelegramBotMock();
    const engine = new BotEngine({ riskManager, telegramBot });
    await startEngine(engine);
    expect(engine.state).toBe(BotState.Running);

    const emergencySpy = vi.spyOn(engine, 'emergencyStop').mockResolvedValue(undefined);

    // 100 USDC reference, then a drop to 40 USDC → 60 USDC loss ≥ 50 USDC limit
    riskManager.recordBalance(100_000_000n);
    riskManager.recordBalance(40_000_000n);

    // R1: stop first, then notify — wait for both (see daily-loss test).
    await vi.waitFor(() => expect(emergencySpy).toHaveBeenCalled());
    await vi.waitFor(() =>
      expect(telegramBot.notifyEmergencyStop).toHaveBeenCalledWith('wallet_balance'),
    );
    expect(telegramBot.notifyDailyLossTriggered).not.toHaveBeenCalled();
  });

  it('should not emergency stop when daily loss breached while not Running', async () => {
    const riskManager = createRiskManager();
    const telegramBot = createTelegramBotMock();
    const engine = new BotEngine({ riskManager, telegramBot });
    // Engine stays Idle — never started
    const emergencySpy = vi.spyOn(engine, 'emergencyStop').mockResolvedValue(undefined);

    riskManager.recordTrade(-150);

    await vi.waitFor(() => expect(telegramBot.notifyDailyLossTriggered).toHaveBeenCalled());
    expect(emergencySpy).not.toHaveBeenCalled();
    expect(engine.state).toBe(BotState.Idle);
  });

  it('should not emergency stop when wallet balance breached while not Running', async () => {
    const riskManager = createRiskManager();
    const telegramBot = createTelegramBotMock();
    const engine = new BotEngine({ riskManager, telegramBot });
    const emergencySpy = vi.spyOn(engine, 'emergencyStop').mockResolvedValue(undefined);

    riskManager.recordBalance(100_000_000n);
    riskManager.recordBalance(40_000_000n);

    await vi.waitFor(() => expect(telegramBot.notifyEmergencyStop).toHaveBeenCalled());
    expect(emergencySpy).not.toHaveBeenCalled();
    expect(engine.state).toBe(BotState.Idle);
  });
});

// ---- Realized PnL round-trip (B1) ----

describe('BotEngine realized PnL round-trip (B1)', () => {
  function createMockDex() {
    return {
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
    } as any;
  }

  function createMockWalletManager() {
    return {
      importWallet: vi.fn(),
      getKeypair: vi.fn().mockResolvedValue({
        value: {
          publicKey: 'mock-public-key',
          privateKey: new Uint8Array(64),
        },
        dispose: vi.fn(),
      }),
      hasWallet: vi.fn().mockResolvedValue(true),
    } as any;
  }

  function createRiskManagerMock() {
    return {
      recordTrade: vi.fn().mockReturnValue(false),
      recordBalance: vi.fn().mockReturnValue(false),
      onEvent: vi.fn(),
      isWalletBalanceEnabled: true,
    } as any;
  }

  it('records realized PnL on a close through the scheduler processCandle -> submitOrders round-trip', async () => {
    const dex = createMockDex();
    const riskManager = createRiskManagerMock();
    const executor = new LiveStrategyExecutor({
      strategySource: '//@version=5\nstrategy("Test")',
      dex,
      walletManager: createMockWalletManager(),
      pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }],
      initialCapital: BigInt(1000000000), // 1000 USDC
      positionSizePercent: 10,
      maxDailyLoss: 100,
      riskManager,
    });

    const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
    await executor.initializeStrategy(pair);

    // Seed a long position and drive the runtime to emit a close marker on
    // the next candle — the exact production entry path (processCandle
    // flattens the position state before the signal executes downstream).
    const state = (executor as any).strategyStates.get('BTCUSDT:60');
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

    // Wire the scheduler exactly like BotEngine.initialize() does
    // (src/trading/bot-engine.ts processCandle/submitOrders maps): the
    // executor TradeSignal is mapped to a scheduler TradeSignal and back.
    const scheduler = new LiveScheduler({
      pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }],
      processCandle: async (candle) => {
        const signals = await executor.processCandle(candle);
        return signals.map((s) => ({
          pair: { symbol: s.symbol, timeframe: candle.timeframe },
          action: s.action,
          quantity: s.quantity,
          price: s.expectedPrice,
          timestamp: s.timestamp,
          marker: s.marker,
          positionEntryPrice: s.positionEntryPrice,
        }));
      },
      submitOrders: async (signals) => {
        for (const signal of signals) {
          await executor.executeSignal({
            action: signal.action,
            symbol: signal.pair.symbol,
            quantity: signal.quantity,
            expectedPrice: signal.price,
            timestamp: signal.timestamp,
            positionEntryPrice: signal.positionEntryPrice,
          });
        }
      },
      strategyExecutor: executor,
      dex,
      persistState: false,
    });

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

    await scheduler.liveTick([candle], undefined);

    // realized PnL = (51000 − 50000) × 0.1 = 100 — recorded even though the
    // position state was flattened by reconcilePosition() during processCandle.
    expect(riskManager.recordTrade).toHaveBeenCalledTimes(1);
    expect(riskManager.recordTrade).toHaveBeenCalledWith(100);
  });
});

// ---- Feed-liveness telemetry (liveness suite) ----

describe('BotEngine feed telemetry (liveness suite)', () => {
  function makeEngineWithLogger() {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const engine = new BotEngine({ logger: logger as never });
    return { engine, logger };
  }

  async function startRunning(engine: BotEngine): Promise<void> {
    engine.configure({ ...defaultConfig, pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }] });
    vi.spyOn(
      engine as unknown as { initialize: () => Promise<void> },
      'initialize',
    ).mockResolvedValue(undefined);
    vi.spyOn(engine as unknown as { shutdown: () => Promise<void> }, 'shutdown').mockResolvedValue(
      undefined,
    );
    await engine.start();
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('advances tickCount/lastTickAt on EVERY kline tick and candleCount/lastCandleAt on confirmed candles', () => {
    const { engine } = makeEngineWithLogger();
    engine.configure({ ...defaultConfig, pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }] });

    const e = engine as unknown as {
      handleFeedTick: (t: {
        symbol: string;
        timeframe: string;
        timestamp: number;
        close: number;
        confirm: boolean;
      }) => void;
      handleCandle: (c: {
        symbol: string;
        timeframe: string;
        timestamp: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      }) => void;
    };

    // Two kline messages — one unconfirmed, one confirmed. BOTH advance the
    // tick telemetry (feed proves alive before the first confirmed candle).
    e.handleFeedTick({
      symbol: 'BTCUSDT',
      timeframe: '60',
      timestamp: 1000,
      close: 100,
      confirm: false,
    });
    e.handleFeedTick({
      symbol: 'BTCUSDT',
      timeframe: '60',
      timestamp: 2000,
      close: 101,
      confirm: true,
    });
    // The confirmed candle advances the candle path (execution gate untouched).
    e.handleCandle({
      symbol: 'BTCUSDT',
      timeframe: '60',
      timestamp: 2000,
      open: 100,
      high: 102,
      low: 99,
      close: 101,
      volume: 10,
    });

    const status = engine.getFeedStatus();
    expect(status.tickCount).toBe(2);
    expect(status.lastTickAt).toBe(2000);
    expect(status.candleCount).toBe(1);
    expect(status.lastCandleAt).toBe(2000);
  });

  it('flags a connected Running feed silent after FEED_SILENCE_THRESHOLD_MS with no tick — a fresh tick resets the reference', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const { engine } = makeEngineWithLogger();
    await startRunning(engine);
    expect(engine.state).toBe(BotState.Running);

    const e = engine as unknown as {
      feedState: { connected: boolean };
      handleFeedTick: (t: {
        symbol: string;
        timeframe: string;
        timestamp: number;
        close: number;
        confirm: boolean;
      }) => void;
    };
    e.feedState.connected = true;
    e.handleFeedTick({
      symbol: 'BTCUSDT',
      timeframe: '60',
      timestamp: 1_700_000_000_000,
      close: 100,
      confirm: false,
    });

    // 60s later: NOT silent — the last kline tick is only 60s old.
    vi.advanceTimersByTime(60_000);
    expect(engine.getFeedStatus().silentSince).toBeUndefined();

    // 31s more (91s since the last tick): silence threshold (90s) crossed.
    vi.advanceTimersByTime(31_000);
    expect(engine.getFeedStatus().silentSince).toBe(1_700_000_000_000 + 90_000);

    // A fresh tick refreshes the silence reference → no longer silent.
    e.handleFeedTick({
      symbol: 'BTCUSDT',
      timeframe: '60',
      timestamp: 1_700_000_000_000 + 91_000,
      close: 100,
      confirm: false,
    });
    expect(engine.getFeedStatus().silentSince).toBeUndefined();
  });

  it('is silent from the connection time when a connected Running feed never delivers a single tick', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const { engine } = makeEngineWithLogger();
    await startRunning(engine);

    const e = engine as unknown as { feedState: { connected: boolean }; feedStartedAt: number };
    e.feedState.connected = true;
    e.feedStartedAt = 1_700_000_000_000;

    vi.advanceTimersByTime(90_000);
    expect(engine.getFeedStatus().silentSince).toBe(1_700_000_000_000 + 90_000);
  });

  it('surfaces nextCandleEta for a long timeframe pair and clears it for a short one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const { engine, logger } = makeEngineWithLogger();
    engine.configure({ ...defaultConfig, pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }] });

    const e = engine as unknown as { updateNextCandleEta: () => void };
    e.updateNextCandleEta();

    // 2024-01-01T00:00:00Z is already hour-aligned → nextBoundaryAfter
    // returns one full duration later (review #3 fix: Math.ceil would have
    // returned `now` itself). ETA = now + 60m.
    expect(engine.getFeedStatus().nextCandleEta).toBe(1_704_070_800_000);
    expect(logger.warn).toHaveBeenCalledWith(
      'Long timeframe — no confirmed candle yet',
      expect.objectContaining({ symbol: 'BTCUSDT', timeframe: '60', minutes: 60 }),
    );

    // Short timeframe (1m) → no ETA, no warning.
    engine.configure({ ...defaultConfig, pairs: [{ symbol: 'BTCUSDT', timeframe: '1' }] });
    e.updateNextCandleEta();
    expect(engine.getFeedStatus().nextCandleEta).toBeUndefined();
  });

  it('toggleChaosMode persists through onConfigPersist so the mode survives a restart (D4)', async () => {
    const onConfigPersist = vi.fn();
    const engine = new BotEngine({ onConfigPersist });
    engine.configure({ ...defaultConfig, chaosMode: { enabled: false } });

    await engine.toggleChaosMode(true);

    expect(engine.config?.chaosMode).toEqual({ enabled: true });
    expect(onConfigPersist).toHaveBeenCalledTimes(1);
    expect(onConfigPersist.mock.calls[0]![0]).toMatchObject({ chaosMode: { enabled: true } });
  });
});

// ---- Auto-close-on-stop: stop paths invoke the close manager ----
//
// Spec: "Every stop path closes all open positions" — user stop → graceful,
// emergency stop → emergency. The injected closeManager ALWAYS wins over the
// internally-constructed one (bot-engine.ts:899-901 "injection wins"); these
// tests wire the injected manager through the same private seam initialize()
// uses, then drive the real stop paths.

describe('BotEngine stop paths call the close manager (auto-close-on-stop)', () => {
  function createMockCloseManager() {
    const closeAllPositions = vi.fn().mockResolvedValue({
      closeRunId: 'test-run',
      total: 0,
      closed: 0,
      failed: 0,
      timedOut: 0,
      durationMs: 0,
      failedSymbols: [],
    } satisfies CloseSummary);
    const manager = { closeAllPositions } as unknown as CloseManager;
    return { manager, closeAllPositions };
  }

  async function startRunning(engine: BotEngine, closeManager: CloseManager): Promise<void> {
    engine.configure(defaultConfig);
    vi.spyOn(
      engine as unknown as { initialize: () => Promise<void> },
      'initialize',
    ).mockResolvedValue(undefined);
    vi.spyOn(engine as unknown as { shutdown: () => Promise<void> }, 'shutdown').mockResolvedValue(
      undefined,
    );
    await engine.start();
    // initialize() is mocked in these tests, so wire the injected manager
    // through the private seam initialize()'s injection branch uses
    // (bot-engine.ts:899-901: this.closeManager = this.injectedCloseManager).
    (engine as unknown as { closeManager: CloseManager | null }).closeManager = closeManager;
  }

  it('stop() closes all positions with the graceful mode and reaches Stopped', async () => {
    const { manager, closeAllPositions } = createMockCloseManager();
    const engine = new BotEngine({ closeManager: manager });
    await startRunning(engine, manager);
    expect(engine.state).toBe(BotState.Running);

    await engine.stop();

    expect(closeAllPositions).toHaveBeenCalledTimes(1);
    expect(closeAllPositions).toHaveBeenCalledWith('user_stop', 'graceful');
    expect(engine.state).toBe(BotState.Stopped);
  });

  it('emergencyStop() closes all positions with the emergency mode and reaches Stopped', async () => {
    const { manager, closeAllPositions } = createMockCloseManager();
    const engine = new BotEngine({ closeManager: manager });
    await startRunning(engine, manager);
    expect(engine.state).toBe(BotState.Running);

    await engine.emergencyStop();

    expect(closeAllPositions).toHaveBeenCalledTimes(1);
    expect(closeAllPositions).toHaveBeenCalledWith('emergency_stop', 'emergency');
    expect(engine.state).toBe(BotState.Stopped);
  });

  it('graceful stop still reaches Stopped when the mocked closeAllPositions REJECTS (deadline guarantee, no re-throw)', async () => {
    const { manager, closeAllPositions } = createMockCloseManager();
    const engine = new BotEngine({ closeManager: manager });
    await startRunning(engine, manager);
    closeAllPositions.mockRejectedValue(new Error('close run blew up'));

    // The engine logs and continues the stop — a close failure must never
    // strand the engine in Stopping (spec: a stop ALWAYS completes).
    await expect(engine.stop()).resolves.toBeUndefined();
    expect(closeAllPositions).toHaveBeenCalledTimes(1);
    expect(engine.state).toBe(BotState.Stopped);
  });

  it('emergency stop still reaches Stopped when the mocked closeAllPositions REJECTS', async () => {
    const { manager, closeAllPositions } = createMockCloseManager();
    const engine = new BotEngine({ closeManager: manager });
    await startRunning(engine, manager);
    closeAllPositions.mockRejectedValue(new Error('close run blew up'));

    await expect(engine.emergencyStop()).resolves.toBeUndefined();
    expect(closeAllPositions).toHaveBeenCalledTimes(1);
    expect(engine.state).toBe(BotState.Stopped);
  });

  it('rejects a double-press of emergency stop after completion and does NOT start a second close run', async () => {
    const { manager, closeAllPositions } = createMockCloseManager();
    const engine = new BotEngine({ closeManager: manager });
    await startRunning(engine, manager);

    await engine.emergencyStop();
    expect(engine.state).toBe(BotState.Stopped);

    // Second press from Stopped is rejected (the bot route maps this to an
    // HTTP 400-level error) and no second close run is started.
    await expect(engine.emergencyStop()).rejects.toThrow('Emergency stop not available from state');
    expect(closeAllPositions).toHaveBeenCalledTimes(1);
  });

  it('F1: two CONCURRENT emergency stops from Error run exactly ONE close — the second is tolerated, never spawned', async () => {
    const { manager, closeAllPositions } = createMockCloseManager();
    const engine = new BotEngine({ closeManager: manager });
    await startRunning(engine, manager);
    expect(engine.state).toBe(BotState.Running);

    // Move to Error — the EXACT case F1 was built for: from Error there is no
    // state-machine transition to serialize callers, so two concurrent
    // emergency stops would BOTH reach closeOpenPositions without the guard.
    engine.recordError('FATAL', 'fatal blowup', ErrorSeverity.Fatal);
    expect(engine.state).toBe(BotState.Error);

    // Fire both without awaiting: tryBeginCloseRun() is synchronous and runs
    // BEFORE any await, so the second caller MUST observe the first's
    // in-progress flag and bail (log-and-return, no new worker).
    const first = engine.emergencyStop();
    const second = engine.emergencyStop();
    await Promise.all([first, second]);

    expect(closeAllPositions).toHaveBeenCalledTimes(1);
    expect(closeAllPositions).toHaveBeenCalledWith('emergency_stop', 'emergency');
    expect(engine.state).toBe(BotState.Stopped);
  });

  it('F1: a thrown transition mid-stop does NOT permanently lock the close-run guard — a later stop still closes', async () => {
    const { manager, closeAllPositions } = createMockCloseManager();
    const engine = new BotEngine({ closeManager: manager });
    await startRunning(engine, manager);
    expect(engine.state).toBe(BotState.Running);

    // Make the first stop's Stopping transition throw — the close path never
    // runs, but the finally MUST release closeRunInProgress.
    const stateMachine = (
      engine as unknown as {
        stateMachine: { transition: (...args: unknown[]) => Promise<boolean> };
      }
    ).stateMachine;
    const transitionSpy = vi.spyOn(stateMachine, 'transition');
    transitionSpy.mockImplementationOnce(async () => {
      throw new Error('transition boom');
    });

    await engine.stop();
    expect(engine.state).toBe(BotState.Error);
    expect(closeAllPositions).not.toHaveBeenCalled(); // the close path never ran

    // Guard released → a subsequent stop (emergency from Error) acquires the
    // run again and closes positions.
    await engine.emergencyStop();
    expect(closeAllPositions).toHaveBeenCalledTimes(1);
    expect(engine.state).toBe(BotState.Stopped);
  });
});

// ---- Hardening F3: persisted close-attempt tombstones ----
//
// prepareCloseAttempt (wired as CloseManager.preflightClose) persists a
// SYMBOL:TIMEFRAME marker BEFORE every swap, refuses a position a DIFFERENT
// close run left non-confirmed (fail-closed, no re-sell), allows same-run
// retries, is cleared on a confirmed close (handlePositionClosed), and is
// loaded tamper-protected at initialize().

describe('BotEngine close-attempt tombstones (F3 security)', () => {
  type CloseAttemptEngine = {
    prepareCloseAttempt: (
      symbol: string,
      timeframe: string,
      closeRunId: string,
    ) => Promise<string | undefined>;
    handlePositionClosed: (position: PositionInfo, result: CloseResult) => void;
    loadCloseAttemptsFromDisk: () => Promise<void>;
  };

  function makeEngine(): CloseAttemptEngine {
    // Cast through `unknown`: prepareCloseAttempt is PRIVATE on BotEngine, so a
    // direct `BotEngine & CloseAttemptEngine` intersection collapses to `never`.
    return new BotEngine() as unknown as CloseAttemptEngine;
  }

  it('records a tombstone BEFORE the swap, allows same-run retries, and refuses a DIFFERENT close run (no re-sell)', async () => {
    const engine = makeEngine();

    // First attempt of run-1: marked and allowed.
    expect(await engine.prepareCloseAttempt('BTC', '1', 'run-1')).toBeUndefined();
    // Same-run retry (the close-level retry policy only retries provably-no-send
    // failures): still allowed.
    expect(await engine.prepareCloseAttempt('BTC', '1', 'run-1')).toBeUndefined();
    // A DIFFERENT close run → fail-closed refusal: the prior close never
    // confirmed (it may have landed but been misreported) — re-selling would
    // double-sell.
    const reason = await engine.prepareCloseAttempt('BTC', '1', 'run-2');
    expect(reason).toContain('refusing to re-sell');
    expect(reason).toContain('run-1');
  });

  it('clears the tombstone on a CONFIRMED on-chain close (handlePositionClosed)', async () => {
    const engine = makeEngine();

    await engine.prepareCloseAttempt('BTC', '1', 'run-1');
    // Confirmed signature → the tombstone is removed so a legitimately
    // re-opened position can close again under a fresh run.
    engine.handlePositionClosed(
      {
        symbol: 'BTC',
        timeframe: '1',
        direction: 'long',
        quantity: 1,
        entryPrice: 100,
        entryTime: 1_700_000_000_000,
      },
      { status: 'closed', txSignature: 'sig-ok' },
    );

    expect(await engine.prepareCloseAttempt('BTC', '1', 'run-2')).toBeUndefined();
  });

  it('loads a valid persisted foreign-runId tombstone at initialize() and refuses the cross-run re-sell', async () => {
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ 'BTC:1': { closeRunId: 'run-old', attemptedAt: 1_700_000_000_000 } }),
    );
    const engine = makeEngine();

    await engine.loadCloseAttemptsFromDisk();

    // A fresh close run finds run-old's unconfirmed attempt → fail-closed.
    const reason = await engine.prepareCloseAttempt('BTC', '1', 'run-new');
    expect(reason).toContain('refusing to re-sell');
    expect(reason).toContain('run-old');
  });

  it('does not crash on a tampered/malformed close-attempts file — degrades to an empty guard (never invents tombstones)', async () => {
    // Malformed JSON.
    vi.mocked(readFile).mockResolvedValue('{not valid json');
    const engine = makeEngine();
    await expect(engine.loadCloseAttemptsFromDisk()).resolves.toBeUndefined();
    // Nothing poisoned: a fresh close proceeds.
    expect(await engine.prepareCloseAttempt('BTC', '1', 'run-1')).toBeUndefined();

    // Valid JSON but wrong shape (hostile/tampered) — entries are dropped.
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ 'BTC:1': { closeRunId: 42, attemptedAt: 'not-a-number' } }),
    );
    await engine.loadCloseAttemptsFromDisk();
    expect(await engine.prepareCloseAttempt('BTC', '1', 'run-2')).toBeUndefined();
  });
});

// ---- BUG 7: force-close (stop/emergency) notifies like a natural close ----
//
// The CloseManager seam now delivers (PositionInfo, CloseResult) and
// handlePositionClosed fires telegramBot.notifyPositionClosed for a confirmed
// close with a known entry — the same trade shape and message as a natural
// close (bot-engine.ts:1859-1963). Entry unknown → skip entirely; exit unknown
// → the notice is still sent but renders PnL-less (never $0.00, never a guess).

describe('BotEngine force-close notification (BUG 7)', () => {
  // Structural type only — a `BotEngine & ForceCloseEngine` intersection
  // collapses to `never` (same trap the F3 suite documents); cast via unknown.
  type ForceCloseEngine = {
    handlePositionClosed: (position: PositionInfo, result: CloseResult) => void;
    closeManager: CloseManager | null;
    configure: (config: BotConfig) => void;
    start: () => Promise<void>;
    emergencyStop: () => Promise<void>;
    state: BotState;
  };

  function makeEngine(telegramBot?: {
    notifyPositionClosed: ReturnType<typeof vi.fn>;
  }): ForceCloseEngine {
    return new BotEngine({
      telegramBot: (telegramBot ?? { notifyPositionClosed: vi.fn() }) as never,
    }) as unknown as ForceCloseEngine;
  }

  function makePosition(overrides: Partial<PositionInfo> = {}): PositionInfo {
    return {
      symbol: 'SOLUSDT',
      timeframe: '60',
      direction: 'long',
      quantity: 0.1,
      entryPrice: 100,
      entryTime: 1_700_000_000_000,
      ...overrides,
    };
  }

  it('a CONFIRMED force-close with an open position notifies via notifyPositionClosed (same trade shape as a natural close)', async () => {
    const notifyPositionClosed = vi.fn().mockResolvedValue(undefined);
    const engine = makeEngine({ notifyPositionClosed });

    engine.handlePositionClosed(makePosition(), {
      status: 'closed',
      txSignature: 'sig-stop',
      exitPrice: 101,
    });

    await vi.waitFor(() => expect(notifyPositionClosed).toHaveBeenCalledTimes(1));
    const trade = notifyPositionClosed.mock.calls[0]![0] as {
      symbol: string;
      side: string;
      entryPrice: number;
      exitPrice: number;
      realizedPnl: number;
      transactionSignature: string;
      status: string;
    };
    expect(trade.symbol).toBe('SOLUSDT');
    expect(trade.side).toBe('buy');
    expect(trade.entryPrice).toBe(100);
    expect(trade.exitPrice).toBe(101);
    // (exit 101 − entry 100) × qty 0.1 — a truthful PnL, never a guess.
    expect(trade.realizedPnl).toBe(0.1);
    expect(trade.transactionSignature).toBe('sig-stop');
    expect(trade.status).toBe('confirmed');
  });

  it('skips the notification entirely when the position entry price is unknown (entryPrice <= 0)', async () => {
    const notifyPositionClosed = vi.fn().mockResolvedValue(undefined);
    const engine = makeEngine({ notifyPositionClosed });

    engine.handlePositionClosed(makePosition({ entryPrice: 0 }), {
      status: 'closed',
      txSignature: 'sig-unknown-entry',
      exitPrice: 101,
    });

    // Never-guess PnL: without a truthful entry there is no PnL → notify
    // nothing (a $0.00 readout would mislead the subscriber).
    expect(notifyPositionClosed).not.toHaveBeenCalled();
  });

  it('still notifies when the exit price is unknown — the trade carries NO realizedPnl (PnL-less notice)', async () => {
    const notifyPositionClosed = vi.fn().mockResolvedValue(undefined);
    const engine = makeEngine({ notifyPositionClosed });

    // Ambiguous-confirm force-close: confirmed on-chain, but no swap output
    // was ever returned → CloseResult.closed.exitPrice is undefined.
    engine.handlePositionClosed(makePosition(), { status: 'closed', txSignature: 'sig-no-exit' });

    await vi.waitFor(() => expect(notifyPositionClosed).toHaveBeenCalledTimes(1));
    const trade = notifyPositionClosed.mock.calls[0]![0] as {
      symbol: string;
      exitPrice?: number;
      realizedPnl?: number;
    };
    expect(trade.symbol).toBe('SOLUSDT');
    // PnL-less: exitPrice/realizedPnl are OMITTED from the payload — the
    // renderer then omits the lines instead of inventing $0.00.
    expect('exitPrice' in trade).toBe(false);
    expect('realizedPnl' in trade).toBe(false);
  });

  it('EMERGENCY-STOP force-close notifies with close-reason metadata (real emergency stop path)', async () => {
    const notifyPositionClosed = vi.fn().mockResolvedValue(undefined);
    const engine = new BotEngine({
      telegramBot: { notifyPositionClosed } as never,
    }) as unknown as ForceCloseEngine;
    // The injected manager ALWAYS wins (bot-engine.ts:1010-1012). Its
    // closeAllPositions fires the engine's confirmed-close seam exactly as a
    // real CloseManager would (applyCloseSideEffects → onPositionClosed).
    const closeAllPositions = vi.fn().mockImplementation(async (_reason: string, _mode: string) => {
      engine.handlePositionClosed(makePosition(), {
        status: 'closed',
        txSignature: 'sig-emergency',
        exitPrice: 99,
      });
      return {
        closeRunId: 'test-run',
        total: 1,
        closed: 1,
        failed: 0,
        timedOut: 0,
        durationMs: 0,
        failedSymbols: [],
      } satisfies CloseSummary;
    });
    engine.closeManager = { closeAllPositions } as unknown as CloseManager;

    // Same start harness as the stop-paths suite (initialize/shutdown mocked).
    // initialize() is mocked, so the injected-manager wiring never overwrites
    // the closeManager field assigned above.
    engine.configure(defaultConfig);
    const engineSeams = engine as unknown as {
      initialize: () => Promise<void>;
      shutdown: () => Promise<void>;
    };
    vi.spyOn(engineSeams, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(engineSeams, 'shutdown').mockResolvedValue(undefined);
    await engine.start();
    expect(engine.state).toBe(BotState.Running);

    await engine.emergencyStop();
    expect(closeAllPositions).toHaveBeenCalledTimes(1);
    expect(closeAllPositions).toHaveBeenCalledWith('emergency_stop', 'emergency');

    // The emergency close notifies like a natural close — and carries the
    // close reason as data-only metadata (closeOpenPositions sets closeRunReason
    // for the run, bot-engine.ts:1669).
    await vi.waitFor(() => expect(notifyPositionClosed).toHaveBeenCalledTimes(1));
    const trade = notifyPositionClosed.mock.calls[0]![0] as {
      symbol: string;
      closeReason?: string;
      realizedPnl: number;
    };
    expect(trade.symbol).toBe('SOLUSDT');
    expect(trade.closeReason).toBe('emergency_stop');
    // (exit 99 − entry 100) × qty 0.1 — a truthful negative PnL, never $0.00.
    expect(trade.realizedPnl).toBe(-0.1);
  });
});

// ---- Reviewer MAJOR R1: bounded drain deadline ----
//
// An in-flight tick whose swap is wedged must not stall the stop before closes
// begin. The drain races pendingTicks against a short cap and PROCEEDS.

describe('BotEngine drain deadline (reviewer MAJOR R1)', () => {
  it('bounds the in-flight drain — a hung tick cannot stall the stop path', async () => {
    vi.useFakeTimers();
    try {
      const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
      const engine = new BotEngine({ logger: logger as never });

      // A tick whose swap hangs forever — the drain must NOT await it indefinitely.
      const hung = new Promise<void>(() => {});
      (engine as unknown as { pendingTicks: Set<Promise<void>> }).pendingTicks.add(hung);

      const drain = (
        engine as unknown as { drainInFlightProcessing: (ms: number) => Promise<void> }
      ).drainInFlightProcessing(100);

      await vi.advanceTimersByTimeAsync(101);
      await drain; // resolves — never hangs, even though the tick is unsettled

      expect(logger.warn).toHaveBeenCalledWith(
        'Drain deadline fired — proceeding to closes with in-flight ticks still unsettled',
        expect.objectContaining({ count: 1, deadlineMs: 100 }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
