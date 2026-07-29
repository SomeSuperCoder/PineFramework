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

/** A recorded state transition with metadata. */
export interface StateTransition {
  from: BotState;
  to: BotState;
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
  /** Timezone for daily loss reset (e.g., "America/New_York", "UTC"). */
  dailyLossTimezone: string;
  /** Whether to close all positions when daily loss is hit. */
  closeOnDailyLoss: boolean;
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
