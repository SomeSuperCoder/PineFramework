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
