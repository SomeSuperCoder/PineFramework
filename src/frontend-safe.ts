/**
 * Frontend-safe entry point for pine-framework.
 *
 * Only exports modules that don't depend on Node.js built-ins.
 * The main src/index.ts re-exports the trading module which uses
 * fs/path/crypto — this file is what the Vite bundle actually resolves to.
 */
export const VERSION = '0.1.0';

export * from './language/index.js';
export * from './data/index.js';
export * from './analysis/index.js';
export * from './config/index.js';
export * from './rendering/index.js';
export * from './strategy/index.js';
export * from './extensibility/index.js';
export * from './performance/index.js';
export * from './utils/time.js';
export * from './util/candle-string-format.js';
export * from './contracts/index.js';
export * from './api.js';

// Token type system (single source of truth for symbols and addresses)
export {
  TRADABLE_PAIRS,
  TOKEN_REGISTRY,
  getTokenInfo,
  getTradablePairs,
  isValidPairSymbol,
  type PairSymbol,
  type TokenInfo,
  type TradablePair,
} from './trading/token-registry.js';

export { parse } from './language/parser/index.js';
export { compile } from './language/compiler/index.js';
export { ExecutionEngine } from './language/runtime/execution-engine.js';
export { DataEngine } from './data/data-engine.js';
export { RequestSystem } from './data/request-system.js';
export { TAEngine } from './analysis/ta-engine.js';
export { InputSystem } from './config/input-system.js';
export { ConfigManager } from './config/config-manager.js';
export { PlotEngine } from './rendering/plot-engine.js';
export { DrawingEngine } from './rendering/drawing-engine.js';
export { StrategyEngine } from './strategy/strategy-engine.js';
export { BacktestEngine } from './strategy/backtest-engine.js';
export { AlertSystem } from './strategy/alert-system.js';
export { PluginRegistry } from './extensibility/plugin-registry.js';
export { PluginManager } from './extensibility/plugin-manager.js';
