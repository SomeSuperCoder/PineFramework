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
import {
  BybitWebSocketService,
  BybitTick,
  timeframeToMinutes,
  LONG_TIMEFRAME_WARN_MINUTES,
  nextBoundaryAfter,
} from './bybit-websocket.js';
import { LiveStrategyExecutor } from './live-strategy-executor.js';
import { CloseManager } from './close-manager.js';
import type { CloseEvent, CloseMode } from './close-manager.js';
import { JupiterSwapAdapter } from './dex/jupiter-swap-adapter.js';
import { LiveScheduler } from './live-scheduler.js';
import { ClosedCandle, PairId } from './scheduler.js';
import { ChaosSignalGenerator } from './chaos-signal-generator.js';
import type { ExecutionResult, PositionInfo } from './live-strategy-executor.js';
import type { TradeSignal as SchedulerTradeSignal } from './scheduler.js';
import type { StrategyMarker } from '../strategy/strategy-engine.js';
import type { WalletManager } from './wallet/wallet-manager.js';
import { extractScriptName } from '../utils/script-name.js';
import { readFile, writeFile } from 'node:fs/promises';
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

/** Bar-feed silence threshold (D1): a Running bot with NO feed tick at all
 *  (any kline message — confirmed or not) for this long is flagged "feed
 *  silent" instead of appearing healthy. The silence reference prefers
 *  lastTickAt (any tick) over lastCandleAt (confirmed only), so a
 *  long-timeframe feed that IS delivering unconfirmed ticks must NOT look
 *  dead — only a truly mute socket (no ticks at all) flips silent. */
const FEED_SILENCE_THRESHOLD_MS = 90_000;

/** Run-state file for the latest feed telemetry (D1), written beside the
 *  executor's strategy-state.json (both default to the process cwd) so a
 *  silent run is diagnosable offline. */
const FEED_STATE_FILE = 'feed-state.json';

/** Minimum interval between feed-state.json writes for candle-count-only
 *  updates (task 1.3): connection/subscription/error changes persist
 *  immediately, but a candle tick must not write to disk every candle. */
const FEED_STATE_PERSIST_THROTTLE_MS = 60_000;

/** Minimum interval between bot:feedStatus WS broadcasts for tick-level
 *  updates (review #2): kline ticks arrive ~1/sec/pair, and fanning every one
 *  out to every dashboard client is chatty. Structural changes
 *  (connect/disconnect/subscription/error) always broadcast immediately via
 *  notifyFeedStatus(true); only tick-cadence broadcasts are throttled. Disk
 *  persistence keeps its own FEED_STATE_PERSIST_THROTTLE_MS gate — unchanged. */
const FEED_STATUS_BROADCAST_THROTTLE_MS = 1_000;

/** Bounded drain budget for in-flight candle processing on stop (reviewer
 *  MAJOR R1). A tick whose swap is in flight can hang forever on a wedged HTTP
 *  endpoint (the Jupiter fetch has no timeout), which would otherwise block the
 *  stop indefinitely before the close snapshot. The drain races the in-flight
 *  ticks against this short cap and PROCEEDS to closes regardless — the
 *  bounded-stop guarantee covers the whole stop sequence, not just
 *  closeAllPositions. */
const DRAIN_DEADLINE_MS = 3_000;

/** Persisted close-attempt tombstones (security F3), written beside the
 *  executor's strategy-state.json and feed-state.json (engine-cwd). Maps
 *  `SYMBOL:TIMEFRAME` → { closeRunId, attemptedAt }. Prevents a cross-run /
 *  post-restart double-sell: a failed/timed-out close never removes the
 *  position (correct chain-truth), so without a tombstone a restart's next
 *  stop would re-sell a position the previous close may have actually closed. */
const CLOSE_ATTEMPTS_FILE = 'close-attempts.json';

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
  /** Timestamp (ms) of the last kline message received — confirmed or not —
   *  proving feed liveness before the first confirmed candle (liveness
   *  suite). Null until the first message. */
  lastTickAt: number | null;
  /** Kline messages (ticks) received since this run started — confirmed or
   *  not. Distinguishes "feed alive, waiting for confirm" from "feed dead". */
  tickCount: number;
  /** ETA (ms) of the next confirmed candle — set while a configured timeframe
   *  is long (> 10 min) so an operator sees when the engine will next tick
   *  (liveness suite). */
  nextCandleEta?: number;
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
  /**
   * Optional CloseManager for closing open positions on stop
   * (auto-close-on-stop). Injected for tests; when omitted and a wallet is
   * available, the engine constructs one internally in initialize() bound to
   * its own DEX adapter.
   */
  closeManager?: CloseManager;
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
  /** Injected close manager (tests) — reused across restarts. */
  private readonly injectedCloseManager?: CloseManager;
  /** Active close manager — rebuilt each initialize() when internally created. */
  private closeManager: CloseManager | null = null;
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
    lastTickAt: null,
    tickCount: 0,
  };

  /** One-time chaos-mode recommendation guard (liveness suite): the 1m-timeframe
   *  suggestion is logged once per run, not on every connect/subscribe. */
  private longTimeframeWarned = false;

  /** Timestamp (ms) when the bar-feed socket last connected — the silence
   *  reference for a connected feed that has never delivered a confirmed
   *  candle (QA S3). buildFeedStatus cannot key off lastCandleAt (null on a
   *  zero-candle feed would never flip silent), so a connected-but-silent feed
   *  is measured from this instead. Null until the first connection. */
  private feedStartedAt: number | null = null;

  /** Timestamp of the last feed-state.json write, for the candle-count
   *  persistence throttle (task 1.3). */
  private lastFeedStatePersistAt = 0;

  /** Timestamp of the last bot:feedStatus WS broadcast, for the tick-level
   *  broadcast throttle (review #2). Structural changes always emit. */
  private lastFeedStatusBroadcastAt = 0;

  /** Live trading components (initialized in initialize()). */
  private barFeed: BybitWebSocketService | null = null;
  private strategyExecutor: LiveStrategyExecutor | null = null;
  private scheduler: LiveScheduler | null = null;
  private dex: JupiterSwapAdapter | null = null;

  /** AbortController for cancelling in-flight candle processing on stop. */
  private _abortController: AbortController | null = null;

  /** In-flight scheduler ticks, tracked for the stop-path drain
   *  (auto-close-on-stop, design decision 4). */
  private readonly pendingTicks = new Set<Promise<void>>();

  /** Single-flight guard for the stop/close sequence (security F1): set
   *  synchronously when a stop run begins and cleared in its finally. Two
   *  concurrent emergency stops from the Error state (where no state-machine
   *  transition exists to serialize them) must NEVER both reach
   *  closeOpenPositions — that would run two swaps for one position. One
   *  close run per engine lifetime. */
  private closeRunInProgress = false;

  /** Persisted per-position close-attempt tombstones (security F3), keyed by
   *  `SYMBOL:TIMEFRAME`. A close run marks a position before attempting its
   *  swap; a confirmed close removes the mark. Any later close run that finds
   *  a mark from a DIFFERENT closeRunId refuses to re-sell — the prior close
   *  may have landed on-chain but been misreported (failed/timed_out), and a
   *  post-restart re-sell would double-sell. */
  private closeAttempts: Record<string, { closeRunId: string; attemptedAt: number }> = {};

  constructor(options?: BotEngineOptions) {
    this.logger = options?.logger ?? consoleLogger;
    this.riskManager = options?.riskManager;
    this.telegramBot = options?.telegramBot;
    this.walletManager = options?.walletManager;
    this.injectedCloseManager = options?.closeManager;
    this.onAutoSelect = options?.onAutoSelect;
    this.onConfigPersist = options?.onConfigPersist;

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

    // F1 single-flight: one close run per engine lifetime. A concurrent stop
    // (e.g. a risk handler racing a user stop) must not start a second
    // drain+close worker — tolerate it gracefully instead.
    if (!this.tryBeginCloseRun()) {
      this.logger.warn('Stop already in progress — ignoring concurrent stop request');
      return;
    }

    // Cancel in-flight candle processing immediately
    this._abortController?.abort();

    try {
      await this.stateMachine.transition(BotState.Stopping, 'User requested stop');

      // Auto-close-on-stop (design decision 4): drain in-flight entry
      // processing so a submit already under the scheduler mutex settles to a
      // definite outcome before the close snapshot (spec: "the in-flight entry
      // is allowed to settle first, and no new entries begin after the stop
      // starts"), then close all open positions with the graceful budget
      // (60s deadline, 3 retries). Closes run BEFORE shutdown() nulls the
      // executor so onPositionClosed can flatten live state. The drain is
      // deadline-bounded (reviewer MAJOR R1) so a wedged swap cannot stall the
      // stop before closes even begin.
      await this.drainInFlightProcessing(DRAIN_DEADLINE_MS);
      await this.closeOpenPositions('user_stop', 'graceful');
      // Phase 2: finish bar processing, close positions, persist state
      await this.shutdown();
      await this.stateMachine.transition(BotState.Stopped, 'Shutdown complete');
      this.logger.info('Bot stopped');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.recordError('STOP_FAILED', message, ErrorSeverity.Error);
      await this.stateMachine.transition(BotState.Error, `Stop failed: ${message}`);
    } finally {
      // F1: the close-run guard always releases — even when a transition or
      // drain throws, the next stop must be able to acquire the run again.
      this.closeRunInProgress = false;
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

    // F1 single-flight (security): acquire the close run SYNCHRONOUSLY, before
    // any await and regardless of state. From Error there is no state-machine
    // transition to serialize callers, so two rapid POST /api/bot/emergency-stop
    // would otherwise BOTH reach closeOpenPositions and run two concurrent
    // swaps for one position. The second caller is tolerated gracefully (no
    // new worker, no new close run).
    if (!this.tryBeginCloseRun()) {
      this.logger.warn('Emergency stop already in progress — ignoring concurrent stop request');
      return;
    }

    this.logger.warn('Emergency stop triggered');

    // Cancel in-flight candle processing immediately
    this._abortController?.abort();

    try {
      // Force to Stopping if currently Running
      if (this.state === BotState.Running) {
        await this.stateMachine.transition(BotState.Stopping, 'Emergency stop');
      }

      this.logger.info('Emergency stop: cancelling pending orders, closing positions');
      // Auto-close-on-stop (design decision 4): best-effort emergency budget
      // (30s deadline, 1 retry) — the state ALWAYS reaches Stopped even if
      // closes fail. The drain is deadline-bounded (reviewer MAJOR R1) so a
      // wedged in-flight swap cannot delay the emergency close.
      await this.drainInFlightProcessing(DRAIN_DEADLINE_MS);
      await this.closeOpenPositions('emergency_stop', 'emergency');
      // Phase 2: cancel orders, close positions, persist state
      await this.shutdown();
      await this.stateMachine.transition(BotState.Stopped, 'Emergency stop complete');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.recordError('EMERGENCY_STOP_FAILED', message, ErrorSeverity.Fatal);
      await this.stateMachine.transition(BotState.Error, `Emergency stop failed: ${message}`);
    } finally {
      // F1: the close-run guard always releases on the way out.
      this.closeRunInProgress = false;
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

    // 0.5 F3: reload the persisted close-attempt tombstones (security F3) so a
    //     post-restart stop refuses to re-sell a position a prior run left
    //     non-confirmed. A fresh in-memory map would lose the cross-run
    //     protection that prevents the double-sell-after-restart.
    await this.loadCloseAttemptsFromDisk();

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

    // 3.6 Close manager (auto-close-on-stop, Wave 3). An injected manager
    //     (tests) ALWAYS wins — the caller owns its dependencies. Otherwise
    //     construct in-engine when a wallet exists — the backend has no
    //     package export for CloseManager, so there is no DI site outside the
    //     engine (design decision 1, "inside BotEngine if fields are
    //     available"). A wallet-less engine gets no internal manager (nothing
    //     can sign) and stop paths skip closes.
    const dex = this.dex;
    const walletManager = this.walletManager;
    if (this.injectedCloseManager) {
      this.closeManager = this.injectedCloseManager;
      this.logger.info('Close manager ready', { source: 'injected' });
    } else if (dex && walletManager) {
      this.closeManager = new CloseManager({
        dex,
        getKeypair: () => walletManager.getKeypair(),
        getPositions: () => this.getPositions(),
        onPositionClosed: (symbol, timeframe, txSignature) =>
          this.handlePositionClosed(symbol, timeframe, txSignature),
        onPositionCloseFailed: (symbol, timeframe, error) =>
          this.handlePositionCloseFailed(symbol, timeframe, error),
        // F3 (security): engine-owned cross-run double-sell guard — persist the
        // close attempt BEFORE the swap and refuse a position that a previous
        // run left non-confirmed.
        preflightClose: (position, closeRunId) =>
          this.prepareCloseAttempt(position.symbol, position.timeframe, closeRunId),
        onEvent: (event) => this.handleCloseEvent(event),
        logger: this.logger,
      });
      this.logger.info('Close manager ready', { dex: dex.name, source: 'internal' });
    } else {
      this.closeManager = null;
      this.logger.warn(
        'Close manager not created — wallet or DEX unavailable; stops will skip closes',
      );
    }

    // 3.5 Initialize a compiled strategy engine for every configured pair.
    //     Parse/compile failures throw here so start() fails with a descriptive
    //     error instead of silently running a strategy that cannot signal.
    for (const pair of this._config.pairs ?? []) {
      const pairId: PairId = { symbol: pair.symbol, timeframe: pair.timeframe };
      await this.strategyExecutor.initializeStrategy(pairId);
      this.logger.info('Strategy initialized', { symbol: pair.symbol, timeframe: pair.timeframe });
    }

    // 3. Create bar feed (Bybit WebSocket)
    // Pass the engine's logger so the feed's lifecycle/tick observability
    // (liveness suite) lands in the same structured log stream.
    this.barFeed = new BybitWebSocketService({ logger: this.logger });

    // Feed telemetry (D1): fresh counters per run so lastCandleAt/candleCount
    // describe THIS run, not a previous one. The throttle timestamp also
    // resets so the first candle of a new run persists immediately instead of
    // being suppressed by a write from the previous run.
    this.feedState = {
      connected: false,
      subscriptions: [],
      lastCandleAt: null,
      candleCount: 0,
      lastTickAt: null,
      tickCount: 0,
    };
    this.feedStartedAt = null;
    this.lastFeedStatePersistAt = 0;
    this.lastFeedStatusBroadcastAt = 0;
    this.longTimeframeWarned = false;

    // 4. Wire candle callback: feed candles into scheduler
    this.barFeed.setCandleCallback((candle: ClosedCandle) => {
      this.handleCandle(candle);
    });

    // Feed-liveness telemetry (liveness suite): advance tick counters on every
    // kline message (confirmed or not) so the feed proves itself alive before
    // the first confirmed candle. Telemetry only — never feeds the engine.
    this.barFeed.setTickCallback((tick: BybitTick) => {
      this.handleFeedTick(tick);
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
        // Reconnect re-establishes subscriptions — recompute the long-timeframe
        // next-confirm ETA so telemetry reflects the (re)connected feed
        // (liveness suite).
        this.updateNextCandleEta();
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
      // Long-timeframe warning (liveness suite): surface the next-confirm ETA
      // in the feed telemetry when a configured timeframe is long (> 10 min),
      // so a chaos/strategy run on e.g. BTCUSDT:60 is never mistaken for dead.
      this.updateNextCandleEta();
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

  /** Long-timeframe warning (liveness suite): when a configured timeframe's
   *  next confirmed candle is > LONG_TIMEFRAME_WARN_MINUTES out, surface the
   *  ETA in the feed telemetry (nextCandleEta) and log it loudly — a
   *  chaos/strategy run on e.g. BTCUSDT:60 waits an hour between engine ticks
   *  and must never be mistaken for a dead feed. Also logs a one-time
   *  recommendation to use 1m timeframes for chaos-mode testing. */
  private updateNextCandleEta(): void {
    const pairs = this._config?.pairs ?? [];
    const long = pairs
      .map((p) => ({
        symbol: p.symbol,
        timeframe: p.timeframe,
        minutes: timeframeToMinutes(p.timeframe),
      }))
      .filter((t) => t.minutes > LONG_TIMEFRAME_WARN_MINUTES);
    if (long.length === 0) {
      this.feedState.nextCandleEta = undefined;
      return;
    }
    // ETA = the next candle-boundary of the longest configured timeframe.
    // Shared SSOT helper (nextBoundaryAfter) also fixes the boundary case:
    // Math.ceil would return ETA == now when `now` lands exactly on a
    // boundary; the helper returns one full duration later (review #3).
    const durationMs = Math.max(...long.map((t) => t.minutes)) * 60_000;
    const now = Date.now();
    const nextBoundary = nextBoundaryAfter(now, durationMs);
    this.feedState.nextCandleEta = nextBoundary;
    // Warn only while ZERO confirmed candles exist (review #4): after the bot
    // has confirmed candles for hours, a reconnect must not re-spam this warn
    // — the ETA is still recorded in telemetry either way.
    if (this.feedState.candleCount === 0) {
      const top = long[0];
      this.logger.warn('Long timeframe — no confirmed candle yet', {
        symbol: top.symbol,
        timeframe: top.timeframe,
        minutes: top.minutes,
        nextConfirmEta: new Date(nextBoundary).toISOString(),
        eta: new Date(nextBoundary).toLocaleTimeString(),
        at: new Date().toISOString(),
      });
    }
    // One-time recommendation (liveness suite): chaos runs on 1m timeframes get
    // a confirmed candle every minute, so the chaos cadence is never starved
    // by the candle interval itself.
    if (this._config?.chaosMode?.enabled === true && !this.longTimeframeWarned) {
      this.longTimeframeWarned = true;
      this.logger.warn(
        'Chaos-mode testing recommendation: use 1m timeframes so a confirmed candle arrives every minute',
        { at: new Date().toISOString() },
      );
    }
  }

  /** Latest feed status with the silence marker computed lazily (D1): once a
   *  Running bot has gone FEED_SILENCE_THRESHOLD_MS without a confirmed
   *  candle, silentSince marks when the feed crossed the threshold. Returns a
   *  copy so consumers cannot mutate the engine's live telemetry. */
  private buildFeedStatus(): FeedStatus {
    const {
      connected,
      subscriptions,
      lastCandleAt,
      candleCount,
      lastTickAt,
      tickCount,
      nextCandleEta,
    } = this.feedState;
    // Silence reference: the most recent proof the feed delivered something —
    // lastTickAt (any kline message) beats lastCandleAt (confirmed only),
    // which beats the last connection time (QA S3). A long-timeframe feed that
    // IS delivering unconfirmed ticks must NOT look dead; a truly dead socket
    // (no ticks at all) freezes the reference and flips silent after
    // FEED_SILENCE_THRESHOLD_MS.
    const referenceAt = connected ? (lastTickAt ?? lastCandleAt ?? this.feedStartedAt ?? 0) : 0;
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
      lastTickAt,
      tickCount,
      ...(nextCandleEta !== undefined ? { nextCandleEta } : {}),
      ...(silentSince !== undefined ? { silentSince } : {}),
    };
  }

  /** Broadcast the latest feed status on `bot:feedStatus` and persist it (D1).
   *  forcePersist bypasses BOTH throttles — callers pass true on structural
   *  changes (connection/subscription/error → instant broadcast + immediate
   *  write), false (default) on candle/tick updates (broadcast at most once
   *  per FEED_STATUS_BROADCAST_THROTTLE_MS, disk write at most once per
   *  FEED_STATE_PERSIST_THROTTLE_MS — review #2). */
  private notifyFeedStatus(forcePersist = false): void {
    const status = this.buildFeedStatus();
    const now = Date.now();
    // WS broadcast throttle (review #2): a kline tick arrives ~1/sec/pair and
    // must not fan out to every dashboard client at that rate. Structural
    // changes always emit immediately; tick-level updates emit at most once
    // per second. Persistence is unchanged (separate 60s gate below).
    if (forcePersist || now - this.lastFeedStatusBroadcastAt >= FEED_STATUS_BROADCAST_THROTTLE_MS) {
      this.lastFeedStatusBroadcastAt = now;
      this.emit('feedStatus', status);
    }
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

  /** Feed-liveness telemetry (liveness suite): every kline message — confirmed
   *  or not — advances the tick counters and refreshes the silence reference,
   *  so a connected feed that has not yet delivered a confirmed candle still
   *  proves itself alive. Telemetry only: the strategy engine is deliberately
   *  NOT fed here — confirmed-only execution semantics live in handleCandle. */
  private handleFeedTick(tick: BybitTick): void {
    this.feedState.lastTickAt = tick.timestamp;
    this.feedState.tickCount++;
    this.notifyFeedStatus();
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

    // Process candle asynchronously (fire and forget — scheduler handles
    // errors). Tracked in pendingTicks so the stop-path drain
    // (auto-close-on-stop, decision 4) can await an in-flight entry before
    // snapshotting positions; removed once the tick settles.
    const tickPromise = this.scheduler.liveTick([candle], this._abortController?.signal);
    this.pendingTicks.add(tickPromise);
    tickPromise
      .then(() => this.captureBalanceSnapshot())
      .catch((err) => {
        this.logger.error('Error processing candle', { error: String(err) });
      })
      .finally(() => {
        this.pendingTicks.delete(tickPromise);
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

  // ---- Close integration (auto-close-on-stop) ----

  /**
   * Run the close-all sequence for a stop path (design decision 2/4).
   *
   * The CloseManager's global deadline (30s emergency / 60s graceful)
   * guarantees closeAllPositions resolves, so the state machine ALWAYS
   * proceeds to shutdown → Stopped. The catch is defensive (the module never
   * rejects by design) and MUST NOT re-throw: a close failure must never
   * strand the engine in Stopping — log loudly and continue the stop.
   */
  private async closeOpenPositions(reason: string, mode: CloseMode): Promise<void> {
    const closeManager = this.closeManager;
    if (!closeManager) {
      this.logger.info('Close manager not available — skipping position closes', { reason, mode });
      return;
    }
    try {
      await closeManager.closeAllPositions(reason, mode);
    } catch (err) {
      this.logger.error('Close run failed unexpectedly — continuing stop', {
        reason,
        mode,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Drain in-flight candle processing before the close snapshot (design
   * decision 4; spec: "the in-flight entry is allowed to settle first").
   *
   * The scheduler serializes order submission behind a PRIVATE mutex
   * (scheduler.ts `private readonly mutex`) with no public drain handle, so
   * the mutex is not cleanly reachable from the engine. The abort signal
   * (fired before the Stopping transition) already stops NEW submits —
   * tick() checks signal.aborted before Phase 2. What remains is an
   * already-running submit whose swap is in flight: awaiting the tracked
   * in-flight ticks lets that swap settle to a definite outcome so the entry
   * either confirms (→ appears in getPositions() → the close run closes it)
   * or fails (→ never reported) BEFORE the snapshot.
   */
  private async drainInFlightProcessing(deadlineMs: number): Promise<void> {
    const pending = [...this.pendingTicks];
    if (pending.length === 0) return;
    this.logger.info('Draining in-flight candle processing before closing positions', {
      count: pending.length,
      deadlineMs,
    });

    // Reviewer MAJOR R1: bound the drain. A tick whose swap is mid-flight can
    // hang forever (a wedged Jupiter endpoint has no timeout on its fetch), so
    // awaiting indefinite allSettled would strand the stop before closes even
    // begin. Race the in-flight ticks against the drain budget and PROCEED to
    // closes regardless — the drain is a best-effort settle, never a gate.
    let drainTimer: NodeJS.Timeout | undefined;
    const deadline = new Promise<'deadline'>((resolve) => {
      drainTimer = setTimeout(() => resolve('deadline'), deadlineMs);
    });

    const winner = await Promise.race([
      Promise.allSettled(pending).then(() => 'drained' as const),
      deadline,
    ]);
    if (drainTimer) clearTimeout(drainTimer);

    if (winner === 'deadline') {
      this.logger.warn(
        'Drain deadline fired — proceeding to closes with in-flight ticks still unsettled',
        {
          count: this.pendingTicks.size,
          deadlineMs,
        },
      );
    }
  }

  /**
   * F1 single-flight guard: atomically acquire the right to run the stop/close
   * sequence. Returns false when a close run is already in progress — the
   * caller must NOT start a second drain/close/shutdown worker (that could run
   * two concurrent swaps for one position). Synchronous and state-free: used by
   * both stop() and emergencyStop() so exactly one close runs per engine.
   */
  private tryBeginCloseRun(): boolean {
    if (this.closeRunInProgress) return false;
    this.closeRunInProgress = true;
    return true;
  }

  /**
   * F3 (security) close-attempt preflight, wired as CloseManager.preflightClose.
   *
   * Called before EVERY swap attempt for a position. Two responsibilities:
   * 1. PERSIST the close-attempt marker (closeRunId) to disk BEFORE the swap,
   *    so a crash/restart mid-close still leaves a tombstone.
   * 2. REFUSE (return a reason) when a tombstone exists from a DIFFERENT
   *    closeRunId — that prior close never confirmed (failed/timed_out) and
   *    may have landed on-chain but been misreported; re-selling it after a
   *    restart is the cross-run double-sell F3 prevents.
   *
   * Same-run retries are allowed (matching closeRunId): the existing
   * close-level retry policy already only retries provably-no-send failures.
   *
   * Fail-closed by design: if we cannot tell whether a prior attempt landed,
   * we refuse to sell. The operator reconciles the position on-chain; a
   * stranded-but-not-double-sold position is the safe failure mode for real
   * money.
   */
  private async prepareCloseAttempt(
    symbol: string,
    timeframe: string,
    closeRunId: string,
  ): Promise<string | undefined> {
    const key = `${symbol}:${timeframe}`;
    const prior = this.closeAttempts[key];

    if (prior && prior.closeRunId !== closeRunId) {
      const reason =
        `Position ${key} has an unconfirmed close attempt from run ${prior.closeRunId} ` +
        `(attempted at ${new Date(prior.attemptedAt).toISOString()}) — refusing to re-sell ` +
        `to prevent a double-sell; reconcile the position on-chain before the next close`;
      this.logger.warn('[Close] cross-run double-sell guard refused re-sell', {
        symbol,
        timeframe,
        priorCloseRunId: prior.closeRunId,
        currentCloseRunId: closeRunId,
      });
      return reason;
    }

    // Mark BEFORE the swap. Persist is fire-and-forget but the in-memory map
    // (engine-lifetime) is the live guard; disk is the restart-survival layer.
    this.closeAttempts[key] = { closeRunId, attemptedAt: Date.now() };
    this.persistCloseAttempts();
    return undefined;
  }

  /** Persist the close-attempt tombstones (F3). Fire-and-forget: a write
   *  failure must never block a close — the in-memory map still guards the
   *  current engine lifetime, and a lost write only weakens (never breaks) the
   *  restart-survival guarantee. */
  private persistCloseAttempts(): void {
    void writeFile(CLOSE_ATTEMPTS_FILE, JSON.stringify(this.closeAttempts, null, 2)).catch(
      (err) => {
        this.logger.warn('Failed to persist close-attempt tombstones', { error: String(err) });
      },
    );
  }

  /** Load the persisted close-attempt tombstones (F3) at initialize(). A
   *  missing/corrupt file degrades to an empty map — the current run still
   *  guards itself in-memory; only cross-restart protection is lost, and that
   *  is fail-safe (an empty map never invents tombstones, it just cannot
   *  refuse). */
  private async loadCloseAttemptsFromDisk(): Promise<void> {
    try {
      const raw = await readFile(CLOSE_ATTEMPTS_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, { closeRunId: string; attemptedAt: number }>;
      // Validate shape — a corrupt/hostile file must not poison the guard.
      const valid: Record<string, { closeRunId: string; attemptedAt: number }> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (
          typeof key === 'string' &&
          value &&
          typeof value.closeRunId === 'string' &&
          typeof value.attemptedAt === 'number'
        ) {
          valid[key] = value;
        }
      }
      this.closeAttempts = valid;
      const count = Object.keys(valid).length;
      if (count > 0) {
        this.logger.info('Loaded persisted close-attempt tombstones', { count });
      }
    } catch (err) {
      this.closeAttempts = {};
      this.logger.debug('No persisted close-attempt tombstones to load', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * CloseManager seam — a confirmed on-chain close (design decision 5: only a
   * confirmed signature reaches here). Reconciles the executor's per-pair
   * position to flat using the SAME semantics as the executor's sell-success
   * branch (updatePositionState: state.position → flat object), emits a flat
   * `position` event (D3), and persists so a restart does not resurrect the
   * position.
   *
   * The executor owns confirmedPositions privately and it is not reachable
   * here; flattening state.position is sufficient because getPositions()
   * skips flat positions BEFORE the confirmed-fill gate, and the map is inert
   * once the engine stops.
   */
  private handlePositionClosed(symbol: string, timeframe: string, txSignature: string): void {
    const executor = this.strategyExecutor;
    if (executor) {
      const states = executor.getState();
      const state = states[`${symbol}:${timeframe}`];
      if (state) {
        state.position = {
          symbol,
          direction: 'flat',
          quantity: 0,
          entryPrice: 0,
          entryTime: 0,
        };
        executor.setState(states);
      } else {
        // A snapshot pair whose state vanished — the signature stays as the
        // operator trail (design decision 6 risk note), never invented state.
        this.logger.warn('position_closed has no executor state to flatten', {
          symbol,
          timeframe,
          txSignature,
        });
      }
    } else {
      this.logger.warn('position_closed after executor teardown — state not flattened', {
        symbol,
        timeframe,
        txSignature,
      });
    }

    // D3: broadcast the flat position so the dashboard positions panel updates.
    this.emit('position', {
      pair: `${symbol}:${timeframe}`,
      symbol,
      timeframe,
      direction: 'flat',
      quantity: 0,
      entryPrice: 0,
      entryTime: 0,
    });

    // F3 (security): a confirmed on-chain close clears the close-attempt
    // tombstone, so a position that is legitimately re-opened and later closed
    // again is not blocked by its own prior history. Persisted so a restart
    // sees the cleared state too.
    delete this.closeAttempts[`${symbol}:${timeframe}`];
    this.persistCloseAttempts();

    // Persist the flattened state — critical for a close that confirms after
    // the deadline: shutdown's saveState ran with the position still open, so
    // this write is what keeps a restart from resurrecting it. Logged loudly,
    // never rolled back (decision 5: signature is truth).
    if (executor) {
      void executor.saveState().catch((err) => {
        this.logger.error('Failed to persist state after position_closed', {
          symbol,
          timeframe,
          txSignature,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  }

  /**
   * CloseManager seam — a close failed or timed out without a confirmed
   * signature (design decision 7). The position stays on-chain and in
   * getPositions(); the operator is warned via the existing Telegram channel
   * (guarded, never thrown — mirrors the loss-breach pattern) and the failure
   * is recorded so GET /api/bot/status surfaces it.
   */
  private handlePositionCloseFailed(symbol: string, timeframe: string, error: string): void {
    const message = `Failed to close position ${symbol}:${timeframe}: ${error}`;
    this.logger.warn('[Close] position close failed', { symbol, timeframe, error });

    // Fire-and-forget (the seam is synchronous): notifyWarning is async and a
    // rejection must never propagate into the close run.
    if (this.telegramBot) {
      void this.telegramBot.notifyWarning(message).catch((err) => {
        this.logger.warn('Telegram notification failed after close failure', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    this.recordError('CLOSE_FAILED', message, ErrorSeverity.Warning);
  }

  /**
   * CloseManager observability seam — maps every structured CloseEvent to the
   * engine's log stream, each tagged with closeRunId (design decision 7).
   * V1 delivers via logs; a future WS channel would hook here.
   */
  private handleCloseEvent(event: CloseEvent): void {
    switch (event.type) {
      case 'stop_started':
        this.logger.info('[Close] stop_started', {
          closeRunId: event.closeRunId,
          reason: event.reason,
          mode: event.mode,
          total: event.total,
        });
        break;
      case 'close_started':
        this.logger.info('[Close] close_started', {
          closeRunId: event.closeRunId,
          symbol: event.symbol,
          timeframe: event.timeframe,
          attempt: event.attempt,
        });
        break;
      case 'position_closed':
        this.logger.info('[Close] position_closed', {
          closeRunId: event.closeRunId,
          symbol: event.symbol,
          timeframe: event.timeframe,
          txSignature: event.txSignature,
        });
        break;
      case 'close_failed':
        this.logger.warn('[Close] close_failed', {
          closeRunId: event.closeRunId,
          symbol: event.symbol,
          timeframe: event.timeframe,
          error: event.error,
          reason: event.reason,
        });
        break;
      case 'stop_completed':
        this.logger.info('[Close] stop_completed', {
          closeRunId: event.closeRunId,
          summary: event.summary,
        });
        break;
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
    // Close manager is rebuilt (or re-injected) on the next initialize() —
    // its dex reference must not outlive this run.
    this.closeManager = null;
    this._abortController = null;

    this.logger.info('Bot shutdown complete');
  }

  // ---- Private ----

  private logStateTransition(from: BotState, to: BotState, reason: string): void {
    this.logger.info(`State: ${from} → ${to}`, { reason });
  }
}
