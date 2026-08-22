/**
 * Live Trading Engine Module
 *
 * Provides a headless trading engine with deterministic state machine,
 * wallet management, DEX integration, scheduling, and risk management.
 *
 * @module trading
 */

export { BotState, ErrorSeverity, BOT_STATE_TRANSITIONS, LEGACY_STRATEGY_ID } from './types.js';
export type {
  StateTransition,
  StateChangeEvent,
  BotError,
  DexKind,
  PairId,
  PairConfig,
  RiskConfig,
  BotConfig,
  BotConfigV2,
  WorldConfig,
  BotStatusSnapshot,
  PositionSummary,
  TradeRecord,
} from './types.js';

export { StateMachine, createBotStateMachine } from './state-machine.js';
export type { StateMachineConfig, StateChangeHandler, TransitionGuard } from './state-machine.js';

export { BotEngine } from './bot-engine.js';
export type { BotLogger, BotEventMap } from './bot-engine.js';

export { LiveStrategyExecutor } from './live-strategy-executor.js';
export type { CapitalAllocator, CapitalAllocatorInput, StrategyState, PositionInfo } from './live-strategy-executor.js';

export * from './wallet/index.js';
export * from './dex/index.js';
export * from './risk/index.js';

export { Scheduler, Mutex, pairIdToString, parsePairId } from './scheduler.js';
export type {
  ClosedCandle,
  TradeSignal,
  SchedulerOptions,
  SchedulerStats,
  CandleProcessor,
  OrderSubmitter,
} from './scheduler.js';

// Note: TradeHistoryStore is NOT re-exported here because it depends on
// node:fs and node:path. Backend code imports it from the subpath export.
export type { HistoryConfig, DebugSnapshot, TradeStats } from './trade-history-store.js';

export { DashboardWsService } from './dashboard-ws.js';
export type { WsClient, DashboardMessage, LogEntry, MetricsSnapshot } from './dashboard-ws.js';

export { TradingTelegramBot } from './telegram-bot.js';
export type { TelegramSender, TradingNotificationOptions } from './telegram-bot.js';

export {
  AutoMarketSelector,
  DEFAULT_TIMEFRAMES,
  DEFAULT_SYMBOLS,
  generateDefaultCandidates,
} from './auto-select.js';
export type {
  RankingMetric,
  CandidateEvaluation,
  AutoSelectionResult,
  AutoSelectBlockedResult,
  SelectionProgressCallback,
  BarFetcher,
  BacktestRunner,
} from './auto-select.js';

// Token type system (single source of truth for symbols and addresses)
export {
  TRADABLE_PAIRS,
  TOKEN_REGISTRY,
  getTokenInfo,
  getTradablePairs,
  getBybitSymbol,
  getBybitCategory,
  isValidPairSymbol,
  type PairSymbol,
  type TokenInfo,
  type TradablePair,
} from './token-registry.js';
