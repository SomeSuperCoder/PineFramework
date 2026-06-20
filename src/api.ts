import { parse, type ParseResult } from './language/parser/index.js';
import { compile, type CompileResult } from './language/compiler/index.js';
import { ExecutionEngine, type ExecutionContext, type ExecutionResult } from './language/runtime/execution-engine.js';
import { createSeries } from './language/runtime/series.js';
import { DataEngine, type DataEngineOptions } from './data/data-engine.js';
import { RequestSystem } from './data/request-system.js';
import { PlotEngine } from './rendering/plot-engine.js';
import { DrawingEngine } from './rendering/drawing-engine.js';
import { StrategyEngine, type StrategyConfig } from './strategy/strategy-engine.js';
import { BacktestEngine, type BacktestConfig } from './strategy/backtest-engine.js';
import { AlertSystem } from './strategy/alert-system.js';
import { PluginRegistry } from './extensibility/plugin-registry.js';
import { PluginManager } from './extensibility/plugin-manager.js';
import type { Bar } from './data/bar.js';

export interface PineScriptEngine {
  parse(source: string): ParseResult;
  compile(source: string): CompileResult;
  execute(source: string, bars: Bar[]): ExecutionResult;
  createDataEngine(options?: DataEngineOptions): DataEngine;
  createRequestSystem(dataEngine: DataEngine): RequestSystem;
  createStrategyEngine(config?: Partial<StrategyConfig>): StrategyEngine;
  createBacktestEngine(config?: Partial<BacktestConfig>): BacktestEngine;
  createAlertSystem(): AlertSystem;
  createPlotEngine(): PlotEngine;
  createDrawingEngine(): DrawingEngine;
  createPluginRegistry(): PluginRegistry;
  createPluginManager(): PluginManager;
}

export function createPineScriptEngine(): PineScriptEngine {
  return {
    parse(source: string): ParseResult {
      return parse(source);
    },

    compile(source: string): CompileResult {
      const result = parse(source);
      return compile(result.ast);
    },

    execute(source: string, bars: Bar[]): ExecutionResult {
      const result = parse(source);
      const compileResult = compile(result.ast);
      const engine = new ExecutionEngine(compileResult);
      const contexts = barsToContexts(bars);
      return engine.executeBars(contexts);
    },

    createDataEngine(options?: DataEngineOptions): DataEngine {
      return new DataEngine(options);
    },

    createRequestSystem(dataEngine: DataEngine): RequestSystem {
      return new RequestSystem(dataEngine);
    },

    createStrategyEngine(config?: Partial<StrategyConfig>): StrategyEngine {
      return new StrategyEngine(config);
    },

    createBacktestEngine(config?: Partial<BacktestConfig>): BacktestEngine {
      return new BacktestEngine(config);
    },

    createAlertSystem(): AlertSystem {
      return new AlertSystem();
    },

    createPlotEngine(): PlotEngine {
      return new PlotEngine();
    },

    createDrawingEngine(): DrawingEngine {
      return new DrawingEngine();
    },

    createPluginRegistry(): PluginRegistry {
      return new PluginRegistry();
    },

    createPluginManager(): PluginManager {
      return new PluginManager();
    },
  };
}

export function barsToContexts(bars: Bar[]): ExecutionContext[] {
  return bars.map((bar, index) => ({
    barIndex: index,
    barCount: bars.length,
    timestamp: bar.timestamp,
    open: createSeries('open', [bar.open]),
    high: createSeries('high', [bar.high]),
    low: createSeries('low', [bar.low]),
    close: createSeries('close', [bar.close]),
    volume: createSeries('volume', [bar.volume]),
  }));
}

export function createBars(
  count: number,
  startPrice: number = 100,
  startTime: number = Date.now(),
): Bar[] {
  const bars: Bar[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const open = price;
    const change = (Math.random() - 0.5) * 10;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * 5;
    const low = Math.min(open, close) - Math.random() * 5;

    bars.push({
      timestamp: startTime + i * 86400000,
      open,
      high,
      low,
      close,
      volume: Math.floor(Math.random() * 10000) + 1000,
    });

    price = close;
  }

  return bars;
}

export function executePineScript(source: string, bars: Bar[]): {
  success: boolean;
  error?: string;
  outputs: Map<string, import('./language/runtime/series.js').Series>;
  metrics: import('./language/runtime/execution-engine.js').ExecutionMetrics;
} {
  const result = parse(source);
  const compileResult = compile(result.ast);
  const engine = new ExecutionEngine(compileResult);
  const contexts = barsToContexts(bars);
  const execResult = engine.executeBars(contexts);

  return {
    success: execResult.success,
    error: execResult.error,
    outputs: execResult.outputs,
    metrics: engine.getMetrics(),
  };
}

export function backtestStrategy(
  _source: string,
  bars: Bar[],
  strategyFn: (engine: StrategyEngine, bar: Bar, index: number) => void,
  config?: Partial<BacktestConfig>,
): import('./strategy/backtest-engine.js').BacktestResult {
  const backtestEngine = new BacktestEngine(config);
  return backtestEngine.run(bars, strategyFn);
}
