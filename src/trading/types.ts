/**
 * Core type definitions for the live trading engine.
 *
 * @module trading
 */

/**
 * Deterministic bot lifecycle states.
 * Transitions: Idle ↔ Starting ↔ Running ↔ Stopping ↔ Stopped
 *              ↕         ↕                     ↕
 *            Error ←─── Error ←────────────── Error
 */
export enum BotState {
  /** Bot is idle, no configuration loaded. */
  Idle = 'Idle',
  /** Bot is initializing (compiling strategy, connecting DEX, loading wallet). */
  Starting = 'Starting',
  /** Bot is actively trading — processing candles and submitting orders. */
  Running = 'Running',
  /** Bot is gracefully shutting down. */
  Stopping = 'Stopping',
  /** Bot has completed shutdown. */
  Stopped = 'Stopped',
  /** Bot encountered an unrecoverable error. */
  Error = 'Error',
}

/** Map of valid transitions: from state → set of allowed destination states. */
export const BOT_STATE_TRANSITIONS: Record<BotState, Set<BotState>> = {
  [BotState.Idle]: new Set([BotState.Starting, BotState.Error]),
  [BotState.Starting]: new Set([BotState.Running, BotState.Error]),
  [BotState.Running]: new Set([BotState.Stopping, BotState.Error]),
  [BotState.Stopping]: new Set([BotState.Stopped, BotState.Error]),
  [BotState.Stopped]: new Set([BotState.Idle, BotState.Starting, BotState.Error]),
  [BotState.Error]: new Set([BotState.Stopped]),
};

/** A recorded state transition with metadata.
 *  Generic over the state type; defaults to BotState for backward
 *  compatibility (BotStatusSnapshot.lastTransition). */
export interface StateTransition<TState extends string = BotState> {
  from: TState;
  to: TState;
  reason: string;
  timestamp: number;
}

/** Notification event emitted on state transitions. */
export interface StateChangeEvent {
  previous: BotState;
  current: BotState;
  reason: string;
  timestamp: number;
}

/** Error severity levels for the bot. */
export enum ErrorSeverity {
  Warning = 'warning',
  Error = 'error',
  Fatal = 'fatal',
}

/** Structured bot error. */
export interface BotError {
  code: string;
  message: string;
  severity: ErrorSeverity;
  timestamp: number;
  context?: Record<string, unknown>;
}

/**
 * Supported DEX backends.
 */
export type DexKind = 'jupiter-swap' | 'jupiter-ultra';

/**
 * A (Symbol × Timeframe) pair identifier.
 */
export interface PairId {
  symbol: string;
  timeframe: string;
}

/** Configuration for a single trading pair. */
export interface PairConfig {
  symbol: string;
  timeframe: string;
}

/** Risk management settings. */
export interface RiskConfig {
  /** Maximum daily realized loss in quote currency. 0 = unlimited. */
  maxDailyLoss: number;
  /**
   * Maximum daily wallet-balance loss in whole USDC. 0 or omitted = unlimited.
   * Internally converted to micro-USDC (× 1_000_000n) for comparison
   * against wallet balance snapshots. Optional — omitted/undefined is treated
   * as 0 for backward compatibility with configs written before this field.
   */
  maxDailyWalletLossUsdc?: number;
}

/** Chaos test mode configuration. */
export interface ChaosModeConfig {
  /** Whether chaos mode is enabled. When true, random signals replace strategy execution. */
  enabled: boolean;
}

/**
 * Chaos execution mode: 'live' when real wallet funds back the chaos engine,
 * 'simulated' when the documented equity floor is in use (D1/D2).
 */
export type ChaosExecutionMode = 'live' | 'simulated';

/** Why the simulated equity floor replaced the real wallet balance (D2). */
export type ChaosFailureReason = 'wallet-empty' | 'rpc-unreachable';

/**
 * Per-candle chaos outcome — the "never silently vanishes" heartbeat (D3).
 * Every processed chaos candle records exactly one of these: a signal, an
 * explicit no-op reason, or an error. Broadcast on `bot:chaosHeartbeat` and
 * included in `bot:snapshot`.
 */
export interface ChaosHeartbeat {
  /** Pair key ("SYMBOL:TIMEFRAME"). */
  pair: string;
  /** Pair timeframe. */
  timeframe: string;
  /** Timestamp of the closed candle that produced this outcome. */
  candleTimestamp: number;
  /** Outcome: a generated signal, an explicit no-op reason, or an error. */
  outcome: 'signal' | 'noop' | 'error';
  /** Generator action for a `signal` outcome. */
  action?: 'long' | 'short' | 'exit';
  /** Explicit no-op reason or error message (for `noop`/`error` outcomes). */
  reason?: string;
}

/**
 * A candle-processing failure surfaced by the scheduler's per-candle catch —
 * broadcast over WS on `bot:candleError` instead of silently swallowed (D3).
 * The `type` discriminator matches the frontend's CandleErrorRecord contract.
 */
export interface CandleErrorInfo {
  type: 'candle-error';
  /** Pair key ("SYMBOL:TIMEFRAME"). */
  pair: string;
  /** Pair timeframe. */
  timeframe: string;
  /** Timestamp of the candle that failed to process. */
  candleTimestamp: number;
  /** Error message. */
  message: string;
}

/**
 * Complete bot configuration.
 */
export interface BotConfig {
  /** Compiled Pine Script strategy source. */
  strategySource: string;
  /** DEX backend to use. */
  dex: DexKind;
  /** Trading pairs with their timeframes (optional when autoSelect is true). */
  pairs?: PairConfig[];
  /** Risk settings. */
  risk: RiskConfig;
  /** Wallet identifier (public key) to use for trading. */
  walletPublicKey?: string;
  /** Whether to enable auto market selection. */
  autoSelect?: boolean;
  /** Performance metric to optimize when auto-selecting. */
  autoSelectMetric?: 'sharpe' | 'profitFactor' | 'netProfit' | 'winRate';
  /** Chaos test mode configuration. When enabled, random signals replace strategy execution. */
  chaosMode?: ChaosModeConfig;
  /** Starting capital in lamports (1 USDC = 1e6 lamports). Defaults to 1000 USDC. */
  initialCapital?: number;
  /** Position size as a percentage of the configured capital (0-100). */
  positionSizePercent?: number;
}

/** Snapshot of bot state for dashboard / WebSocket broadcast. */
export interface BotStatusSnapshot {
  state: BotState;
  strategyName: string;
  dex: DexKind;
  walletPublicKey: string | null;
  startedAt: number | null;
  uptimeMs: number;
  balance: number;
  realizedPnl: number;
  unrealizedPnl: number;
  positions: PositionSummary[];
  exposure: number;
  errors: BotError[];
  lastTransition: StateTransition | null;
  /**
   * Chaos mode state: whether active and, when active, the chaos execution
   * mode ('live' vs 'simulated' + reason) — engine truth, not disk (D4).
   */
  chaosMode: {
    enabled: boolean;
    executionMode: ChaosExecutionMode;
    /** Why execution is simulated, when it is (D2). */
    reason?: ChaosFailureReason;
  };
  /** Running count of candle-processing errors surfaced by the scheduler's
   *  per-candle catch (D3). */
  totalCandleErrors: number;
  /** Outcome of the most recently processed chaos candle, or null before the
   *  first chaos candle (D3). */
  chaosHeartbeat: ChaosHeartbeat | null;
  /** Whether all initialized strategies have completed warm-up (live path). */
  warmUpComplete: boolean;
}

/** Summary of an open position for dashboard display. */
export interface PositionSummary {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  openedAt: number;
}

/** A completed trade record. */
export interface TradeRecord {
  id: string;
  botId: string;
  symbol: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  exitPrice: number;
  size: number;
  fees: number;
  realizedPnl: number;
  dex: DexKind;
  transactionSignature?: string;
  openedAt: number;
  closedAt: number;
}
