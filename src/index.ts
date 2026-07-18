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
export * from './api.js';

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

import { parse as parseSource } from './language/parser/index.js';
import { compile as compileSource } from './language/compiler/index.js';
import { ExecutionEngine as ExecutionEngineImpl } from './language/runtime/execution-engine.js';
import { DataEngine as DataEngineImpl } from './data/data-engine.js';
import { RequestSystem as RequestSystemImpl } from './data/request-system.js';
import type { Bar } from './data/bar.js';
import { createSeries } from './language/runtime/series.js';

export function parseAndCompile(source: string) {
  const { ast } = parseSource(source);
  return compileSource(ast);
}

export function executeScript(
  source: string,
  bars: import('./language/runtime/execution-engine.js').ExecutionContext[],
) {
  const result = parseAndCompile(source);
  const engine = new ExecutionEngineImpl(result);
  return engine.executeBars(bars);
}

export function createDataEngine(
  options?: import('./data/data-engine.js').DataEngineOptions,
): DataEngineImpl {
  return new DataEngineImpl(options);
}

export function createRequestSystem(
  dataEngine: DataEngineImpl,
  maxCacheAge?: number,
): RequestSystemImpl {
  return new RequestSystemImpl(dataEngine, maxCacheAge);
}

export function barsToContext(
  bars: Bar[],
): import('./language/runtime/execution-engine.js').ExecutionContext[] {
  return bars.map((bar, index) => ({
    barIndex: index,
    barCount: bars.length,
    timestamp: bar.timestamp,
    open: createSeries(
      'open',
      bars.slice(0, index + 1).map((b) => b.open),
    ),
    high: createSeries(
      'high',
      bars.slice(0, index + 1).map((b) => b.high),
    ),
    low: createSeries(
      'low',
      bars.slice(0, index + 1).map((b) => b.low),
    ),
    close: createSeries(
      'close',
      bars.slice(0, index + 1).map((b) => b.close),
    ),
    volume: createSeries(
      'volume',
      bars.slice(0, index + 1).map((b) => b.volume),
    ),
  }));
}
