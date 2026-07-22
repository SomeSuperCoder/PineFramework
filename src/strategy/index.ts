export { StrategyEngine } from './strategy-engine.js';
export { DEFAULT_STRATEGY_CONFIG } from './strategy-types.js';
export { computeMetrics } from './strategy-metrics.js';
export { TrailingStopManager } from './trailing-stop-manager.js';
export type {
  Order,
  FilledOrder,
  Position,
  Trade,
  StrategyMetrics,
  StrategyConfig,
  StrategyMarker,
  OrderDirection,
  OrderAction,
  OrderType,
  PositionDirection,
  Account,
  QtyType,
  CommissionType,
  MarketFillPrice,
  PositionLot,
  TrailingStopState,
} from './strategy-types.js';

export { BacktestEngine } from './backtest-engine.js';
export type { BacktestResult, BacktestConfig } from './backtest-engine.js';

export { AlertSystem, resetAlertIdCounter, DEFAULT_ALERT_CONFIG } from './alert-system.js';
export type {
  AlertCondition,
  AlertEvent,
  AlertConfig,
  AlertDestination,
  AlertFrequency,
  AlertBarData,
} from './alert-system.js';

export {
  getCommissionCalculator,
  getCommissionMethodDescriptor,
  getAllCommissionMethodDescriptors,
  isLongOnlyEnforced,
  computeCommission,
  buildTradeContextFromFill,
  buildTradeContextFromTrade,
} from './commission-calculator.js';
export type {
  CommissionCalculator,
  CommissionConfig,
  CommissionMethodId,
  CommissionMethodSettings,
  CommissionMethodDescriptor,
  SettingsFieldDescriptor,
  TradeContext,
  PercentFixedSettings,
  PerOrderFixedSettings,
  JupiterUltraSettings,
  JupiterManualSettings,
} from './commission-calculator.js';

export {
  fetchDexFeeBps,
  getCachedDexFeeBps,
  clearFeeCache,
  getCacheFilePath,
} from './jupiter-fee-fetcher.js';
export type { FeeFetchResult } from './jupiter-fee-fetcher.js';
