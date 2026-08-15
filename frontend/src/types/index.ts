import type {
  JupiterManualSettings,
  JupiterUltraSettings,
  StrategyConfig,
} from 'pine-framework';

export interface CandlestickData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PineScriptError {
  type: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
  column?: number;
}

export interface PlotData {
  type: 'line' | 'stepline' | 'area' | 'areabr' | 'histogram' | 'columns' | 'circles' | 'cross';
  data: Array<{ time: number; value: number | null; color?: string | null }>;
  color?: string;
  lineWidth?: number;
  title?: string;
}

export interface ShapeData {
  type: 'arrowup' | 'arrowdown' | 'circle' | 'square' | 'diamond' | 'triangleup' | 'triangledown' | 'labelup' | 'labeldown';
  time: number;
  price: number;
  color?: string;
  text?: string;
  textcolor?: string;
  location?: 'abovebar' | 'belowbar' | 'top' | 'middle' | 'bottom' | 'absolute';
  overlay?: boolean;
}

export interface LineData {
  points: Array<{ time: number; price: number }>;
  color?: string;
  width?: number;
  style?: 'solid' | 'dotted' | 'dashed';
  extend?: 'none' | 'left' | 'right' | 'both';
}

export interface BoxData {
  startTime: number;
  startPrice: number;
  endTime: number;
  endPrice: number;
  borderColor?: string;
  borderWidth?: number;
  backgroundColor?: string;
}

export interface LabelData {
  time: number;
  price: number;
  text: string;
  color?: string;
  textColor?: string;
  style?: string;
  size?: string;
}

export interface TableCellData {
  text: string;
  text_color: string;
  text_halign: string;
  text_valign: string;
  bgcolor: string;
  width: number;
  text_size: string;
  tooltip: string;
}

export interface TableData {
  position: number;
  columns: number;
  rows: number;
  bgcolor: string;
  border_color: string;
  border_width: number;
  frame_color: string;
  frame_width: number;
  cells: Record<string, TableCellData>;
}

export interface AlertConditionData {
  id: string;
  title: string;
  message: string;
}

export interface FillData {
  from: string;
  to: string;
  color: string;
}

export interface ScriptResult {
  overlay: boolean;
  plots: PlotData[];
  shapes: ShapeData[];
  lines: LineData[];
  boxes: BoxData[];
  labels: LabelData[];
  tables: TableData[];
  bgcolor?: { time: number; color: string }[];
  barcolor?: { time: number; color: string }[];
  fills?: FillData[];
  fillColorData?: Record<string, (string | null)[]>;
  plotColors?: Record<string, (string | null)[]>;
  strategyMarkers?: StrategyMarkerData[];
  alertConditions?: AlertConditionData[];
  alertTriggers?: AlertTriggerData[];
  hiddenPlotTitles?: string[];
  /** Per-bar candle color overrides (from barcolor() / plotcandle()).
   *  Keyed by timestamp (seconds). body = body color, wick = wick color, border = border color.
   *  offset shifts the color to a future bar (resolved at render time). */
  barColors?: Array<{
    time: number;
    body?: string;
    wick?: string;
    border?: string;
    offset?: number;
  }>;
}

/** The closed set of notification categories a Telegram member can subscribe to. */
export const NOTIFICATION_TYPES = [
  'trading',
  'position_open',
  'position_close',
  'report',
  'daily',
  'error',
  'bot_lifecycle',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Locale the bot should use when talking to a chat. */
export type ChatLanguage = 'en' | 'es' | 'ru';

/**
 * The configured admin (panel shape). The GET /settings/telegram route strips
 * the store's `configuredAt`; the panel treats it as `null` when no admin is set.
 */
export interface TelegramAdmin {
  userId: number;
  username: string;
}

export interface TelegramController {
  userId: number;
  username: string;
}

export interface TelegramControlRequest {
  userId: number;
  username: string;
  firstName: string;
  requestedAt: number;
}

export interface TelegramChat {
  chatId: number;
  type: 'private' | 'group';
  title?: string;
  /** Whether this chat is linked to the bot. Private chats are always linked. */
  linked: boolean;
  language: 'en' | 'es' | 'ru';
  /** memberId (numeric string) -> notification types that member opted into. */
  memberSubscriptions: Record<string, NotificationType[]>;
}

export interface TelegramConfig {
  botToken: string;
  admin: TelegramAdmin | null;
  controllers: TelegramController[];
  requests: TelegramControlRequest[];
  chats: TelegramChat[];
}

export interface ProxyConfig {
  host: string;
  port: number;
  username: string;
}

export interface AlertTriggerData {
  alertId: string;
  barIndex: number;
  timestamp: number;
  title?: string;
  message?: string;
  destination?: string;
}

export interface StrategyMarkerData {
  type: string;
  name: string;
  direction: string;
  action?: string;
  quantity?: number;
  price?: number;
  barIndex: number;
  timestamp: number;
  color: string;
  comment?: string;
  /** Heartbeat outcome for `type: 'heartbeat'` markers — the mini-chart renders
   *  noop/error heartbeats as small distinct glyphs so a silent no-op or error
   *  is visible instead of indistinguishable from no data. */
  outcome?: 'noop' | 'error';
}

/** Per-pair feed subscription attempt reported by the bot bar-feed. Reflects
 *  subscribe-request delivery on an open socket — NOT broker acks (the Bybit
 *  service does not surface subscription confirmations). */
export interface FeedSubscriptionAttempt {
  pair: string;
  timeframe: string;
  ok: boolean;
  error?: string;
}

/** Feed connectivity state broadcast on `bot:feedStatus` and carried by
 *  `bot:snapshot` under `status.feedState`. The truthful connectivity signal is
 *  `connected`; `silentSince` marks a Running bot that has not confirmed a
 *  candle within the configured silence threshold. */
export interface FeedStatus {
  connected: boolean;
  subscriptions: FeedSubscriptionAttempt[];
  lastCandleAt?: number;
  candleCount: number;
  silentSince?: number;
}

/** A truthful open position derived read-only from the executor state. Arrives
 *  in `bot:snapshot` under `status.positions` and via `bot:position` events
 *  (`direction: 'flat'` = closed). */
export interface PositionInfo {
  pair: string;
  symbol: string;
  timeframe: string;
  direction: 'long' | 'flat';
  quantity: number;
  entryPrice: number;
  entryTime: number;
  unrealizedPnl?: number;
}

/** A chaos signal broadcast by the bot backend — the genuine strategy engine
 *  marker plus its DEX execution result. */
export interface ChaosSignalRecord {
  marker: StrategyMarkerData;
  symbol: string;
  timeframe: string;
  success: boolean;
  txSignature?: string;
  error?: string;
  timestamp: number;
}

/** Chaos mode state reported by the engine in `bot:snapshot` — engine truth,
 *  not persisted disk config. The frontend indicator reads this, not disk. */
export interface ChaosModeSnapshot {
  enabled: boolean;
  executionMode: 'live' | 'simulated';
  /** Why execution is simulated, when it is. */
  reason?: 'wallet-empty' | 'rpc-unreachable';
}

/** Per-candle chaos outcome broadcast on `bot:chaosHeartbeat` and included in
 *  `bot:snapshot` (`null` when chaos mode is inactive). A running chaos mode
 *  always produces one of these per processed candle — never silently idle. */
export interface ChaosHeartbeatRecord {
  pair: string;
  timeframe: string;
  candleTimestamp: number;
  outcome: 'signal' | 'noop' | 'error';
  /** Action taken for a `signal` outcome (e.g. long/short/exit). */
  action?: string;
  /** Explicit no-op reason (e.g. "already long") or the error message. */
  reason?: string;
}

/** A candle processing error broadcast on `bot:candleError` — surfaced instead
 *  of silently swallowing per-candle exceptions. */
export interface CandleErrorRecord {
  type: 'candle-error';
  pair: string;
  timeframe: string;
  candleTimestamp: number;
  message: string;
}

export interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  /** Nullable per API contract — backend sanitizes Infinity (all-win run: grossLoss=0 → ratio → ∞) to null. */
  profitFactor: number | null;
  totalPnl: number;
  totalPnlPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  /** Nullable per API contract — backend sanitizes Infinity/undefined ratios to null. */
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  averageTradeDuration: number;
  commission: number;
}

export interface BacktestTrade {
  id: string;
  direction: string;
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  commission: number;
  entryName: string;
  exitName: string;
  mae: number;
  mfe: number;
  barsHeld: number;
}

export interface BacktestOrder {
  id: string;
  direction: string;
  action: string;
  type: string;
  quantity: number;
  price: number;
  fillPrice: number;
  fillTime: number;
  entryName: string;
  commission: number;
}

export interface EquityPoint {
  time: number;
  equity: number;
  drawdown: number;
  balance: number;
}

export interface BacktestJobResponse {
  job_id: string;
}

export interface BacktestStatusResponse {
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  phase?: string;
  error?: string;
  result_url?: string;
}

export interface BacktestResultResponse extends BacktestResultExtension {
  metrics: BacktestMetrics;
  equityCurve: number[];
  drawdownCurve: number[];
  trades: BacktestTrade[];
  orders: BacktestOrder[];
  equityPoints: EquityPoint[];
  monthlyReturns: Record<string, number>;
  buyHoldReturn: number;
  /** Number of bars processed for the run (backend route/export meta). */
  barCount: number;
}

export type DateRangeMode = 'days_back' | 'traditional';

/**
 * The two official Jupiter commission methods — the canonical union, mirror of
 * the backend contract's `BacktestCommissionMethodId` (commission-methods SSOT).
 * Every entry point that accepts a commission method validates against this set.
 */
export type CommissionMethodId = 'jupiter_ultra' | 'jupiter_manual';

/**
 * Canonical display labels (contract design D8 — owned by commission-methods):
 * `jupiter_manual` → "Jupiter Swap", `jupiter_ultra` → "Jupiter Ultra".
 * Single naming scheme across UI/CLI/exports.
 */
export const COMMISSION_METHOD_LABELS: Record<CommissionMethodId, string> = {
  jupiter_manual: 'Jupiter Swap',
  jupiter_ultra: 'Jupiter Ultra',
};

/**
 * User-explicit fee settings for the chosen method — mirror of backend
 * `BacktestCommissionMethodSettings`. Typed per method — never
 * `Record<string, unknown>`: only the engine's official settings keys are valid.
 * UI-state keys (e.g. `useCustomRate`/`useCustom`) are NOT contract keys; the
 * backend normalizer rejects them (UNKNOWN_FIELD) — strip them before sending.
 */
export type BacktestCommissionMethodSettings = JupiterUltraSettings | JupiterManualSettings;

/**
 * The ONE canonical explicit-override shape — mirror of backend
 * `ExplicitBacktestOverride`.
 *
 * - EVERY field is optional EXCEPT `commissionMethod` (required by the
 *   commission-methods spec: absent method → explicit error, never a default).
 * - `commission` / `commissionType` / `currency` are GONE (legacy fee path dead;
 *   producers never set currency — the engine resolves USD).
 * - Omitted optional field = "resolve from the script-declared defaults at the
 *   engine's single merge point" — never from a producer-side constant.
 * - Null is never allowed: optional fields are simply omitted from the request.
 */
export interface ExplicitBacktestOverride {
  /** REQUIRED. Official commission method. Absent/invalid → validation error. */
  commissionMethod: CommissionMethodId;
  /**
   * User-explicit fee settings. Omitted (or empty object) = no explicit fee
   * values; the run resolves fees from the method's official behavior / live
   * fetch.
   */
  commissionMethodSettings?: BacktestCommissionMethodSettings;
  initialCapital?: number;
  slippage?: number;
  slippageType?: StrategyConfig['slippageType'];
  defaultQty?: number;
  defaultQtyType?: StrategyConfig['defaultQtyType'];
  pyramiding?: number;
  marginLong?: number;
  marginShort?: number;
}

/**
 * Known warning types — mirror of backend `BacktestWarningType`. This set is
 * the extensibility point — new diagnostics append to the union.
 */
export type BacktestWarningType =
  | 'long-only-suppression'
  | 'fee-decision'
  | 'baseline-applied'
  | 'live-fee-cache'
  | 'live-fee-failure'
  | 'auto-select-method'
  | 'export-failure';

/** One typed per-run diagnostic — mirror of backend `BacktestWarning`. */
export interface BacktestWarning {
  type: BacktestWarningType;
  message: string;
  /**
   * Severity of the diagnostic. Absent = 'warning'. 'info' marks a quiet
   * informational confirmation (e.g. a user-explicit fee decision) that the UI
   * renders without alarm styling. Mirror of backend `BacktestWarning.level`.
   */
  level?: 'info' | 'warning';
  context?: unknown;
}

/**
 * The engine's post-merge configuration echoed back to the user — mirror of
 * backend `EffectiveBacktestConfig`: extends the engine's own `StrategyConfig`
 * (pine-framework SSOT — zero drift) plus the resolved date range
 * (ms timestamps, UTC-midnight aligned). "What actually ran."
 */
export interface EffectiveBacktestConfig extends StrategyConfig {
  /** Resolved start timestamp (ms, UTC-midnight aligned). Absent = full history. */
  startDate?: number;
  /** Resolved end timestamp (ms, UTC-midnight aligned). Absent = latest bar. */
  endDate?: number;
}

/**
 * The fields every result payload gains (warnings spec): the API result, CLI
 * output, and full-data export record. Mirror of backend
 * `BacktestResultExtension`.
 */
export interface BacktestResultExtension {
  /** The engine's post-merge configuration — what actually ran. */
  effectiveConfig: EffectiveBacktestConfig;
  /** Diagnostics collected during the run (empty array when none). */
  warnings: BacktestWarning[];
}

/** A strategy the user picked for a backtest run (from the StrategySelector). */
export interface SelectedBacktestStrategy {
  id: string;
  name: string;
  source: string;
}

/**
 * @deprecated Legacy panel-config shape — producers inject engine defaults that
 * the explicit-config contract forbids (`commission`/`commissionType`/`currency`
 * are gone; absent override fields must resolve at the engine merge point).
 * Prefer `ExplicitBacktestOverride` for new code.
 * Migrated by the request-builder microtask (useBacktestPanelState parity wave).
 */
export interface BacktestConfig {
  initialCapital: number;
  commission: number;
  slippage: number;
  commissionType: 'percent' | 'fixed' | 'per_contract' | 'per_order';
  slippageType: 'percent' | 'ticks' | 'points';
  defaultQty: number;
  defaultQtyType: 'contracts' | 'percent_of_equity' | 'cash';
  pyramiding: number;
  marginLong: number;
  marginShort: number;
  currency: string;
  commissionMethod?: CommissionMethodId;
  commissionMethodSettings?: Record<string, unknown> | null;
}
