import type { Bar } from '../data/bar.js';
import {
  StrategyEngine,
  type StrategyConfig,
  type StrategyMetrics,
  type Trade,
  type FilledOrder,
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
      initialCapital: 10000,
      commission: 0,
      slippage: 0,
      commissionType: 'percent',
      slippageType: 'ticks',
      defaultQty: 1,
      defaultQtyType: 'contracts',
      pyramiding: 0,
      calcOnOrderFills: true,
      calcOnEveryTick: false,
      processOrdersOnClose: false,
      maxBarsBack: 0,
      marginLong: 0,
      marginShort: 0,
      currency: 'USD',
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
      filteredBars = filteredBars.filter((b) => b.timestamp >= this.config.startDate!);
    }
    if (this.config.endDate !== undefined) {
      filteredBars = filteredBars.filter((b) => b.timestamp <= this.config.endDate!);
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
    let prevMonthEquity = startEquity;

    for (const point of points) {
      const date = new Date(point.time);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthly[key]) {
        monthly[key] =
          prevMonthEquity > 0 ? ((point.equity - prevMonthEquity) / prevMonthEquity) * 100 : 0;
        prevMonthEquity = point.equity;
      }
    }

    return monthly;
  }

  private computeBuyHoldReturn(bars: Bar[]): number {
    if (bars.length < 2) return 0;
    const firstClose = bars[0]!.close;
    const lastClose = bars[bars.length - 1]!.close;
    return firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0;
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
