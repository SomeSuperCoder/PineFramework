import type { Bar } from '../data/bar.js';
import {
  StrategyEngine,
  type StrategyConfig,
  type StrategyMetrics,
  type Trade,
  type FilledOrder,
  DEFAULT_STRATEGY_CONFIG,
} from './strategy-engine.js';

export interface EquityPoint {
  time: number;
  equity: number;
  drawdown: number;
  balance: number;
}

export interface BacktestResult {
  metrics: StrategyMetrics;
  trades: Trade[];
  filledOrders: FilledOrder[];
  equityCurve: number[];
  drawdownCurve: number[];
  equityPoints: EquityPoint[];
  positions: Array<{
    barIndex: number;
    direction: string;
    quantity: number;
    avgPrice: number;
    pnl: number;
  }>;
  monthlyReturns: Record<string, number>;
  buyHoldReturn: number;
  config: BacktestConfig;
}

export interface BacktestConfig extends StrategyConfig {
  startDate?: number;
  endDate?: number;
  barMagnifier?: string;
  subBars?: Bar[];
}

export class BacktestEngine {
  private config: BacktestConfig;

  constructor(config: Partial<BacktestConfig> = {}) {
    this.config = {
      ...DEFAULT_STRATEGY_CONFIG,
      defaultQty: 1,
      defaultQtyType: 'contracts',
      ...config,
    };
  }

  run(
    bars: Bar[],
    strategyFn: (engine: StrategyEngine, bar: Bar, index: number) => void,
  ): BacktestResult {
    const engine = new StrategyEngine(this.config);
    const equityCurve: number[] = [];
    const drawdownCurve: number[] = [];
    const equityPoints: EquityPoint[] = [];
    const positions: Array<{
      barIndex: number;
      direction: string;
      quantity: number;
      avgPrice: number;
      pnl: number;
    }> = [];

    let filteredBars = bars;

    if (this.config.startDate !== undefined) {
      const startDate = this.config.startDate;
      filteredBars = filteredBars.filter((b) => b.timestamp >= startDate);
    }
    if (this.config.endDate !== undefined) {
      const endDate = this.config.endDate;
      filteredBars = filteredBars.filter((b) => b.timestamp <= endDate);
    }

    const subBarMap = this.buildSubBarMap(filteredBars);

    for (let i = 0; i < filteredBars.length; i++) {
      const bar = filteredBars[i]!;

      const subBars = subBarMap.get(i) ?? undefined;
      if (subBars && subBars.length > 0) {
        this.processWithIntrabarMagnification(engine, bar, i, subBars, strategyFn);
      } else {
        engine.updateBar(i, bar.timestamp, bar.open, bar.high, bar.low, bar.close, bar.volume);
        strategyFn(engine, bar, i);
      }

      const position = engine.getPosition();
      const account = engine.getAccount();
      positions.push({
        barIndex: i,
        direction: position.direction,
        quantity: position.quantity,
        avgPrice: position.avgPrice,
        pnl: position.pnl,
      });

      equityCurve.push(account.equity);
      drawdownCurve.push(engine.getMaxDrawdown());
      equityPoints.push({
        time: bar.timestamp,
        equity: account.equity,
        drawdown: engine.getMaxDrawdown(),
        balance: account.balance,
      });
    }

    const monthlyReturns = this.computeMonthlyReturns(equityPoints);
    const buyHoldReturn = this.computeBuyHoldReturn(filteredBars);

    return {
      metrics: engine.getMetrics(),
      trades: engine.getTrades(),
      filledOrders: engine.getFilledOrders(),
      equityCurve,
      drawdownCurve,
      equityPoints,
      positions,
      monthlyReturns,
      buyHoldReturn,
      config: { ...this.config },
    };
  }

  private buildSubBarMap(bars: Bar[]): Map<number, Bar[]> {
    const map = new Map<number, Bar[]>();
    if (!this.config.barMagnifier || !this.config.subBars) return map;

    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i]!;
      const matching = this.config.subBars.filter(
        (sb) =>
          sb.timestamp >= bar.timestamp &&
          (i === bars.length - 1 || sb.timestamp < bars[i + 1]!.timestamp),
      );
      if (matching.length > 0) {
        map.set(i, matching);
      }
    }

    return map;
  }

  private processWithIntrabarMagnification(
    engine: StrategyEngine,
    mainBar: Bar,
    barIndex: number,
    subBars: Bar[],
    strategyFn: (engine: StrategyEngine, bar: Bar, index: number) => void,
  ): void {
    let lastSubIndex = 0;
    for (const subBar of subBars) {
      engine.updateBar(
        barIndex,
        subBar.timestamp,
        subBar.open,
        subBar.high,
        subBar.low,
        subBar.close,
        subBar.volume,
      );
      strategyFn(engine, subBar, barIndex);
      lastSubIndex++;
    }

    if (lastSubIndex === subBars.length) {
      const finalSub = subBars[subBars.length - 1]!;
      engine.updateBar(
        barIndex,
        mainBar.timestamp,
        finalSub.open,
        Math.max(finalSub.high, mainBar.high),
        Math.min(finalSub.low, mainBar.low),
        mainBar.close,
        mainBar.volume,
      );
    }
  }

  private computeMonthlyReturns(points: EquityPoint[]): Record<string, number> {
    const monthly: Record<string, number> = {};
    if (points.length < 2) return monthly;

    const startEquity = points[0]!.equity;

    // Track all months in the range
    const firstDate = new Date(points[0]!.time);
    const lastDate = new Date(points[points.length - 1]!.time);
    const startYear = firstDate.getFullYear();
    const startMonth = firstDate.getMonth();
    const endYear = lastDate.getFullYear();
    const endMonth = lastDate.getMonth();

    // Fill all months in range with 0% return initially
    for (let year = startYear; year <= endYear; year++) {
      const startM = year === startYear ? startMonth : 0;
      const endM = year === endYear ? endMonth : 11;
      for (let month = startM; month <= endM; month++) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}`;
        monthly[key] = 0;
      }
    }

    // Now compute actual returns for months that have data
    let lastRecordedEquity = startEquity;
    for (const point of points) {
      const date = new Date(point.time);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      // Only update if this is the first data point for this month
      if (monthly[key] === 0 && point.equity !== lastRecordedEquity) {
        monthly[key] =
          lastRecordedEquity > 0
            ? ((point.equity - lastRecordedEquity) / lastRecordedEquity) * 100
            : 0;
        lastRecordedEquity = point.equity;
      }
    }

    return monthly;
  }

  private computeBuyHoldReturn(bars: Bar[]): number {
    if (bars.length < 2) return 0;
    // Buy at first bar open, sell at last bar close (matching market order buy-and-hold)
    const firstOpen = bars[0]!.open;
    const lastClose = bars[bars.length - 1]!.close;
    return firstOpen > 0 ? ((lastClose - firstOpen) / firstOpen) * 100 : 0;
  }

  runWithOHLCV(
    bars: Bar[],
    strategyFn: (engine: StrategyEngine, bar: Bar, index: number) => void,
  ): BacktestResult {
    return this.run(bars, strategyFn);
  }

  static compareResults(
    result1: BacktestResult,
    result2: BacktestResult,
  ): {
    metricsMatch: boolean;
    tradeCountMatch: boolean;
    pnlDifference: number;
    maxDrawdownDifference: number;
  } {
    const metricsMatch =
      Math.abs(result1.metrics.totalPnl - result2.metrics.totalPnl) < 0.01 &&
      Math.abs(result1.metrics.maxDrawdown - result2.metrics.maxDrawdown) < 0.01 &&
      Math.abs(result1.metrics.winRate - result2.metrics.winRate) < 0.01;

    return {
      metricsMatch,
      tradeCountMatch: result1.metrics.totalTrades === result2.metrics.totalTrades,
      pnlDifference: Math.abs(result1.metrics.totalPnl - result2.metrics.totalPnl),
      maxDrawdownDifference: Math.abs(result1.metrics.maxDrawdown - result2.metrics.maxDrawdown),
    };
  }

  static generateReport(result: BacktestResult): string {
    const lines: string[] = [];
    const m = result.metrics;

    lines.push('=== Strategy Backtest Report ===');
    lines.push('');
    lines.push(`Total Trades: ${m.totalTrades}`);
    lines.push(`Winning Trades: ${m.winningTrades}`);
    lines.push(`Losing Trades: ${m.losingTrades}`);
    lines.push(`Win Rate: ${m.winRate.toFixed(2)}%`);
    lines.push('');
    lines.push(`Total PnL: $${m.totalPnl.toFixed(2)}`);
    lines.push(`Total PnL %: ${m.totalPnlPercent.toFixed(2)}%`);
    lines.push(`Profit Factor: ${m.profitFactor.toFixed(2)}`);
    lines.push('');
    lines.push(`Max Drawdown: $${m.maxDrawdown.toFixed(2)}`);
    lines.push(`Max Drawdown %: ${m.maxDrawdownPercent.toFixed(2)}%`);
    lines.push('');
    lines.push(`Sharpe Ratio: ${m.sharpeRatio.toFixed(2)}`);
    lines.push(`Sortino Ratio: ${m.sortinoRatio.toFixed(2)}`);
    lines.push('');
    lines.push(`Average Win: $${m.averageWin.toFixed(2)}`);
    lines.push(`Average Loss: $${m.averageLoss.toFixed(2)}`);
    lines.push(`Largest Win: $${m.largestWin.toFixed(2)}`);
    lines.push(`Largest Loss: $${m.largestLoss.toFixed(2)}`);
    lines.push('');
    lines.push(`Total Commission: $${m.commission.toFixed(2)}`);
    lines.push(`Average Trade Duration: ${m.averageTradeDuration.toFixed(1)} bars`);
    lines.push('');

    if (result.trades.length > 0) {
      lines.push('=== Trade List ===');
      for (const trade of result.trades) {
        const pnlStr =
          trade.pnl >= 0 ? `+$${trade.pnl.toFixed(2)}` : `-$${Math.abs(trade.pnl).toFixed(2)}`;
        lines.push(
          `#${trade.id} ${trade.direction} ${trade.quantity} @ $${trade.entryPrice.toFixed(2)} -> $${trade.exitPrice.toFixed(2)} | PnL: ${pnlStr}`,
        );
      }
    }

    return lines.join('\n');
  }
}
