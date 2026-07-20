import {
  parse,
  compile,
  ExecutionEngine,
  createSeries,
  type Bar,
  type StrategyConfig,
  type ExecutionResult,
  type Trade,
  type FilledOrder,
  type StrategyMetrics,
} from 'pine-framework';

export interface BacktestRunnerOptions {
  script: string;
  bars: Bar[];
  configOverride?: Partial<StrategyConfig>;
}

export interface BacktestRunnerResult {
  success: boolean;
  error?: string;
  execResult?: ExecutionResult;
  /** The ExecutionEngine after executeBars — call getStrategyEngine() for trades/metrics. */
  engine?: ExecutionEngine;
}

/**
 * Shared backtest pipeline used by both the HTTP API and the CLI.
 *
 * 1. Parses and compiles the Pine Script source.
 * 2. Creates per-bar execution contexts (O(n) memory — each context only
 *    holds the current bar's OHLCV because the engine uses the last value).
 * 3. Executes all bars.
 *
 * Returns the raw execution result plus pre-computed contexts for
 * callers that need them (e.g. CLI).
 */
export function runBacktestPipeline(options: BacktestRunnerOptions): BacktestRunnerResult {
  const { script, bars } = options;

  if (!script || script.trim().length === 0) {
    return { success: false, error: 'No Pine Script source provided' };
  }

  if (bars.length === 0) {
    return { success: false, error: 'No bar data available' };
  }

  if (bars.length > 1500) {
    return {
      success: false,
      error: `Too many bars (${bars.length}). Maximum is 1500. Use a shorter date range or larger timeframe.`,
    };
  }

  // Parse & compile
  let parseResult;
  try {
    parseResult = parse(script);
  } catch (err) {
    return { success: false, error: `Parse error: ${err instanceof Error ? err.message : String(err)}` };
  }

  let compileResult;
  try {
    compileResult = compile(parseResult.ast);
  } catch (err) {
    return { success: false, error: `Compile error: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (compileResult.ir.scriptKind !== 'strategy') {
    return {
      success: false,
      error: 'Script must be a strategy (use strategy() instead of indicator() or library())',
    };
  }

  // Create engine
  const execEngine = new ExecutionEngine(compileResult, options.configOverride);

  // Build contexts — each context only needs the current bar's OHLCV since
  // executeBar uses getRelative(0) (the last element).
  const contexts = bars.map((bar, i) => ({
    barIndex: i,
    barCount: bars.length,
    timestamp: bar.timestamp,
    open: createSeries('open', [bar.open]),
    high: createSeries('high', [bar.high]),
    low: createSeries('low', [bar.low]),
    close: createSeries('close', [bar.close]),
    volume: createSeries('volume', [bar.volume]),
  }));

  // Execute
  const execResult = execEngine.executeBars(contexts);
  if (!execResult.success) {
    return { success: false, error: execResult.error || 'Execution failed' };
  }

  return { success: true, execResult, engine: execEngine };
}

/**
 * Compute common backtest metrics from a successful execution result.
 */
export function computeBacktestMetrics(
  bars: Bar[],
  execEngine: ExecutionEngine,
): {
  trades: Trade[];
  metrics: StrategyMetrics;
  filledOrders: FilledOrder[];
  equityCurve: number[];
  drawdownCurve: number[];
  equityPoints: Array<{ time: number; equity: number; drawdown: number; balance: number }>;
  monthlyReturns: Record<string, number>;
  buyHoldReturn: number;
} | null {
  const strategyEngine = execEngine.getStrategyEngine();
  if (!strategyEngine) return null;

  const trades = strategyEngine.getTrades();
  const metrics = strategyEngine.getMetrics();
  const filledOrders = strategyEngine.getFilledOrders();

  const initialCapital = strategyEngine.getConfig().initialCapital;
  const equityCurve = buildEquityCurve(initialCapital, trades);
  const drawdownCurve = buildDrawdownCurve(equityCurve);
  const equityPoints = buildEquityPoints(bars, equityCurve, drawdownCurve);
  const monthlyReturns = computeMonthlyReturns(equityPoints);
  const buyHoldReturn =
    bars.length >= 2
      ? ((bars[bars.length - 1]!.close - bars[0]!.close) / bars[0]!.close) * 100
      : 0;

  return {
    trades,
    metrics,
    filledOrders,
    equityCurve,
    drawdownCurve,
    equityPoints,
    monthlyReturns,
    buyHoldReturn,
  };
}

// ── Helpers (extracted from backtest.ts) ──

function buildEquityCurve(initialCapital: number, trades: Array<{ pnl: number }>): number[] {
  const curve: number[] = [initialCapital];
  let equity = initialCapital;
  for (const trade of trades) {
    equity += trade.pnl;
    curve.push(equity);
  }
  return curve;
}

function buildDrawdownCurve(equityCurve: number[]): number[] {
  const curve: number[] = [];
  let peak = -Infinity;
  for (const eq of equityCurve) {
    if (eq > peak) peak = eq;
    curve.push(peak - eq);
  }
  return curve;
}

function buildEquityPoints(
  bars: Array<{ timestamp: number }>,
  equityCurve: number[],
  drawdownCurve: number[],
): Array<{ time: number; equity: number; drawdown: number; balance: number }> {
  const points: Array<{ time: number; equity: number; drawdown: number; balance: number }> = [];
  const len = Math.min(bars.length, equityCurve.length);
  for (let i = 0; i < len; i++) {
    points.push({
      time: bars[i]!.timestamp,
      equity: equityCurve[i] ?? 0,
      drawdown: drawdownCurve[i] ?? 0,
      balance: equityCurve[i] ?? 0,
    });
  }
  return points;
}

function computeMonthlyReturns(
  points: Array<{ time: number; equity: number }>,
): Record<string, number> {
  const monthly: Record<string, number> = {};
  if (points.length < 2) return monthly;
  let prevMonthEquity = points[0]!.equity;
  for (const point of points) {
    const date = new Date(point.time);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthly[key]) {
      monthly[key] =
        prevMonthEquity > 0
          ? Math.round(((point.equity - prevMonthEquity) / prevMonthEquity) * 10000) / 100
          : 0;
      prevMonthEquity = point.equity;
    }
  }
  return monthly;
}
