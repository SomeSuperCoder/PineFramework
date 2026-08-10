import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, renderHook, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrategyResultsPopup } from '../components/StrategyResultsPopup';
import { BacktestPanel } from '../components/BacktestPanel';
import { StrategySelector } from '../components/StrategySelector';
import { BacktestResults } from '../components/BacktestResults';
import { extractStrategyParams } from '../utils/extractStrategyParams';
import { useBacktest } from '../hooks/useBacktest';
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

// ─── Strategy-list fixtures for the dropdown ────────────────────────────────
const MOCK_SCRIPTS_RESPONSE = {
  scripts: [
    { id: 'str-user-1', name: 'User Momentum', source: STRATEGY_SOURCE, scriptType: 'strategy' },
    // Indicators must be filtered out client-side by StrategySelector.
    { id: 'ind-1', name: 'Ignore Me Indicator', source: '//@version=6\nindicator("Ignore")', scriptType: 'indicator' },
  ],
};

const MOCK_BUILT_IN_RESPONSE = {
  scripts: [
    { id: 'str-bi-1', name: 'Builtin Trend', source: '//@version=6\nstrategy("Builtin")\nplot(close)', type: 'strategy' },
  ],
};

/** Route-intercepts GET /api/scripts + GET /api/scripts/built-in (never real network). */
function installScriptsFetchMock() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Partial<Response>> => {
    const url = String(input);
    if (url.endsWith('/api/scripts') && !url.endsWith('/built-in')) {
      return { ok: true, status: 200, json: async () => MOCK_SCRIPTS_RESPONSE };
    }
    if (url.endsWith('/api/scripts/built-in')) {
      return { ok: true, status: 200, json: async () => MOCK_BUILT_IN_RESPONSE };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

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

  describe('StrategySelector onChange contract', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = installScriptsFetchMock();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('fetches /api/scripts + /api/scripts/built-in only when opened', async () => {
      render(<StrategySelector value="" onChange={vi.fn()} />);

      expect(fetchMock).not.toHaveBeenCalled();

      await userEvent.click(screen.getByText('Select a strategy...'));
      await screen.findByText('User Momentum');

      const calledUrls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(calledUrls).toContain('/api/scripts');
      expect(calledUrls).toContain('/api/scripts/built-in');
    });

    it('calls onChange with (source, name, id) when a strategy is picked', async () => {
      const onChange = vi.fn();
      render(<StrategySelector value="" onChange={onChange} />);

      await userEvent.click(screen.getByText('Select a strategy...'));
      await userEvent.click(await screen.findByText('User Momentum'));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(STRATEGY_SOURCE, 'User Momentum', 'str-user-1');
    });

    it('filters indicators out and only offers strategies', async () => {
      render(<StrategySelector value="" onChange={vi.fn()} />);

      await userEvent.click(screen.getByText('Select a strategy...'));
      await screen.findByText('User Momentum');

      expect(screen.queryByText('Ignore Me Indicator')).not.toBeInTheDocument();
      expect(screen.getByText('Builtin Trend')).toBeInTheDocument();
    });
  });

  describe('BacktestPanel strategy dropdown', () => {
    let onRun: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      installScriptsFetchMock();
      onRun = vi.fn();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function renderPanel() {
      return render(
        <BacktestPanel
          onRun={onRun}
          onClose={vi.fn()}
        />
      );
    }

    async function selectStrategy(name: string) {
      await userEvent.click(screen.getByText('Select a strategy...'));
      await userEvent.click(await screen.findByText(name));
    }

    async function advanceToReview() {
      // Wizard steps: strategy → market → capital → commission → review.
      for (let i = 0; i < 4; i++) {
        await userEvent.click(screen.getByRole('button', { name: /^next$/i }));
      }
    }

    it('keeps Run Backtest gated until a strategy is selected (wizard cannot advance)', async () => {
      renderPanel();
      // On step 1 without a strategy, "Next" is disabled — the review step
      // (and its Run Backtest button) is unreachable, so no run path exists.
      expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled();
      expect(screen.queryByRole('button', { name: /run backtest/i })).not.toBeInTheDocument();
    });

    it('enables Run Backtest once a strategy is selected (reachable at the review step)', async () => {
      renderPanel();
      await selectStrategy('User Momentum');
      await advanceToReview();
      expect(screen.getByRole('button', { name: /run backtest/i })).toBeEnabled();
    });

    it('passes the selected strategy (id+name+source) to onRun — dropdown → script source regression', async () => {
      renderPanel();
      await selectStrategy('User Momentum');
      await advanceToReview();
      await userEvent.click(screen.getByRole('button', { name: /run backtest/i }));

      expect(onRun).toHaveBeenCalledTimes(1);
      const { config, strategy, startDate, endDate } = onRun.mock.calls[0][0] as {
        config: unknown;
        strategy: { id: string; name: string; source: string };
        startDate?: string;
        endDate?: string;
      };
      expect(strategy).toEqual({
        id: 'str-user-1',
        name: 'User Momentum',
        source: STRATEGY_SOURCE,
      });
      expect(strategy.source).toBe(STRATEGY_SOURCE); // never the empty chart-derived source
      expect(config).toBeDefined();
      expect(startDate).toBeDefined();
      expect(endDate).toBeDefined();
    });

    it('never runs without a selected strategy (no onRun → no POST upstream)', async () => {
      renderPanel();
      // No strategy → no way to reach the Run Backtest button at all.
      const nextButton = screen.getByRole('button', { name: /^next$/i });
      await userEvent.click(nextButton); // disabled — click is a no-op
      expect(screen.queryByRole('button', { name: /run backtest/i })).not.toBeInTheDocument();
      expect(onRun).not.toHaveBeenCalled();
    });

    it('resets the wizard to the Strategy step when resetSignal changes', async () => {
      const { rerender } = render(
        <BacktestPanel onRun={onRun} onClose={vi.fn()} resetSignal={0} />
      );

      // Advance to step 2 (Market) so we are NOT already on Strategy.
      await userEvent.click(screen.getByText('Select a strategy...'));
      await userEvent.click(await screen.findByText('User Momentum'));
      await userEvent.click(screen.getByRole('button', { name: /^next$/i }));
      expect(screen.getByText('Trading pair and candle interval for the backtest.')).toBeInTheDocument();

      // Closing the results popup bumps resetSignal — the wizard must snap
      // back to step 1 (Strategy) while the panel stays mounted.
      rerender(
        <BacktestPanel onRun={onRun} onClose={vi.fn()} resetSignal={1} />
      );

      expect(screen.getByText('Choose a Pine Script strategy to backtest.')).toBeInTheDocument();
      expect(screen.queryByText('Trading pair and candle interval for the backtest.')).not.toBeInTheDocument();
    });
  });

  describe('useBacktest POST body', () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('sends the selected strategy source as the script field', async () => {
      vi.useFakeTimers();
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Partial<Response>> => {
        const url = String(input);
        if (url === '/api/backtest' && init?.method === 'POST') {
          return { ok: true, status: 200, json: async () => ({ job_id: 'job-1' }) };
        }
        return { ok: true, status: 200, json: async () => ({ status: 'completed' }) };
      });
      vi.stubGlobal('fetch', fetchMock);

      const { result, unmount } = renderHook(() => useBacktest());
      await act(async () => {
        await result.current.submitBacktest('BTCUSDT', '1d', { script: STRATEGY_SOURCE }, '2026-01-01', '2026-02-01');
      });

      const postCall = fetchMock.mock.calls.find(
        ([input, init]) => String(input) === '/api/backtest' && init?.method === 'POST',
      );
      expect(postCall).toBeDefined();

      const body = JSON.parse(String(postCall![1]?.body)) as {
        symbol: string;
        timeframe: string;
        script: string;
        startDate: string;
        endDate: string;
      };
      expect(body.symbol).toBe('BTCUSDT');
      expect(body.timeframe).toBe('1d');
      expect(body.script).toBe(STRATEGY_SOURCE); // script EQUALS the selected strategy's source
      expect(body.startDate).toBe('2026-01-01');
      expect(body.endDate).toBe('2026-02-01');

      // stop the poll interval started by submitBacktest so no timers leak
      act(() => { result.current.reset(); });
      unmount();
    });
  });

  describe('StrategyResultsPopup', () => {
    it('does not render when isOpen is false', () => {
      render(
        <StrategyResultsPopup
          isOpen={false}
          onClose={vi.fn()}
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

    it('shows exactly one close control (✕) and no destructive Close text-button in completed results', () => {
      render(
        <StrategyResultsPopup
          isOpen={true}
          onClose={vi.fn()}
          status="completed"
          progress={100}
          phase=""
          result={MOCK_RESULT}
          error={null}
        />
      );

      // Completed-results view is showing.
      expect(screen.getByText('Net Profit')).toBeInTheDocument();

      // The ✕ DialogClose in the popup header (title="Close") is the ONLY close control.
      expect(screen.getAllByTitle('Close')).toHaveLength(1);

      // BacktestResults no longer receives onClose from the popup, so its
      // destructive "Close" text-button must not render.
      expect(screen.queryByRole('button', { name: /^close$/i })).not.toBeInTheDocument();
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