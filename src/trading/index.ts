/**
 * Live Trading Engine Module
 *
 * Provides a headless trading engine with deterministic state machine,
 * wallet management, DEX integration, scheduling, and risk management.
 *
 * @module trading
 */

export { BotState, ErrorSeverity, BOT_STATE_TRANSITIONS } from './types.js';
export type {
  StateTransition,
  StateChangeEvent,
  BotError,
  DexKind,
  PairId,
  PairConfig,
  RiskConfig,
  BotConfig,
  BotStatusSnapshot,
  PositionSummary,
  TradeRecord,
} from './types.js';

export { StateMachine, createBotStateMachine } from './state-machine.js';
export type { StateMachineConfig, StateChangeHandler, TransitionGuard } from './state-machine.js';

export { BotEngine } from './bot-engine.js';
export type { BotLogger, BotEventMap } from './bot-engine.js';

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

export { TradeHistoryStore } from './trade-history-store.js';
export type { HistoryConfig, DebugSnapshot, TradeStats } from './trade-history-store.js';

export { DashboardWsService } from './dashboard-ws.js';
export type {
  WsClient,
  DashboardMessage,
  LogEntry,
  MetricsSnapshot,
} from './dashboard-ws.js';

export { TradingTelegramBot } from './telegram-bot.js';
export type { TelegramSender, TradingNotificationOptions } from './telegram-bot.js';

export { AutoMarketSelector } from './auto-select.js';
export type {
  RankingMetric,
  CandidateEvaluation,
  AutoSelectionResult,
  SelectionProgressCallback,
  BarFetcher,
  BacktestRunner,
} from './auto-select.js';
