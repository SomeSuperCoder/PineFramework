import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BacktestResults } from '../components/BacktestResults';
import type { BacktestResultResponse, EquityPoint } from '../types';

/**
 * Focused regression tests for the Recharts EquityDrawdownChart swap
 * (hand-rolled canvas → shadcn ChartContainer + Recharts LineChart).
 *
 * The host Card "Equity & Drawdown" always renders; only the inner chart is
 * gated by the `equityPoints.length < 2` guard. These tests lock:
 *   1. chart actually mounts given >= 2 points (the swap's core deliverable),
 *   2. < 2 points renders no chart AND the popup content does not crash.
 * Boundary is covered by the first test using exactly 2 points.
 */

function makeResult(equityPoints: EquityPoint[]): BacktestResultResponse {
  return {
    metrics: {
      totalTrades: 30,
      winningTrades: 20,
      losingTrades: 10,
      winRate: 65,
      profitFactor: 2.61,
      totalPnl: 1234.56,
      totalPnlPercent: 12.35,
      maxDrawdown: 500,
      maxDrawdownPercent: 5,
      sharpeRatio: 1.5,
      sortinoRatio: 2.0,
      averageWin: 100,
      averageLoss: 76.5,
      largestWin: 250,
      largestLoss: -150,
      averageTradeDuration: 3.5,
      commission: 45.2,
    },
    equityCurve: [],
    drawdownCurve: [],
    trades: [],
    orders: [],
    equityPoints,
    monthlyReturns: {},
    buyHoldReturn: 0,
  };
}

const TWO_POINTS: EquityPoint[] = [
  { time: 0, equity: 10000, drawdown: 0, balance: 10000 },
  { time: 1, equity: 10500, drawdown: 0, balance: 10500 },
];

describe('EquityDrawdownChart (Recharts swap regression)', () => {
  it('mounts the Recharts chart when there are 2+ equity points', () => {
    const { container } = render(
      <BacktestResults result={makeResult(TWO_POINTS)} />,
    );

    // Host card is present.
    expect(screen.getByText('Equity & Drawdown')).toBeInTheDocument();
    // The swap's deliverable: a Recharts ResponsiveContainer mounted.
    // (jsdom measures 0x0, so the svg surface is skipped by recharts itself;
    // the wrapper div is the dimension-independent marker that the chart
    // actually rendered.)
    expect(container.querySelector('.recharts-responsive-container')).not.toBeNull();
  });

  it('renders no chart and does not crash when <2 equity points (guard)', () => {
    const { container } = render(
      <BacktestResults
        result={makeResult([
          { time: 0, equity: 10000, drawdown: 0, balance: 10000 },
        ])}
      />,
    );

    // Guard: < 2 points → chart returns null → no Recharts mounted.
    expect(container.querySelector('.recharts-responsive-container')).toBeNull();
    // Wrapper + popup content intact — no crash.
    expect(screen.getByText('Equity & Drawdown')).toBeInTheDocument();
    expect(screen.getByText('Net Profit')).toBeInTheDocument();
  });
});
