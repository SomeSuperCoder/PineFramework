import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrategyResultsPopup } from '../components/StrategyResultsPopup';
import { BacktestSettingsPopup } from '../components/BacktestSettingsPopup';
import { BacktestResults } from '../components/BacktestResults';
import { extractStrategyParams } from '../utils/extractStrategyParams';
import type { BacktestResultResponse } from '../types';

const STRATEGY_SOURCE = `//@version=6
strategy("Test Strategy", overlay=true, initial_capital=10000, commission_value=0.1, pyramiding=2)
plot(close)`;

const MOCK_METRICS = {
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
  commission: 45.20,
};

const MOCK_TRADES = [
  {
    id: 'trade-1',
    entryTime: 1704067200000,
    entryPrice: 100,
    exitTime: 1704499200000,
    exitPrice: 110,
    pnl: 1000,
    pnlPercent: 10,
    direction: 'long',
    quantity: 10,
    commission: 5,
    entryName: 'Strategy1',
    exitName: 'Strategy1',
    mae: -2.5,
    mfe: 12.3,
    barsHeld: 5,
  },
  {
    id: 'trade-2',
    entryTime: 1704844800000,
    entryPrice: 110,
    exitTime: 1705276800000,
    exitPrice: 105,
    pnl: -500,
    pnlPercent: -4.55,
    direction: 'short',
    quantity: 10,
    commission: 5,
    entryName: 'Strategy1',
    exitName: 'Strategy1',
    mae: -3.1,
    mfe: 5.2,
    barsHeld: 5,
  },
];

const MOCK_RESULT: BacktestResultResponse = {
  metrics: MOCK_METRICS,
  equityCurve: [10000, 10500, 11000, 10800, 11234.56],
  drawdownCurve: [0, 0, 0, 1.8, 0],
  trades: MOCK_TRADES,
  orders: [],
  equityPoints: [
    { time: 0, equity: 10000, drawdown: 0, balance: 10000 },
    { time: 1, equity: 10500, drawdown: 0, balance: 10500 },
    { time: 2, equity: 11000, drawdown: 0, balance: 11000 },
    { time: 3, equity: 10800, drawdown: 1.8, balance: 10800 },
    { time: 4, equity: 11234.56, drawdown: 0, balance: 11234.56 },
  ],
  monthlyReturns: {},
  buyHoldReturn: 0.12,
};

describe('Backtest Flow Integration', () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch { /* jsdom no localStorage */ }
  });

  afterEach(() => {
    try { localStorage.clear(); } catch { /* jsdom no localStorage */ }
  });

  describe('extractStrategyParams', () => {
    it('extracts initial_capital from strategy declaration', () => {
      const params = extractStrategyParams(STRATEGY_SOURCE);
      expect(params.initialCapital).toBe(10000);
    });

    it('extracts commission_value from strategy declaration', () => {
      const params = extractStrategyParams(STRATEGY_SOURCE);
      expect(params.commission).toBe(0.1);
    });

    it('extracts pyramiding from strategy declaration', () => {
      const params = extractStrategyParams(STRATEGY_SOURCE);
      expect(params.pyramiding).toBe(2);
    });

    it('returns empty object for non-strategy source', () => {
      const params = extractStrategyParams('indicator("Test")');
      expect(params).toEqual({});
    });
  });

  describe('BacktestSettingsPopup', () => {
    it('does not render when isOpen is false', () => {
      render(
        <BacktestSettingsPopup
          isOpen={false}
          onClose={vi.fn()}
          onRun={vi.fn()}
          scriptSource={STRATEGY_SOURCE}
        />
      );
      expect(screen.queryByText('Backtest Settings')).not.toBeInTheDocument();
    });

    it('renders settings when opened', () => {
      render(
        <BacktestSettingsPopup
          isOpen={true}
          onClose={vi.fn()}
          onRun={vi.fn()}
          scriptSource={STRATEGY_SOURCE}
        />
      );
      expect(screen.getByText('Backtest Settings')).toBeInTheDocument();
      expect(screen.getByText('Run Backtest')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('pre-populates settings from strategy declaration', () => {
      render(
        <BacktestSettingsPopup
          isOpen={true}
          onClose={vi.fn()}
          onRun={vi.fn()}
          scriptSource={STRATEGY_SOURCE}
        />
      );
      const inputs = document.querySelectorAll('input[type="number"]');
      expect(inputs.length).toBeGreaterThan(0);
    });

    it('calls onRun with config when Run Backtest is clicked', async () => {
      const onRun = vi.fn();
      render(
        <BacktestSettingsPopup
          isOpen={true}
          onClose={vi.fn()}
          onRun={onRun}
          scriptSource={STRATEGY_SOURCE}
        />
      );

      const runButton = screen.getByText('Run Backtest');
      await userEvent.click(runButton);

      expect(onRun).toHaveBeenCalledTimes(1);
      const [config] = onRun.mock.calls[0];
      expect(config.initialCapital).toBe(10000);
      expect(config.commission).toBe(0.1);
      expect(config.pyramiding).toBe(2);
    });

    it('calls onClose when Cancel is clicked', async () => {
      const onClose = vi.fn();
      render(
        <BacktestSettingsPopup
          isOpen={true}
          onClose={onClose}
          onRun={vi.fn()}
          scriptSource={STRATEGY_SOURCE}
        />
      );

      const cancelButton = screen.getByText('Cancel');
      await userEvent.click(cancelButton);

      expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose when ✕ is clicked', async () => {
      const onClose = vi.fn();
      render(
        <BacktestSettingsPopup
          isOpen={true}
          onClose={onClose}
          onRun={vi.fn()}
          scriptSource={STRATEGY_SOURCE}
        />
      );

      const closeButton = screen.getByText('✕');
      await userEvent.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });

    it('shows days back input by default', () => {
      render(
        <BacktestSettingsPopup
          isOpen={true}
          onClose={vi.fn()}
          onRun={vi.fn()}
          scriptSource={STRATEGY_SOURCE}
        />
      );

      expect(screen.getByText('Days Back')).toBeInTheDocument();
      expect(screen.getByText('days back from today')).toBeInTheDocument();
    });

    it('converts days back to start/end dates on run', async () => {
      const onRun = vi.fn();
      render(
        <BacktestSettingsPopup
          isOpen={true}
          onClose={vi.fn()}
          onRun={onRun}
          scriptSource={STRATEGY_SOURCE}
        />
      );

      const runButton = screen.getByText('Run Backtest');
      await userEvent.click(runButton);

      const [, startDate, endDate] = onRun.mock.calls[0];
      expect(startDate).toBeDefined();
      expect(endDate).toBeDefined();
      expect(new Date(endDate).getTime()).toBeLessThanOrEqual(Date.now());
      expect(new Date(startDate).getTime()).toBeLessThan(new Date(endDate).getTime());
    });
  });

  describe('StrategyResultsPopup', () => {
    it('does not render when isOpen is false', () => {
      render(
        <StrategyResultsPopup
          isOpen={false}
          onClose={vi.fn()}
          onOpenSettings={vi.fn()}
          status={null}
          progress={0}
          phase=""
          result={null}
          error={null}
        />
      );
      expect(screen.queryByText('Backtest Results')).not.toBeInTheDocument();
    });

    it('renders when isOpen is true', () => {
      render(
        <StrategyResultsPopup
          isOpen={true}
          onClose={vi.fn()}
          onOpenSettings={vi.fn()}
          status={null}
          progress={0}
          phase=""
          result={null}
          error={null}
        />
      );
      expect(screen.getByText('Backtest Results')).toBeInTheDocument();
    });

    it('shows loading state when status is running', () => {
      render(
        <StrategyResultsPopup
          isOpen={true}
          onClose={vi.fn()}
          onOpenSettings={vi.fn()}
          status="running"
          progress={50}
          phase="Executing bars"
          result={null}
          error={null}
        />
      );
      expect(screen.getByText(/Executing bars/)).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('shows error when status is failed', () => {
      render(
        <StrategyResultsPopup
          isOpen={true}
          onClose={vi.fn()}
          onOpenSettings={vi.fn()}
          status="failed"
          progress={0}
          phase=""
          result={null}
          error="Script error"
        />
      );
      expect(screen.getByText(/Backtest failed/)).toBeInTheDocument();
    });

    it('shows results when status is completed', () => {
      render(
        <StrategyResultsPopup
          isOpen={true}
          onClose={vi.fn()}
          onOpenSettings={vi.fn()}
          status="completed"
          progress={100}
          phase=""
          result={MOCK_RESULT}
          error={null}
        />
      );
      expect(screen.getByText('Net Profit')).toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', async () => {
      const onClose = vi.fn();
      render(
        <StrategyResultsPopup
          isOpen={true}
          onClose={onClose}
          onOpenSettings={vi.fn()}
          status="completed"
          progress={100}
          phase=""
          result={MOCK_RESULT}
          error={null}
        />
      );

      const closeButton = screen.getByText('✕');
      await userEvent.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });

    it('calls onOpenSettings when gear button is clicked', async () => {
      const onOpenSettings = vi.fn();
      render(
        <StrategyResultsPopup
          isOpen={true}
          onClose={vi.fn()}
          onOpenSettings={onOpenSettings}
          status="completed"
          progress={100}
          phase=""
          result={MOCK_RESULT}
          error={null}
        />
      );

      const gearButton = screen.getByTitle('Backtest Settings');
      await userEvent.click(gearButton);

      expect(onOpenSettings).toHaveBeenCalled();
    });
  });

  describe('BacktestResults', () => {
    it('renders metrics correctly', () => {
      const { container } = render(<BacktestResults result={MOCK_RESULT} />);

      expect(screen.getByText('Net Profit')).toBeInTheDocument();
      expect(screen.getByText('Win Rate')).toBeInTheDocument();
      expect(screen.getByText('Total Trades')).toBeInTheDocument();
      const divs = container.querySelectorAll('div');
      const divTexts = Array.from(divs).map(d => d.textContent?.trim().replace(/\s+/g, ''));
      expect(divTexts.some(t => t?.includes('1234.56'))).toBe(true);
      expect(divTexts.some(t => t?.includes('65.0%'))).toBe(true);
      expect(divTexts.some(t => t === '30')).toBe(true);
    });

    it('renders trade table', () => {
      const { container } = render(<BacktestResults result={MOCK_RESULT} />);

      const cells = container.querySelectorAll('td');
      const cellTexts = Array.from(cells).map(c => c.textContent?.trim().replace(/\s+/g, ''));
      expect(cellTexts).toContain('$100.00');
      expect(cellTexts).toContain('$110.00');
      expect(cellTexts).toContain('$1000.00');
      expect(cellTexts).toContain('$-500.00');
    });

    it('handles empty trades', () => {
      const emptyResult = { ...MOCK_RESULT, trades: [] };
      render(<BacktestResults result={emptyResult} />);

      expect(screen.getByText('Net Profit')).toBeInTheDocument();
      expect(screen.getByText('No trades')).toBeInTheDocument();
    });
  });
});
