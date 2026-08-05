/**
 * BotEngine — the central controller for live trading.
 *
 * Owns the state machine, configuration, and lifecycle methods.
 * Delegates to specialized components for scheduling, DEX, wallet, and risk.
 *
 * @module trading
 */

import { BotState, ErrorSeverity } from './types.js';
import type {
  BotConfig,
  BotError,
  StateTransition,
  BotStatusSnapshot,
  PositionSummary,
  PairConfig,
  ChaosHeartbeat,
} from './types.js';
import type { CandleErrorInfo } from './types.js';
import { StateMachine, createBotStateMachine } from './state-machine.js';
import type { StateChangeHandler } from './state-machine.js';
import type { RiskManager } from './risk/risk-manager.js';
import type { TradingTelegramBot } from './telegram-bot.js';
import { BybitWebSocketService } from './bybit-websocket.js';
import { LiveStrategyExecutor } from './live-strategy-executor.js';
import { JupiterSwapAdapter } from './dex/jupiter-swap-adapter.js';
import { LiveScheduler } from './live-scheduler.js';
import { ClosedCandle, PairId } from './scheduler.js';
import { ChaosSignalGenerator } from './chaos-signal-generator.js';
import type { ExecutionResult, PositionInfo } from './live-strategy-executor.js';
import type { TradeSignal as SchedulerTradeSignal } from './scheduler.js';
import type { StrategyMarker } from '../strategy/strategy-engine.js';
import type { WalletManager } from './wallet/wallet-manager.js';
import { extractScriptName } from '../utils/script-name.js';
import { writeFile } from 'node:fs/promises';
import type { PineLogger } from '../utils/logger/types.js';

/** Logger interface for bot engine events. */
export interface BotLogger {
  info(event: string, meta?: Record<string, unknown>): void;
  warn(event: string, meta?: Record<string, unknown>): void;
  error(event: string, meta?: Record<string, unknown>): void;
  debug(event: string, meta?: Record<string, unknown>): void;
}

/** Max number of chaos signal records retained for WS replay. */
const CHAOS_HISTORY_LIMIT = 200;

/** Bar-feed silence threshold (D1): a Running bot with no confirmed candle for
 *  this long is flagged "feed silent" instead of appearing healthy. */
const FEED_SILENCE_THRESHOLD_MS = 90_000;

/** Run-state file for the latest feed telemetry (D1), written beside the
 *  executor's strategy-state.json (both default to the process cwd) so a
 *  silent run is diagnosable offline. */
const FEED_STATE_FILE = 'feed-state.json';

/** Minimum interval between feed-state.json writes for candle-count-only
 *  updates (task 1.3): connection/subscription/error changes persist
 *  immediately, but a candle tick must not write to disk every candle. */
const FEED_STATE_PERSIST_THROTTLE_MS = 60_000;

/** Default live starting capital (1,000 USDC in lamports) when the config
 *  does not specify one. */
const DEFAULT_INITIAL_CAPITAL_LAMPORTS = 1_000_000_000;

/** Default logger that writes to console. */
const consoleLogger: PineLogger = {
  info: (event, meta) => console.log(`[BOT] ${event}`, meta ?? ''),
  warn: (event, meta) => console.warn(`[BOT] ⚠ ${event}`, meta ?? ''),
  error: (event, meta) => console.error(`[BOT] ✗ ${event}`, meta ?? ''),
  debug: (event, meta) => console.debug(`[BOT] ${event}`, meta ?? ''),
};

/** Events emitted by BotEngine. */
export interface BotEventMap {
  stateChange: (event: {
    previous: BotState;
    current: BotState;
    reason: string;
    timestamp: number;
  }) => void;
  error: (error: BotError) => void;
  configUpdate: (config: BotConfig) => void;
  /** Emitted when auto-selection completes. */
  autoSelectionComplete: (result: {
    best: PairConfig;
    ranking: Array<{ pair: PairConfig; label: string }>;
  }) => void;
  /** Emitted for each executed chaos signal, with the real strategy marker
   *  and its DEX execution result. */
  chaosSignal: (record: ChaosSignalRecord) => void;
  /** Emitted per processed chaos candle with its observable outcome (signal /
   *  explicit no-op reason / error) — the chaos heartbeat (D3). */
  chaosHeartbeat: (heartbeat: ChaosHeartbeat) => void;
  /** Emitted when a candle fails to process — surfaced by the scheduler's
   *  per-candle catch instead of silently swallowed (D3). */
  candleError: (info: CandleErrorInfo) => void;
  /** Bar-feed telemetry (D1): connection state, per-pair subscription results,
   *  and candle progress — broadcast so a dead/silent feed is visible. */
  feedStatus: (status: FeedStatus) => void;
  /** Per-position open/close (D3), emitted at order-result points. */
  position: (event: PositionEvent) => void;
}

/** A chaos signal record broadcast to the dashboard — the genuine strategy
 *  engine marker plus its DEX execution result. */
export interface ChaosSignalRecord {
  marker: StrategyMarker;
  symbol: string;
  timeframe: string;
  success: boolean;
  txSignature?: string;
  error?: string;
  timestamp: number;
}

/** Per-pair bar-feed subscription result (D1). */
export interface FeedSubscriptionResult {
  /** Pair symbol (e.g. "ETHUSDT"). */
  pair: string;
  /** Pair timeframe (e.g. "1"). */
  timeframe: string;
  /** True while the subscription is live (sent on an open socket). */
  ok: boolean;
  /** Last feed error affecting this subscription, when any. */
  error?: string;
}

/** Live bar-feed telemetry broadcast on `bot:feedStatus` (D1) — makes a dead
 *  or silent Bybit feed visible instead of an apparently-healthy idle bot. */
export interface FeedStatus {
  /** Whether the Bybit WebSocket socket is connected. */
  connected: boolean;
  /** Per-pair subscription results for the configured pairs. */
  subscriptions: FeedSubscriptionResult[];
  /** Timestamp (ms) of the last confirmed candle received, or null. */
  lastCandleAt: number | null;
  /** Confirmed candles received since this run started. */
  candleCount: number;
  /** When the feed crossed the silence threshold (ms) — present only while
   *  Running with no confirmed candle for FEED_SILENCE_THRESHOLD_MS. */
  silentSince?: number;
}

/** Per-position open/close event broadcast on `bot:position` (D3), emitted at
 *  order-result points without altering execution. */
export interface PositionEvent {
  /** Pair key ("SYMBOL:TIMEFRAME"). */
  pair: string;
  /** Pair symbol (e.g. "ETHUSDT"). */
  symbol: string;
  /** Pair timeframe (e.g. "1"). */
  timeframe: string;
  /** Resulting direction: 'long' after a filled buy, 'flat' after a filled
   *  sell/close. */
  direction: 'long' | 'flat';
  /** Position size in base-token units (0 when flat). */
  quantity: number;
  /** Entry price (0 when flat). */
  entryPrice: number;
  /** Candle timestamp (ms) the position opened (0 when flat). */
  entryTime: number;
  /** Unrealized P&L in USDC when a live mark price is known — not tracked by
   *  the engine, so left undefined (D3). */
  unrealizedPnl?: number;
}

export interface BotEngineOptions {
  logger?: PineLogger;
  /**
   * Optional callback invoked when auto-selection is enabled.
   * Receives the current config and returns a list of selected pairs.
   * If not provided, auto-selection will throw an error when enabled.
   */
  onAutoSelect?: (config: BotConfig) => Promise<PairConfig[]>;
  /**
   * Optional risk manager for tracking losses and triggering safety stops.
   */
  riskManager?: RiskManager;
  /**
   * Optional Telegram bot for sending alerts.
   */
  telegramBot?: TradingTelegramBot;
  /**
   * Wallet manager for signing real DEX transactions. When omitted, order
   * execution is disabled (the strategy still evaluates but no orders submit).
   */
  walletManager?: WalletManager;
  /**
   * Optional persistence hook invoked whenever the engine's config changes at
   * runtime (e.g. toggleChaosMode), so the change survives a restart (D4).
   * Dependency-inverted: the engine never knows the concrete config store.
   */
  onConfigPersist?: (config: BotConfig) => void;
}

/**
 * Central controller for the live trading bot.
 * Manages lifecycle, configuration, error handling, and state.
 */
export class BotEngine {
  private readonly stateMachine: StateMachine<BotState>;
  private readonly logger: PineLogger;
  private readonly riskManager?: RiskManager;
  private readonly telegramBot?: TradingTelegramBot;
  private readonly walletManager?: WalletManager;
  private readonly onAutoSelect?: (config: BotConfig) => Promise<PairConfig[]>;
  private readonly onConfigPersist?: (config: BotConfig) => void;
  private _config: BotConfig | null = null;
  private _errors: BotError[] = [];
  private _startedAt: number | null = null;
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  /** Current positions (in-memory; will be managed by scheduler in Phase 2). */
  private _positions: PositionSummary[] = [];

  /** Chaos mode execution stats. */
  private chaosStats = {
    signalsGenerated: 0,
    ordersExecuted: 0,
    ordersFailed: 0,
    totalExecutionTimeMs: 0,
  };

  /** Recent chaos signal records for replay on WS connect (cap 200). */
  private chaosHistory: ChaosSignalRecord[] = [];

  /** Outcome of the most recently processed chaos candle (D3), for snapshot. */
  private lastChaosHeartbeat: ChaosHeartbeat | null = null;

  /** Live bar-feed telemetry (D1) — updated by the feed lifecycle callbacks
   *  and the candle path, broadcast on `bot:feedStatus` and persisted to
   *  feed-state.json. */
  private feedState: FeedStatus = {
    connected: false,
    subscriptions: [],
    lastCandleAt: null,
    candleCount: 0,
  };

  /** Timestamp (ms) when the bar-feed socket last connected — the silence
   *  reference for a connected feed that has never delivered a confirmed
   *  candle (QA S3). buildFeedStatus cannot key off lastCandleAt (null on a
   *  zero-candle feed would never flip silent), so a connected-but-silent feed
   *  is measured from this instead. Null until the first connection. */
  private feedStartedAt: number | null = null;

  /** Timestamp of the last feed-state.json write, for the candle-count
   *  persistence throttle (task 1.3). */
  private lastFeedStatePersistAt = 0;

  /** Live trading components (initialized in initialize()). */
  private barFeed: BybitWebSocketService | null = null;
  private strategyExecutor: LiveStrategyExecutor | null = null;
  private scheduler: LiveScheduler | null = null;
  private dex: JupiterSwapAdapter | null = null;

  /** AbortController for cancelling in-flight candle processing on stop. */
  private _abortController: AbortController | null = null;

  constructor(options?: BotEngineOptions) {
    this.logger = options?.logger ?? consoleLogger;
    this.riskManager = options?.riskManager;
    this.telegramBot = options?.telegramBot;
    this.walletManager = options?.walletManager;
    this.onAutoSelect = options?.onAutoSelect;

    const onChange: StateChangeHandler<BotState> = (from, to, reason) => {
      this.logStateTransition(from, to, reason);
      this.emit('stateChange', { previous: from, current: to, reason, timestamp: Date.now() });
    };

    this.stateMachine = createBotStateMachine(onChange);

    // Wire risk manager events if available
    if (this.riskManager) {
      this.riskManager.onEvent((event) => {
        if (event.type === 'rolling_loss_breached') {
          this.handleRollingLossBreached(event);
        } else if (event.type === 'daily_loss_breached') {
          this.handleDailyLossBreached(event);
        } else if (event.type === 'wallet_balance_breached') {
          this.handleWalletBalanceBreached(event);
        }
      });
    }
  }

  // ---- Public accessors ----

  /** Current bot state. */
  get state(): BotState {
    return this.stateMachine.state;
  }

  /** Current bot configuration, or null if not configured. */
  get config(): BotConfig | null {
    return this._config;
  }

  /** Bot start timestamp, or null if not started. */
  get startedAt(): number | null {
    return this._startedAt;
  }

  /** Uptime in milliseconds, or 0 if not running. */
  get uptimeMs(): number {
    if (!this._startedAt || this.state === BotState.Idle) return 0;
    return Date.now() - this._startedAt;
  }

  /** Current errors. */
  get errors(): readonly BotError[] {
    return this._errors;
  }

  /** Last state transition. */
  get lastTransition(): StateTransition | null {
    return this.stateMachine.lastTransition;
  }

  /** Current open positions. */
  get positions(): readonly PositionSummary[] {
    return this._positions;
  }

  // ---- Lifecycle methods ----

  /**
   * Configure the bot with a strategy and settings.
   * Must be called before start(). Can only be called in Idle or Stopped state.
   */
  configure(config: BotConfig): void {
    if (this.state !== BotState.Idle && this.state !== BotState.Stopped) {
      throw new Error(`Cannot configure bot in state: ${this.state}. Must be Idle or Stopped.`);
    }
    this._config = config;
    this.logger.info('Bot configured', {
      dex: config.dex,
      pairs: config.pairs?.length ?? 0,
      risk: config.risk,
    });
    this.emit('configUpdate', config);
  }

  /**
   * Start the bot.
   * Transitions: Idle → Starting → Running (or → Error on failure)
   * If autoSelect is enabled, runs market selection before starting.
   */
  async start(): Promise<void> {
    if (this.state !== BotState.Idle && this.state !== BotState.Stopped) {
      throw new Error(`Cannot start bot from state: ${this.state}. Must be Idle or Stopped.`);
    }
    if (!this._config) {
      throw new Error('Cannot start bot without configuration. Call configure() first.');
    }

    const isChaosMode = this._config.chaosMode?.enabled === true;

    // Auto-select is a trigger (pick pairs if needed), not a gate.
    // Allow start when pairs exist from any source (auto-select, manual, API).
    if (this._config.autoSelect && !this._config.pairs?.length) {
      if (this.onAutoSelect) {
        // Resolve pairs via the callback before proceeding with the state
        // transition. If the callback yields no pairs, fall through to the
        // same documented error as a missing callback.
        const selected = await this.onAutoSelect(this._config);
        if (selected?.length) {
          this._config.pairs = selected;
        } else {
          throw new Error('auto-selection returned no pairs');
        }
      } else {
        throw new Error('auto-selection returned no pairs');
      }
    }
    if (!this._config.pairs?.length) {
      throw new Error('No trading pairs configured. Set pairs or enable auto-select.');
    }
    // Require strategy source only when chaos mode is not active
    if (!isChaosMode && !this._config.strategySource) {
      throw new Error('Strategy source is required when chaos mode is disabled.');
    }

    await this.stateMachine.transition(BotState.Starting, 'User requested start');

    try {
      // Phase 2 will add actual initialization here:
      //   - Compile strategy
      //   - Connect DEX
      //   - Load wallet
      //   - Initialize scheduler
      await this.initialize();

      this._startedAt = Date.now();
      await this.stateMachine.transition(BotState.Running, 'Initialization complete');
      this.logger.info('Bot started', { config: this._config });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.recordError('START_FAILED', message, ErrorSeverity.Fatal);
      await this.stateMachine.transition(BotState.Error, `Start failed: ${message}`);
      throw err;
    }
  }

  /**
   * Stop the bot gracefully.
   * Transitions: Running → Stopping → Stopped (or → Error)
   */
  async stop(): Promise<void> {
    if (this.state !== BotState.Running) {
      throw new Error(`Cannot stop bot from state: ${this.state}. Must be Running.`);
    }

    // Cancel in-flight candle processing immediately
    this._abortController?.abort();

    await this.stateMachine.transition(BotState.Stopping, 'User requested stop');

    try {
      // Phase 2: finish bar processing, close positions, persist state
      await this.shutdown();
      await this.stateMachine.transition(BotState.Stopped, 'Shutdown complete');
      this.logger.info('Bot stopped');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.recordError('STOP_FAILED', message, ErrorSeverity.Error);
      await this.stateMachine.transition(BotState.Error, `Stop failed: ${message}`);
    }
  }

  /**
   * Emergency stop — immediately close positions and halt.
   * Available from Running or Error states.
   */
  async emergencyStop(): Promise<void> {
    if (this.state !== BotState.Running && this.state !== BotState.Error) {
      throw new Error(`Emergency stop not available from state: ${this.state}`);
    }

    this.logger.warn('Emergency stop triggered');

    // Cancel in-flight candle processing immediately
    this._abortController?.abort();

    // Force to Stopping if currently Running
    if (this.state === BotState.Running) {
      await this.stateMachine.transition(BotState.Stopping, 'Emergency stop');
    }

    try {
      this.logger.info('Emergency stop: cancelling pending orders, closing positions');
      // Phase 2: cancel orders, close positions, persist state
      await this.shutdown();
      await this.stateMachine.transition(BotState.Stopped, 'Emergency stop complete');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.recordError('EMERGENCY_STOP_FAILED', message, ErrorSeverity.Fatal);
      await this.stateMachine.transition(BotState.Error, `Emergency stop failed: ${message}`);
    }
  }

  /**
   * Handle rolling 24h loss breach — trigger emergency stop and send alerts.
   *
   * Safety ordering (R1): the stop runs FIRST — a slow/throwing Telegram
   * notification (retry can wait up to 10s) must never gate or delay the
   * halt. Notification failures are logged, never thrown, and the handler
   * never produces an unhandled rejection (it is invoked fire-and-forget by
   * the risk-event listener).
   */
  private async handleRollingLossBreached(event: {
    timestamp: number;
    message: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    this.logger.error('ROLLING 24H LOSS LIMIT BREACHED', event.data);

    // Trigger emergency stop if bot is running (keep existing behavior).
    if (this.state === BotState.Running) {
      try {
        await this.emergencyStop();
      } catch (err) {
        // A concurrent stop (e.g. daily-loss handler on the same trade) may
        // already have moved the state machine — the bot is stopping anyway.
        this.logger.warn('Emergency stop already in progress after rolling loss breach', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Send Telegram alert after the stop; never throws, never rejects.
    if (this.telegramBot) {
      try {
        const loss = (event.data?.loss as number) ?? 0;
        const maxLoss = (event.data?.maxLoss as number) ?? 0;

        await this.telegramBot.notifyDailyLossTriggered(loss, maxLoss);
        await this.telegramBot.notifyEmergencyStop('rolling_24h_loss');
      } catch (err) {
        this.logger.warn('Telegram notification failed after rolling loss breach', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * Handle daily (calendar-day) PnL loss breach — trigger emergency stop and
   * send alerts, mirroring the rolling 24h handling (R1 stop-first ordering).
   */
  private async handleDailyLossBreached(event: {
    timestamp: number;
    message: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    this.logger.error('DAILY LOSS LIMIT BREACHED', event.data);

    // Trigger emergency stop if bot is running (keep existing behavior).
    if (this.state === BotState.Running) {
      try {
        await this.emergencyStop();
      } catch (err) {
        this.logger.warn('Emergency stop already in progress after daily loss breach', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Send Telegram alert after the stop; never throws, never rejects.
    if (this.telegramBot) {
      try {
        const loss = (event.data?.loss as number) ?? 0;
        const maxLoss = (event.data?.maxLoss as number) ?? 0;

        await this.telegramBot.notifyDailyLossTriggered(loss, maxLoss);
        await this.telegramBot.notifyEmergencyStop('daily_loss');
      } catch (err) {
        this.logger.warn('Telegram notification failed after daily loss breach', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * Handle wallet-balance loss breach — trigger emergency stop and send
   * alerts, mirroring the rolling 24h handling (R1 stop-first ordering).
   */
  private async handleWalletBalanceBreached(event: {
    timestamp: number;
    message: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    this.logger.error('WALLET BALANCE LOSS LIMIT BREACHED', event.data);

    // Trigger emergency stop if bot is running (keep existing behavior).
    if (this.state === BotState.Running) {
      try {
        await this.emergencyStop();
      } catch (err) {
        this.logger.warn('Emergency stop already in progress after wallet balance breach', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Send Telegram alert after the stop; never throws, never rejects.
    if (this.telegramBot) {
      try {
        // Distinct source label for the balance guard.
        await this.telegramBot.notifyEmergencyStop('wallet_balance');
      } catch (err) {
        this.logger.warn('Telegram notification failed after wallet balance breach', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * Reset the bot to Idle state (from Stopped or Error).
   */
  async reset(): Promise<void> {
    if (this.state !== BotState.Stopped && this.state !== BotState.Error) {
      throw new Error(`Cannot reset bot from state: ${this.state}. Must be Stopped or Error.`);
    }
    this._startedAt = null;
    this._positions = [];
    // Keep errors for audit but allow reconfiguring
    await this.stateMachine.transition(BotState.Idle, 'Bot reset');
    this.logger.info('Bot reset to Idle');
  }

  // ---- Error handling ----

  /** Record a bot error. */
  recordError(code: string, message: string, severity: ErrorSeverity = ErrorSeverity.Error): void {
    const err: BotError = { code, message, severity, timestamp: Date.now() };
    this._errors.push(err);
    this.logger.error(`[${code}] ${message}`, { severity });

    if (severity === ErrorSeverity.Fatal && this.state === BotState.Running) {
      // Attempt transition to Error state
      this.stateMachine.transitionSync(BotState.Error, `Fatal error: ${code}`);
    }

    this.emit('error', err);
  }

  // ---- Event system ----

  /** Subscribe to a bot event. */
  on<T extends keyof BotEventMap>(event: T, listener: BotEventMap[T]): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as (...args: unknown[]) => void);
    return () => {
      this.listeners.get(event)?.delete(listener as (...args: unknown[]) => void);
    };
  }

  /** Emit an event to all subscribers. */
  private emit<T extends keyof BotEventMap>(event: T, ...args: Parameters<BotEventMap[T]>): void {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        (listener as (...args: unknown[]) => void)(...args);
      } catch (err) {
        this.logger.error(`Error in event listener for ${event}`, { error: String(err) });
      }
    });
  }

  /** Recent chaos signal records (oldest first), for dashboard replay. */
  getChaosHistory(): ChaosSignalRecord[] {
    return [...this.chaosHistory];
  }

  /** Truthful open positions derived read-only from the executor's per-pair
   *  state (D3) — empty only when every pair is genuinely flat. No executor
   *  (Idle/Stopped) → no positions. Snapshot builders MUST use this accessor,
   *  not the legacy `getSnapshot().positions` stub. */
  getPositions(): PositionInfo[] {
    return this.strategyExecutor?.getPositions() ?? [];
  }

  /** The running pairs (symbol + timeframe) from the executor (D4) — engine
   *  truth for the dashboard, preferred over disk config `pairs[0]`. */
  getRunningPairs(): PairId[] {
    return this.strategyExecutor?.getRunningPairs() ?? [];
  }

  /** Latest bar-feed telemetry (D1), for snapshot builders / diagnostics. */
  getFeedStatus(): FeedStatus {
    return this.buildFeedStatus();
  }

  /** Record, retain, and emit a chaos signal with its execution outcome. */
  private emitChaosSignal(
    signal: SchedulerTradeSignal,
    outcome: { success: boolean; txSignature?: string; error?: string },
  ): void {
    if (!signal.marker) return;
    const record: ChaosSignalRecord = {
      marker: signal.marker,
      symbol: signal.pair.symbol,
      timeframe: signal.pair.timeframe,
      success: outcome.success,
      txSignature: outcome.txSignature,
      error: outcome.error,
      timestamp: signal.timestamp,
    };
    this.chaosHistory.push(record);
    if (this.chaosHistory.length > CHAOS_HISTORY_LIMIT) {
      this.chaosHistory.splice(0, this.chaosHistory.length - CHAOS_HISTORY_LIMIT);
    }
    this.emit('chaosSignal', record);
  }

  // ---- Snapshot ----

  /** Build a status snapshot for dashboard / WebSocket broadcast. */
  getSnapshot(): BotStatusSnapshot {
    const strategyName = this._config?.strategySource
      ? (extractScriptName(this._config.strategySource)?.substring(0, 50) ?? '(not configured)')
      : '(not configured)';
    // Chaos execution mode is engine truth (D1/D2): the executor reports
    // 'live' when real wallet funds back the engine and 'simulated' with the
    // failure reason when the equity floor is in use. Absent an executor the
    // mode defaults to 'live' — nothing is being executed either way.
    const chaosMode = this.strategyExecutor?.getChaosExecutionMode();
    return {
      state: this.state,
      strategyName,
      dex: this._config?.dex ?? 'jupiter-swap',
      walletPublicKey: this._config?.walletPublicKey ?? null,
      startedAt: this._startedAt,
      uptimeMs: this.uptimeMs,
      balance: 0, // Phase 2: read from wallet
      realizedPnl: 0, // Phase 2: compute from trade history
      unrealizedPnl: 0, // Phase 2: compute from positions
      positions: this._positions,
      exposure: 0, // Phase 2: compute
      errors: [...this._errors],
      lastTransition: this.lastTransition,
      chaosMode: {
        enabled: this._config?.chaosMode?.enabled === true,
        executionMode: chaosMode?.mode ?? 'live',
        ...(chaosMode?.reason ? { reason: chaosMode.reason } : {}),
      },
      totalCandleErrors: this.scheduler?.stats.totalCandleErrors ?? 0,
      chaosHeartbeat: this.lastChaosHeartbeat,
      warmUpComplete: this.strategyExecutor ? this.strategyExecutor.isWarmUpComplete() : false,
    };
  }

  // ---- Chaos hot-swap ----

  /**
   * Toggle chaos mode while the bot is Running (hot-swap) or while
   * Idle/Stopped (config-only update).
   *
   * When Running and enabling: creates a ChaosSignalGenerator and passes
   * it to the strategy executor, which reinitializes each pair's engine.
   * When Running and disabling: clears the chaos generator so the executor
   * resumes its normal strategy path.
   *
   * Persists the toggle through onConfigPersist (D4) so the mode survives a
   * restart — the engine config is the truth and disk follows it.
   *
   * WHY: The previous POST /bot/chaos-mode endpoint called configure(),
   * which throws when the engine is Running. This method bypasses the
   * state machine restriction.
   */
  async toggleChaosMode(enabled: boolean): Promise<void> {
    if (!this._config) {
      throw new Error('Cannot toggle chaos mode without configuration');
    }

    this._config.chaosMode = { enabled };

    if (this.state === BotState.Running && this.strategyExecutor) {
      if (enabled) {
        const generator = new ChaosSignalGenerator(this.logger);
        await this.strategyExecutor.setChaosGenerator(generator);
        this.logger.info('Chaos mode enabled (hot-swap)', { pairs: this._config.pairs?.length });
      } else {
        // Async: clearChaosGenerator rebuilds each pair's runtime through the
        // non-chaos path so disabling chaos resumes real strategy execution.
        await this.strategyExecutor.clearChaosGenerator();
        this.logger.info('Chaos mode disabled (hot-swap)');
      }
    }

    // D4: persist so the toggle survives a restart. Dependency-inverted — the
    // engine never knows the concrete config store.
    this.onConfigPersist?.(this._config);
    this.emit('configUpdate', this._config);
  }

  // ---- Internal lifecycle hooks (overridden by subclasses or extended in later phases) ----

  /**
   * Initialize the bot components.
   * Called during Starting → Running transition.
   * Wires up DEX, strategy executor, bar feed, and scheduler.
   */
  protected async initialize(): Promise<void> {
    if (!this._config) {
      throw new Error('No configuration loaded');
    }

    this.logger.info('Initializing bot components');

    // 0. Create AbortController for cancellation
    this._abortController = new AbortController();

    // 1. Create DEX adapter
    this.dex = new JupiterSwapAdapter();
    this.logger.info('DEX adapter created', { dex: this.dex.name });

    // 2. Create chaos signal generator if chaos mode is enabled
    const isChaosMode = this._config.chaosMode?.enabled === true;
    let chaosGenerator: ChaosSignalGenerator | undefined;
    if (isChaosMode) {
      chaosGenerator = new ChaosSignalGenerator(this.logger);
      this.logger.info('Chaos mode active — random signal generator enabled');
    }

    // 3. Create strategy executor
    this.strategyExecutor = new LiveStrategyExecutor({
      strategySource: this._config.strategySource ?? '',
      dex: this.dex,
      walletManager: this.walletManager ?? (null as unknown as WalletManager),
      pairs: (this._config.pairs ?? []).map((p) => ({ symbol: p.symbol, timeframe: p.timeframe })),
      initialCapital: BigInt(this._config.initialCapital ?? DEFAULT_INITIAL_CAPITAL_LAMPORTS),
      positionSizePercent: this._config.positionSizePercent ?? 100,
      maxDailyLoss: this._config.risk?.maxDailyLoss ?? 100,
      // D6: the executor feeds realized PnL + balance snapshots to the risk
      // manager when one is configured; absent risk config degrades gracefully.
      riskManager: this.riskManager,
      chaosGenerator,
      seedHistory: (pair) => this.fetchSeedHistory(pair),
      // D3: per-candle chaos outcomes (signal / explicit no-op / error) flow
      // to the engine emitter for WS broadcast — a running chaos mode is
      // never silently idle.
      chaosHeartbeat: (hb) => {
        this.lastChaosHeartbeat = hb;
        this.emit('chaosHeartbeat', hb);
      },
    });
    this.logger.info('Strategy executor created', { chaosMode: isChaosMode });

    // 3.5 Initialize a compiled strategy engine for every configured pair.
    //     Parse/compile failures throw here so start() fails with a descriptive
    //     error instead of silently running a strategy that cannot signal.
    for (const pair of this._config.pairs ?? []) {
      const pairId: PairId = { symbol: pair.symbol, timeframe: pair.timeframe };
      await this.strategyExecutor.initializeStrategy(pairId);
      this.logger.info('Strategy initialized', { symbol: pair.symbol, timeframe: pair.timeframe });
    }

    // 3. Create bar feed (Bybit WebSocket)
    this.barFeed = new BybitWebSocketService();

    // Feed telemetry (D1): fresh counters per run so lastCandleAt/candleCount
    // describe THIS run, not a previous one. The throttle timestamp also
    // resets so the first candle of a new run persists immediately instead of
    // being suppressed by a write from the previous run.
    this.feedState = { connected: false, subscriptions: [], lastCandleAt: null, candleCount: 0 };
    this.feedStartedAt = null;
    this.lastFeedStatePersistAt = 0;

    // 4. Wire candle callback: feed candles into scheduler
    this.barFeed.setCandleCallback((candle: ClosedCandle) => {
      this.handleCandle(candle);
    });

    this.barFeed.setErrorCallback((error: Error) => {
      this.logger.error('Bar feed error', { error: error.message });
      // A socket error means the feed is not delivering — mark every
      // subscription failed so the dashboard shows the failure (D1).
      for (const sub of this.feedState.subscriptions) {
        sub.ok = false;
        sub.error = error.message;
      }
      // Structural change (subscriptions flipped to failed) → persist now,
      // bypassing the candle-count throttle (task 1.3).
      this.notifyFeedStatus(true);
    });

    this.barFeed.setConnectionCallback((connected: boolean) => {
      this.logger.info(`Bar feed ${connected ? 'connected' : 'disconnected'}`);
      this.feedState.connected = connected;
      if (connected) {
        // On (re)connect the feed service re-sends every stored subscription
        // (resubscribeAll) — record the configured pairs as live (D1).
        this.feedStartedAt = Date.now();
        this.feedState.subscriptions = (this._config?.pairs ?? []).map((p) => ({
          pair: p.symbol,
          timeframe: p.timeframe,
          ok: true,
        }));
      }
      // Structural change (connection state flipped) → persist now, bypassing
      // the candle-count throttle (task 1.3).
      this.notifyFeedStatus(true);
    });

    // 5. Create scheduler
    this.scheduler = new LiveScheduler({
      pairs: this._config.pairs ?? [],
      processCandle: async (candle) => {
        if (!this.strategyExecutor) return [];
        const signals = await this.strategyExecutor.processCandle(candle);
        // Map LiveStrategyExecutor TradeSignal → Scheduler TradeSignal
        return signals.map((s) => ({
          pair: { symbol: s.symbol, timeframe: candle.timeframe },
          action: s.action,
          quantity: s.quantity,
          price: s.expectedPrice,
          timestamp: s.timestamp,
          marker: s.marker,
          // B1: keep the entry-price snapshot through the round-trip — it is
          // the only remaining link to the closed position (timeframe is
          // dropped here and the executor's state is already flattened).
          positionEntryPrice: s.positionEntryPrice,
          // Keep the chaos sizing fraction so on-chain buys stay at 10% even
          // when positionSizePercent is unset (default 100).
          sizeFraction: s.sizeFraction,
        }));
      },
      submitOrders: async (signals: SchedulerTradeSignal[]) => {
        if (!this.strategyExecutor) return;

        this.chaosStats.signalsGenerated += signals.length;
        const startTime = Date.now();

        for (const signal of signals) {
          try {
            // Map Scheduler.TradeSignal → LiveStrategyExecutor.TradeSignal
            const executorSignal = {
              action: signal.action,
              symbol: signal.pair.symbol,
              quantity: signal.quantity,
              expectedPrice: signal.price,
              timestamp: signal.timestamp,
              // B1: restore the entry-price snapshot so the executor can feed
              // realized PnL even though the position state is already flat.
              positionEntryPrice: signal.positionEntryPrice,
              // Restore the chaos sizing fraction (fixed 0.1) so executeSignal
              // sizes the buy at 10% instead of positionSizePercent (default
              // 100 when the config omits it) — QA blocker fix.
              sizeFraction: signal.sizeFraction,
            };

            const result: ExecutionResult =
              await this.strategyExecutor.executeSignal(executorSignal);

            if (result.success) {
              this.chaosStats.ordersExecuted++;
              const txSig =
                result.swapResult && 'signature' in result.swapResult
                  ? (result.swapResult as { signature: string }).signature
                  : 'unknown';
              this.logger.info('chaos.order.success', {
                action: signal.action,
                symbol: signal.pair.symbol,
                quantity: signal.quantity,
                price: signal.price,
                txSignature: txSig,
              });
              this.emitChaosSignal(signal, { success: true, txSignature: txSig });
              // D3: observe-and-emit the resulting position at the order-result
              // point — buy filled → long, sell/close filled → flat. Telemetry
              // only; execution state stays owned by the executor.
              this.emitPositionEvent(signal);
            } else {
              this.chaosStats.ordersFailed++;
              this.logger.warn('chaos.order.failed', {
                action: signal.action,
                symbol: signal.pair.symbol,
                quantity: signal.quantity,
                price: signal.price,
                error: result.error,
              });
              this.emitChaosSignal(signal, { success: false, error: result.error });
            }
          } catch (err) {
            this.chaosStats.ordersFailed++;
            this.logger.error('chaos.order.error', {
              action: signal.action,
              symbol: signal.pair.symbol,
              error: String(err),
            });
            this.emitChaosSignal(signal, { success: false, error: String(err) });
          }
        }

        this.chaosStats.totalExecutionTimeMs += Date.now() - startTime;
      },
      strategyExecutor: this.strategyExecutor,
      dex: this.dex,
      persistState: true,
      // D3: the scheduler's per-candle catch stays (a tick must not die) but
      // the failure is surfaced on the engine emitter for WS broadcast
      // instead of being silently swallowed.
      onCandleError: (info) => {
        this.emit('candleError', info);
      },
    });
    this.logger.info('Scheduler created', { pairs: this._config.pairs?.length ?? 0 });

    // 6. Connect bar feed
    await this.barFeed.connect();

    // 7. Subscribe to configured pairs
    if (this._config.pairs) {
      for (const pair of this._config.pairs) {
        const pairId: PairId = { symbol: pair.symbol, timeframe: pair.timeframe };
        this.barFeed.subscribe(pairId);
        // Track the subscription result (D1): live immediately when the socket
        // is already open; otherwise the connection callback marks it on open.
        this.upsertSubscription(pairId, this.feedState.connected);
        this.logger.info('Subscribed to pair', { symbol: pair.symbol, timeframe: pair.timeframe });
      }
    }

    // 8. Warm start: seed each pair's strategy engine with recent history so
    //    indicator state is populated before the first live candle. In chaos
    //    mode the engine is not driven by Pine source, so warm-up is a no-op.
    if (!isChaosMode && this.strategyExecutor) {
      for (const pair of this._config.pairs ?? []) {
        const pairId: PairId = { symbol: pair.symbol, timeframe: pair.timeframe };
        try {
          const history = await this.fetchSeedHistory(pairId);
          await this.strategyExecutor.warmUp(pairId, history);
          this.logger.info('Strategy engine warmed up', {
            symbol: pair.symbol,
            timeframe: pair.timeframe,
            bars: history.length,
          });
        } catch (err) {
          // A warm-up fetch failure should not block start; degrade to an
          // empty warm-up (engine starts fresh) and continue.
          this.logger.warn('Warm-up failed — starting engine unseeded', {
            symbol: pair.symbol,
            timeframe: pair.timeframe,
            error: err instanceof Error ? err.message : String(err),
          });
          await this.strategyExecutor.warmUp(pairId, []);
        }
      }
    }

    this.logger.info('Bot initialization complete');
  }

  /** Fetch historical candles for a pair from the bar feed (warm start seed). */
  private async fetchSeedHistory(pair: PairId): Promise<ClosedCandle[]> {
    if (!this.barFeed) {
      throw new Error('Bar feed not initialized');
    }
    return this.barFeed.fetchHistoricalCandles(pair);
  }

  // ---- Feed telemetry (D1) ----

  /** Upsert a per-pair subscription result without clobbering siblings. */
  private upsertSubscription(pair: PairId, ok: boolean): void {
    const existing = this.feedState.subscriptions.find(
      (sub) => sub.pair === pair.symbol && sub.timeframe === pair.timeframe,
    );
    if (existing) {
      existing.ok = ok;
      return;
    }
    this.feedState.subscriptions.push({ pair: pair.symbol, timeframe: pair.timeframe, ok });
  }

  /** Latest feed status with the silence marker computed lazily (D1): once a
   *  Running bot has gone FEED_SILENCE_THRESHOLD_MS without a confirmed
   *  candle, silentSince marks when the feed crossed the threshold. Returns a
   *  copy so consumers cannot mutate the engine's live telemetry. */
  private buildFeedStatus(): FeedStatus {
    const { connected, subscriptions, lastCandleAt, candleCount } = this.feedState;
    // Silence reference: the last confirmed candle when one exists, otherwise
    // the last feed connection time (QA S3). A connected feed that delivers
    // zero confirmed candles keeps lastCandleAt null — keying silence off it
    // alone would show "Connected" forever. Falling back to feedStartedAt makes
    // that zero-candle feed flip silent after FEED_SILENCE_THRESHOLD_MS.
    const referenceAt = connected ? (lastCandleAt ?? this.feedStartedAt ?? 0) : 0;
    let silentSince: number | undefined;
    if (
      connected &&
      this.state === BotState.Running &&
      referenceAt > 0 &&
      Date.now() - referenceAt >= FEED_SILENCE_THRESHOLD_MS
    ) {
      silentSince = referenceAt + FEED_SILENCE_THRESHOLD_MS;
    }
    return {
      connected,
      subscriptions: subscriptions.map((sub) => ({ ...sub })),
      lastCandleAt,
      candleCount,
      ...(silentSince !== undefined ? { silentSince } : {}),
    };
  }

  /** Broadcast the latest feed status on `bot:feedStatus` and persist it (D1).
   *  forcePersist bypasses the candle-count throttle — callers pass true on
   *  connection/subscription/error changes, false (default) on candle ticks. */
  private notifyFeedStatus(forcePersist = false): void {
    const status = this.buildFeedStatus();
    this.emit('feedStatus', status);
    this.persistFeedStateThrottled(status, forcePersist);
  }

  /** Persist the latest feed status to feed-state.json, throttling
   *  candle-count-only updates to at most one write per
   *  FEED_STATE_PERSIST_THROTTLE_MS (task 1.3). Structural changes
   *  (connection/subscription/error) always write immediately. */
  private persistFeedStateThrottled(status: FeedStatus, forcePersist: boolean): void {
    const now = Date.now();
    if (!forcePersist && now - this.lastFeedStatePersistAt < FEED_STATE_PERSIST_THROTTLE_MS) {
      return;
    }
    this.lastFeedStatePersistAt = now;
    this.persistFeedState(status);
  }

  /** Persist the latest feed status to feed-state.json (mirrors the
   *  executor's strategy-state.json pattern) so a silent run is diagnosable
   *  offline. Fire-and-forget: a write failure must never block the feed. */
  private persistFeedState(status: FeedStatus): void {
    void writeFile(FEED_STATE_FILE, JSON.stringify(status, null, 2)).catch((err) => {
      this.logger.warn('Failed to persist feed state', { error: String(err) });
    });
  }

  /** Emit a per-position open/close event (D3) from an order-result signal.
   *  Telemetry only — the executor owns execution state. */
  private emitPositionEvent(signal: SchedulerTradeSignal): void {
    const { symbol, timeframe } = signal.pair;
    const isOpen = signal.action === 'buy';
    this.emit('position', {
      pair: `${symbol}:${timeframe}`,
      symbol,
      timeframe,
      direction: isOpen ? 'long' : 'flat',
      quantity: isOpen ? signal.quantity : 0,
      entryPrice: isOpen ? signal.price : 0,
      entryTime: isOpen ? signal.timestamp : 0,
    });
  }

  /**
   * Handle an incoming candle from the bar feed.
   * Feeds the candle into the scheduler for processing.
   */
  private handleCandle(candle: ClosedCandle): void {
    // Feed telemetry (D1): every confirmed candle advances the count and the
    // last-candle timestamp, refreshing the silence marker. Recorded before
    // the state gate so a candle that arrives outside Running is still
    // diagnosable.
    this.feedState.lastCandleAt = candle.timestamp;
    this.feedState.candleCount++;
    this.notifyFeedStatus();

    if (!this.scheduler || this.state !== BotState.Running) return;

    // Process candle asynchronously (fire and forget — scheduler handles errors)
    this.scheduler
      .liveTick([candle], this._abortController?.signal)
      .then(() => this.captureBalanceSnapshot())
      .catch((err) => {
        this.logger.error('Error processing candle', { error: String(err) });
      });
  }

  /**
   * Feed one wallet-balance snapshot to the risk manager after a candle closes
   * (D6). The fetch runs inside the executor, which owns the DEX/wallet; any
   * failure is logged and skipped there and must never block candle
   * processing. No-op when no risk manager is configured.
   */
  private async captureBalanceSnapshot(): Promise<void> {
    try {
      await this.strategyExecutor?.captureBalanceSnapshot();
    } catch (err) {
      this.logger.warn('Balance snapshot capture failed', { error: String(err) });
    }
  }

  /**
   * Shutdown the bot components.
   * Called during Stopping → Stopped transition.
   * Disconnects bar feed, persists state, and cleans up.
   */
  protected async shutdown(): Promise<void> {
    this.logger.info('Shutting down bot components');

    // 1. Disconnect bar feed first (stop new candles)
    if (this.barFeed) {
      this.barFeed.disconnect();
      this.barFeed = null;
      this.logger.info('Bar feed disconnected');
    }

    // 2. Persist strategy state
    if (this.strategyExecutor) {
      try {
        await this.strategyExecutor.saveState();
        this.logger.info('Strategy state persisted');
      } catch (err) {
        this.logger.error('Failed to persist strategy state', { error: String(err) });
      }
    }

    // 2.5 Persist the final feed telemetry so the last run state is
    //     diagnosable offline (D1, task 1.3) — a stop is a connection/state
    //     change, not a candle tick, so it bypasses the throttle.
    this.persistFeedStateThrottled(this.buildFeedStatus(), true);

    // 3. Clear references
    this.scheduler = null;
    this.strategyExecutor = null;
    this.dex = null;
    this._abortController = null;

    this.logger.info('Bot shutdown complete');
  }

  // ---- Private ----

  private logStateTransition(from: BotState, to: BotState, reason: string): void {
    this.logger.info(`State: ${from} → ${to}`, { reason });
  }
}
