/**
 * BotEngine — the central controller for live trading.
 *
 * Owns the state machine, configuration, and lifecycle methods.
 * Delegates to specialized components for scheduling, DEX, wallet, and risk.
 *
 * @module trading
 */

import { BotState, ErrorSeverity } from './types.js';
import type { BotConfig, BotError, StateTransition, BotStatusSnapshot, PositionSummary, PairConfig } from './types.js';
import { StateMachine, createBotStateMachine } from './state-machine.js';
import type { StateChangeHandler } from './state-machine.js';

/** Logger interface for bot engine events. */
export interface BotLogger {
  info(event: string, meta?: Record<string, unknown>): void;
  warn(event: string, meta?: Record<string, unknown>): void;
  error(event: string, meta?: Record<string, unknown>): void;
  debug(event: string, meta?: Record<string, unknown>): void;
}

/** Default logger that writes to console. */
const consoleLogger: BotLogger = {
  info: (event, meta) => console.log(`[BOT] ${event}`, meta ?? ''),
  warn: (event, meta) => console.warn(`[BOT] ⚠ ${event}`, meta ?? ''),
  error: (event, meta) => console.error(`[BOT] ✗ ${event}`, meta ?? ''),
  debug: (event, meta) => console.debug(`[BOT] ${event}`, meta ?? ''),
};

/** Events emitted by BotEngine. */
export interface BotEventMap {
  stateChange: (event: { previous: BotState; current: BotState; reason: string; timestamp: number }) => void;
  error: (error: BotError) => void;
  configUpdate: (config: BotConfig) => void;
  /** Emitted when auto-selection completes. */
  autoSelectionComplete: (result: { best: PairConfig; ranking: Array<{ pair: PairConfig; label: string }> }) => void;
}

export interface BotEngineOptions {
  logger?: BotLogger;
  /**
   * Optional callback invoked when auto-selection is enabled.
   * Receives the current config and returns a list of selected pairs.
   * If not provided, auto-selection will throw an error when enabled.
   */
  onAutoSelect?: (config: BotConfig) => Promise<PairConfig[]>;
}

/**
 * Central controller for the live trading bot.
 * Manages lifecycle, configuration, error handling, and state.
 */
export class BotEngine {
  private readonly stateMachine: StateMachine<BotState>;
  private readonly logger: BotLogger;
  private readonly onAutoSelect?: (config: BotConfig) => Promise<PairConfig[]>;
  private _config: BotConfig | null = null;
  private _errors: BotError[] = [];
  private _startedAt: number | null = null;
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  /** Current positions (in-memory; will be managed by scheduler in Phase 2). */
  private _positions: PositionSummary[] = [];

  constructor(options?: BotEngineOptions) {
    this.logger = options?.logger ?? consoleLogger;
    this.onAutoSelect = options?.onAutoSelect;

    const onChange: StateChangeHandler<BotState> = (from, to, reason) => {
      this.logStateTransition(from, to, reason);
      this.emit('stateChange', { previous: from, current: to, reason, timestamp: Date.now() });
    };

    this.stateMachine = createBotStateMachine(onChange);
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
    this.logger.info('Bot configured', { dex: config.dex, pairs: config.pairs?.length ?? 0, risk: config.risk });
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

    // Run auto-selection if enabled
    if (this._config.autoSelect) {
      if (!this.onAutoSelect) {
        throw new Error(
          'Auto-select is enabled but no onAutoSelect callback was provided to BotEngine. ' +
          'Provide an onAutoSelect implementation or disable autoSelect.',
        );
      }
      this.logger.info('Auto-selection enabled — evaluating candidate pairs');
      const selectedPairs = await this.onAutoSelect(this._config);
      if (selectedPairs.length === 0) {
        throw new Error('Auto-selection returned no pairs. Cannot start bot.');
      }
      this._config = { ...this._config, pairs: selectedPairs };
      this.logger.info('Auto-selection complete', { pairs: selectedPairs.map((p) => `${p.symbol}:${p.timeframe}`) });
      this.emit('configUpdate', this._config);
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

  // ---- Snapshot ----

  /** Build a status snapshot for dashboard / WebSocket broadcast. */
  getSnapshot(): BotStatusSnapshot {
    return {
      state: this.state,
      strategyName: this._config?.strategySource
        ? this._config.strategySource.substring(0, 50)
        : '(not configured)',
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
    };
  }

  // ---- Internal lifecycle hooks (overridden by subclasses or extended in later phases) ----

  /**
   * Initialize the bot components.
   * Called during Starting → Running transition.
   * Override in Phase 2+ for actual initialization.
   */
  protected async initialize(): Promise<void> {
    // Phase 2: compile strategy, connect DEX, load wallet, start scheduler
    this.logger.info('Initialization placeholder — no real components connected');
  }

  /**
   * Shutdown the bot components.
   * Called during Stopping → Stopped transition.
   * Override in Phase 2+ for actual shutdown.
   */
  protected async shutdown(): Promise<void> {
    // Phase 2: stop scheduler, close positions, persist state
    this.logger.info('Shutdown placeholder — no real components to shut down');
  }

  // ---- Private ----

  private logStateTransition(from: BotState, to: BotState, reason: string): void {
    this.logger.info(`State: ${from} → ${to}`, { reason });
  }
}
