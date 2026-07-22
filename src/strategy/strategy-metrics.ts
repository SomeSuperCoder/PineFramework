/**
 * Strategy metrics calculation.
 * Pure function computing performance metrics from a list of trades.
 */
import { TRADING_DAYS_PER_YEAR, STD_EPSILON, type Trade, type StrategyMetrics } from './strategy-types.js';

export function computeMetrics(trades: Trade[], peakEquity: number, maxDrawdown: number, initialCapital: number): StrategyMetrics {
  const winningTrades = trades.filter((t) => t.pnl > 0);
  const losingTrades = trades.filter((t) => t.pnl <= 0);

  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const totalCommission = trades.reduce((sum, t) => sum + t.commission, 0);

  const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));

  const avgWin = winningTrades.length > 0 ? grossProfit / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;

  const returns = trades.map((t) => t.pnlPercent / 100);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdReturn =
    returns.length > 1
      ? Math.sqrt(
          returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1),
        )
      : 0;

  const downsideReturns = returns.filter((r) => r < 0);
  const downsideDev =
    downsideReturns.length > 1
      ? Math.sqrt(
          downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length,
        )
      : 0;

  return {
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    totalPnl,
    totalPnlPercent:
      initialCapital > 0 ? (totalPnl / initialCapital) * 100 : 0,
    maxDrawdown,
    maxDrawdownPercent: peakEquity > 0 ? (maxDrawdown / peakEquity) * 100 : 0,
    sharpeRatio: stdReturn > STD_EPSILON ? (avgReturn / stdReturn) * Math.sqrt(TRADING_DAYS_PER_YEAR) : 0,
    sortinoRatio: downsideDev > STD_EPSILON ? (avgReturn / downsideDev) * Math.sqrt(TRADING_DAYS_PER_YEAR) : 0,
    averageWin: avgWin,
    averageLoss: avgLoss,
    largestWin: winningTrades.length > 0 ? Math.max(...winningTrades.map((t) => t.pnl)) : 0,
    largestLoss: losingTrades.length > 0 ? Math.min(...losingTrades.map((t) => t.pnl)) : 0,
    averageTradeDuration:
      trades.length > 0
        ? trades.reduce((sum, t) => sum + (t.exitBarIndex - t.entryBarIndex), 0) / trades.length
        : 0,
    commission: totalCommission,
  };
}
