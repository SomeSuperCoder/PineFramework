import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BacktestResults } from '../components/BacktestResults';
import { YAxis } from 'recharts';
import type { BacktestResultResponse, EquityPoint } from '../types';

// Call-through spy on YAxis so tests can assert the domain props the
// production chart passes. jsdom measures 0x0, so recharts itself skips
// rendering the axis DOM — DOM tick assertions would be impossible here.
// NOTE: recharts v3 exports YAxis as a forwardRef OBJECT, not a function —
// so we wrap it in a recordable function that delegates to the real
// component. The delegation preserves the real render (existing chart-mount
// tests depend on it).
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  const React = await import('react');
  return {
    ...actual,
    YAxis: vi.fn((props: React.ComponentProps<typeof actual.YAxis>) =>
      React.createElement(
        actual.YAxis as React.ComponentType<typeof props>,
        props,
      ),
    ),
  };
});

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
    barCount: equityPoints.length,
    effectiveConfig: {
      initialCapital: 10000,
      commission: 0,
      slippage: 0,
      commissionType: 'percent',
      slippageType: 'ticks',
      defaultQty: 20,
      defaultQtyType: 'percent_of_equity',
      pyramiding: 0,
      calcOnOrderFills: true,
      calcOnEveryTick: false,
      processOrdersOnClose: false,
      maxBarsBack: 0,
      marginLong: 0,
      marginShort: 0,
      currency: 'USD',
      marketFillPrice: 'open',
    },
    warnings: [],
  };
}

const TWO_POINTS: EquityPoint[] = [
  { time: 0, equity: 10000, drawdown: 0, balance: 10000 },
  { time: 1, equity: 10500, drawdown: 0, balance: 10500 },
];

// Realistic small-range payload: equity wiggles only ±0.1% around 10000 —
// exactly the shape that rendered as a ~4px flat line under a [0, auto] axis.
const TINY_RANGE_POINTS: EquityPoint[] = [
  { time: 1700151200000, equity: 10000, drawdown: 0, balance: 10000 },
  { time: 1700255600000, equity: 10005, drawdown: 120, balance: 10005 },
  { time: 1700363600000, equity: 10010, drawdown: 175, balance: 10010 },
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

  it('keeps both Y axes zoomed to their series (regression: [0, auto] flattens ±0.1% equity)', () => {
    render(<BacktestResults result={makeResult(TINY_RANGE_POINTS)} />);

    const yAxisProps = vi.mocked(YAxis).mock.calls.map(
      (call) => call[0] as { yAxisId?: string; domain?: unknown },
    );

    // The whole point of the fix: the equity axis zooms to ±10 around the data
    // instead of [0, auto], which rendered a 9965→10194 (±2.28%) curve as a
    // ~4.5px flat line. Losing this domain reverts the reported bug.
    const equityAxis = yAxisProps.find((p) => p.yAxisId === 'equity');
    expect(equityAxis?.domain).toEqual(['dataMin - 10', 'dataMax + 10']);

    // Drawdown (0–175, ~1.7% of the equity scale) gets its own right axis so
    // it no longer hugs 0.
    const ddAxis = yAxisProps.find((p) => p.yAxisId === 'dd');
    expect(ddAxis?.domain).toEqual([0, 'dataMax + 10']);
  });
});
