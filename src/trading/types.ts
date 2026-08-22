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

/**
 * A single "world": one timeframe + symbol + strategy combination.
 *
 * The multi-world portfolio (D3/D4) lets the live bot trade across N of these
 * at once — e.g. `tf1+sym1+stg1`, `tf1+sym2+stg2`, ... The user selects the
 * set; the backtest ranks every world by PnL and we keep the N best.
 */
export interface WorldConfig {
  /** Candle timeframe for this world (e.g. '1m', '5m'). */
  timeframe: string;
  /** Market symbol for this world (e.g. 'SOLUSDC'). */
  symbol: string;
  /** Strategy identifier resolved by the executor / strategy registry. */
  strategy: string;
}

/**
 * Sentinel strategy id stamped onto worlds migrated from a legacy (pre-v2)
 * single-strategy config, where no explicit strategy id existed. The legacy
 * config had exactly one `strategySource`, so a single `__legacy__` world is
 * the faithful migration of `pairs[0]`.
 */
export const LEGACY_STRATEGY_ID = '__legacy__';

/**
 * Discriminated v2 bot config: multi-world selection. Extends BotConfig and
 * narrows `version` to 2 and `worlds` to a required, non-empty array.
 */
export interface BotConfigV2 extends Omit<BotConfig, 'version' | 'worlds'> {
  version: 2;
  worlds: WorldConfig[];
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
  /**
   * Config schema version. Omitted in legacy (pre-v2) files, which are treated
   * as v1 and migrated on read (D4). v2 introduces `worlds`.
   */
  version?: number;
  /**
   * Multi-world selection (v2). Each world is one tf+sym+strategy combination
   * the live bot trades across. Absent in legacy configs — `pairs` is then
   * authoritative and migrates to a single world on load.
   */
  worlds?: WorldConfig[];
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
  /**
   * Total fees in quote units (USDC) — the ANCHOR-SUBTRACTED total: the sum
   * of the fee kinds in pnl module `RealizedPnl.subtractedFromNet` (NOT
   * `RealizedPnl.feesTotal`, the sum of ALL kinds). This is the value that
   * reconciles `realizedPnl === gross − fees` with the TradeStats identity;
   * `feeBreakdown` carries the full per-kind display of all kinds. 0 when
   * none were subtracted or when fees are unknown (`feesUnknown` then flags
   * the record); legacy records carry the old locked 0.
   */
  fees: number;
  /**
   * NET realized PnL in quote units (USDC): gross minus the fee kinds the
   * anchor subtracted (pnl module `RealizedPnl.net`). The anchor follows the
   * gross source, not runtime — 'fills' for ideal-price-derived gross (all
   * kinds reduce net); 'outAmount' only when gross is literally anchored on
   * Jupiter's executed outAmount (venue/platform already inside, SOL-side
   * fees only). Since M5 the live executor persists NET here; legacy
   * (pre-M5) rows wrote GROSS and have no `grossPnl` field — readers
   * needing gross fall back to `realizedPnl` when `grossPnl` is absent
   * (backward compatible).
   */
  realizedPnl: number;
  dex: DexKind;
  transactionSignature?: string;
  openedAt: number;
  closedAt: number;
  /** Strategy script name (from extractScriptName, truncated 50). */
  strategy?: string;
  /** Pair timeframe, e.g. "1", "30", "240". */
  timeframe?: string;
  /** Execution mode: live bot or chaos test mode. */
  mode?: 'live' | 'chaos';
  /** Whether the on-chain swap outcome was confirmed. */
  status?: 'confirmed' | 'unknown';
  /** GROSS realized PnL in quote units (USDC), before fees (pnl module
   *  `RealizedPnl.gross`). Absent on legacy (pre-M5) records — those wrote
   *  gross into `realizedPnl`. */
  grossPnl?: number;
  /** Per-kind fee amounts in quote units (USDC), keyed by pnl FeeKind
   *  ('VENUE', 'PLATFORM', 'PRIORITY', 'BASE', 'JITO'). Absent when no fee
   *  was convertible/observed or on legacy records. */
  feeBreakdown?: Record<string, number>;
  /** True when the fee numbers could not be fully determined (no observed
   *  fee source, adapter feeUnknown, or a needed mint→quote price missing).
   *  Absent (false) on legacy records. */
  feesUnknown?: boolean;
}
