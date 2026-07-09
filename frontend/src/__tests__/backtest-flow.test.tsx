import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrategyResultsPopup } from '../components/StrategyResultsPopup';
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
    { equity: 10000, drawdown: 0 },
    { equity: 10500, drawdown: 0 },
    { equity: 11000, drawdown: 0 },
    { equity: 10800, drawdown: 1.8 },
    { equity: 11234.56, drawdown: 0 },
  ],
  monthlyReturns: {},
  buyHoldReturn: 0.12,
};

describe('Backtest Flow Integration', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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

  describe('StrategyResultsPopup', () => {
    it('does not render when isOpen is false', () => {
      render(
        <StrategyResultsPopup
          isOpen={false}
          onClose={vi.fn()}
          symbol="BTCUSDT"
          timeframe="1h"
          scriptSource={STRATEGY_SOURCE}
        />
      );
      expect(screen.queryByText('Backtest Results')).not.toBeInTheDocument();
    });

    it('renders when isOpen is true', () => {
      render(
        <StrategyResultsPopup
          isOpen={true}
          onClose={vi.fn()}
          symbol="BTCUSDT"
          timeframe="1h"
          scriptSource={STRATEGY_SOURCE}
        />
      );
      expect(screen.getByText('Backtest Results')).toBeInTheDocument();
    });

    it('auto-submits backtest when opened with scriptSource', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'test-job-123' }),
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'queued', progress: 0 }),
      });

      render(
        <StrategyResultsPopup
          isOpen={true}
          onClose={vi.fn()}
          symbol="BTCUSDT"
          timeframe="1h"
          scriptSource={STRATEGY_SOURCE}
        />
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith('/api/backtest', expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }));
      });

      const call = fetchMock.mock.calls.find((c: any[]) => c[0] === '/api/backtest');
      const body = JSON.parse(call![1].body);
      expect(body.symbol).toBe('BTCUSDT');
      expect(body.timeframe).toBe('1h');
      expect(body.script).toBe(STRATEGY_SOURCE);
      expect(body.initialCapital).toBe(10000);
      expect(body.commission).toBe(0.1);
      expect(body.pyramiding).toBe(2);
    });

    it('does not auto-submit when scriptSource is empty', async () => {
      render(
        <StrategyResultsPopup
          isOpen={true}
          onClose={vi.fn()}
          symbol="BTCUSDT"
          timeframe="1h"
          scriptSource=""
        />
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      expect(fetchMock).not.toHaveBeenCalledWith('/api/backtest', expect.anything());
    });

    it('shows loading state during backtest', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'test-job-123' }),
      });
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'running', progress: 50 }),
      });

      render(
        <StrategyResultsPopup
          isOpen={true}
          onClose={vi.fn()}
          symbol="BTCUSDT"
          timeframe="1h"
          scriptSource={STRATEGY_SOURCE}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Running backtest/)).toBeInTheDocument();
      });
    });

    it('displays results when backtest completes', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'test-job-123' }),
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'completed', progress: 100 }),
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_RESULT,
      });

      render(
        <StrategyResultsPopup
          isOpen={true}
          onClose={vi.fn()}
          symbol="BTCUSDT"
          timeframe="1h"
          scriptSource={STRATEGY_SOURCE}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Net Profit')).toBeInTheDocument();
      });
    });

    it('shows error when backtest fails', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'test-job-123' }),
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'failed', progress: 0, error: 'Script error' }),
      });

      render(
        <StrategyResultsPopup
          isOpen={true}
          onClose={vi.fn()}
          symbol="BTCUSDT"
          timeframe="1h"
          scriptSource={STRATEGY_SOURCE}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Backtest failed/)).toBeInTheDocument();
      });
    });

    it('shows error when submission fails', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      render(
        <StrategyResultsPopup
          isOpen={true}
          onClose={vi.fn()}
          symbol="BTCUSDT"
          timeframe="1h"
          scriptSource={STRATEGY_SOURCE}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/failed/i)).toBeInTheDocument();
      });
    });

    it('calls onClose when close button is clicked', async () => {
      const onClose = vi.fn();
      render(
        <StrategyResultsPopup
          isOpen={true}
          onClose={onClose}
          symbol="BTCUSDT"
          timeframe="1h"
          scriptSource={STRATEGY_SOURCE}
        />
      );

      const closeButton = screen.getByText('✕');
      await userEvent.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('strategySource resolution (the actual production bug)', () => {
    it('sends script in POST body when strategySource is non-empty', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'job-1' }),
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'queued', progress: 0 }),
      });

      render(
        <StrategyResultsPopup
          isOpen={true}
          onClose={vi.fn()}
          symbol="BTCUSDT"
          timeframe="1h"
          scriptSource={STRATEGY_SOURCE}
        />
      );

      await waitFor(() => {
        const call = fetchMock.mock.calls.find((c: any[]) => c[0] === '/api/backtest');
        expect(call).toBeDefined();
        const body = JSON.parse(call![1].body);
        expect(body.script).toBe(STRATEGY_SOURCE);
        expect(body.script.length).toBeGreaterThan(0);
      });
    });

    it('does NOT submit when strategySource is empty string', async () => {
      render(
        <StrategyResultsPopup
          isOpen={true}
          onClose={vi.fn()}
          symbol="BTCUSDT"
          timeframe="1h"
          scriptSource=""
        />
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does NOT submit when strategySource is undefined-like', async () => {
      render(
        <StrategyResultsPopup
          isOpen={true}
          onClose={vi.fn()}
          symbol="BTCUSDT"
          timeframe="1h"
          scriptSource={undefined as any}
        />
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('re-submits when scriptSource changes while open', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ job_id: 'job-1' }),
      });

      const { rerender } = render(
        <StrategyResultsPopup
          isOpen={true}
          onClose={vi.fn()}
          symbol="BTCUSDT"
          timeframe="1h"
          scriptSource=""
        />
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(fetchMock).not.toHaveBeenCalled();

      rerender(
        <StrategyResultsPopup
          isOpen={true}
          onClose={vi.fn()}
          symbol="BTCUSDT"
          timeframe="1h"
          scriptSource={STRATEGY_SOURCE}
        />
      );

      await waitFor(() => {
        const call = fetchMock.mock.calls.find((c: any[]) => c[0] === '/api/backtest');
        expect(call).toBeDefined();
      });
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
