import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BacktestGeneralSettings } from '../components/BacktestGeneralSettings';
import type { BacktestGeneralSettingsProps } from '../components/BacktestGeneralSettings';
import { BacktestPanel } from '../components/BacktestPanel';

const STRATEGY_SOURCE = `//@version=6
strategy("Test Strategy", overlay=true, initial_capital=10000, commission_value=0.1, pyramiding=2)
plot(close)`;

const MOCK_SCRIPTS_RESPONSE = {
  scripts: [
    { id: 'str-user-1', name: 'User Momentum', source: STRATEGY_SOURCE, scriptType: 'strategy' },
  ],
};

const MOCK_BUILT_IN_RESPONSE = {
  scripts: [
    { id: 'str-bi-1', name: 'Builtin Trend', source: '//@version=6\nstrategy("Builtin")\nplot(close)', type: 'strategy' },
  ],
};

/**
 * Route-intercepts GET /api/scripts + GET /api/scripts/built-in (strategy
 * dropdown) and the SampleFeesCard dex-fee probe/load — never real network.
 * Same pattern as backtest-flow.test.tsx's installScriptsFetchMock.
 */
function installFetchMock() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Partial<Response>> => {
    const url = String(input);
    if (url.endsWith('/api/scripts') && !url.endsWith('/built-in')) {
      return { ok: true, status: 200, json: async () => MOCK_SCRIPTS_RESPONSE };
    }
    if (url.endsWith('/api/scripts/built-in')) {
      return { ok: true, status: 200, json: async () => MOCK_BUILT_IN_RESPONSE };
    }
    // dex-fee probe + load: 200 without dexFeeBps → SampleFeesCard settles to its
    // empty info callout. Irrelevant to the Run-button guardrails under test.
    return { ok: true, status: 200, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function makeSettingsProps(
  overrides: Partial<BacktestGeneralSettingsProps> = {},
): BacktestGeneralSettingsProps {
  return {
    initialCapital: 10000,
    onInitialCapitalChange: vi.fn(),
    daysBack: 30,
    onDaysBackChange: vi.fn(),
    dateRangeMode: 'days_back',
    onDateRangeModeChange: vi.fn(),
    startDate: '',
    endDate: '',
    onStartDateChange: vi.fn(),
    onEndDateChange: vi.fn(),
    timeframe: '60',
    onBarsExceededChange: vi.fn(),
    onValidationBlocked: vi.fn(),
    ...overrides,
  };
}

describe('BacktestGeneralSettings — date-range guardrails', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* jsdom no localStorage */
    }
  });

  afterEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* jsdom no localStorage */
    }
    vi.unstubAllGlobals();
  });

  it('shows the rule message and blocks validation when start is after end', async () => {
    const props = makeSettingsProps({
      dateRangeMode: 'traditional',
      startDate: '2026-01-15',
      endDate: '2026-01-10',
    });
    render(<BacktestGeneralSettings {...props} />);

    const message = 'Start date must be on or before the end date.';
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(props.onValidationBlocked).toHaveBeenCalledWith(true, message);
  });

  it('calls onValidationBlocked(false) when the explicit range is valid', async () => {
    const props = makeSettingsProps({
      dateRangeMode: 'traditional',
      startDate: '2026-01-01',
      endDate: '2026-01-10',
    });
    render(<BacktestGeneralSettings {...props} />);

    await waitFor(() => expect(props.onValidationBlocked).toHaveBeenCalledWith(false));
    expect(
      screen.queryByText('Start date must be on or before the end date.'),
    ).not.toBeInTheDocument();
  });

  it('clamps the days-back slider to the timeframe max on change', () => {
    const props = makeSettingsProps({ dateRangeMode: 'days_back', daysBack: 30 });
    render(<BacktestGeneralSettings {...props} />);

    const slider = screen.getByRole('slider');
    // timeframe '60' → 24 bars/day → sliderBounds max = floor(1500/24) = 62.
    fireEvent.change(slider, { target: { value: '200' } });

    expect(props.onDaysBackChange).toHaveBeenCalledWith(62);
  });

  it('warns on mount when daysBack is out of range and clears the warning after a user edit', async () => {
    const props = makeSettingsProps({ dateRangeMode: 'days_back', daysBack: 9999 });
    render(<BacktestGeneralSettings {...props} />);

    expect(await screen.findByText('Invalid backtest period reset to 62 days.')).toBeInTheDocument();
    expect(props.onDaysBackChange).toHaveBeenCalledWith(62);

    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '50' } });

    expect(screen.queryByText(/Invalid backtest period reset to/)).not.toBeInTheDocument();
    expect(props.onDaysBackChange).toHaveBeenCalledWith(50);
  });
});

describe('BacktestPanel — Run button date-range guardrail integration', () => {
  let onRun: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* jsdom no localStorage */
    }
    installFetchMock();
    onRun = vi.fn();
  });

  afterEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* jsdom no localStorage */
    }
    vi.unstubAllGlobals();
  });

  function renderPanel() {
    return render(<BacktestPanel onRun={onRun} onClose={vi.fn()} />);
  }

  async function selectStrategy(name: string) {
    await userEvent.click(screen.getByText('Select a strategy...'));
    await userEvent.click(await screen.findByText(name));
  }

  /** Advance the 5-step wizard (strategy → market → capital → commission → review). */
  async function advanceSteps(count: number) {
    for (let i = 0; i < count; i++) {
      await userEvent.click(screen.getByRole('button', { name: /^next$/i }));
    }
  }

  function runButton() {
    return screen.getByRole('button', { name: /run backtest/i });
  }

  it('disables Run Backtest on an invalid explicit range and re-enables when fixed', async () => {
    renderPanel();
    await selectStrategy('User Momentum');

    // Step 3 — Capital & Date Range: switch to the explicit Begin / End range
    // and enter an invalid range (start after end).
    await advanceSteps(2);
    await userEvent.click(screen.getByRole('tab', { name: 'Begin / End' }));

    const startInput = screen.getByLabelText(/start date/i);
    const endInput = screen.getByLabelText(/end date/i);
    fireEvent.change(startInput, { target: { value: '2026-01-15' } });
    fireEvent.change(endInput, { target: { value: '2026-01-10' } });

    const message = 'Start date must be on or before the end date.';
    expect(await screen.findByText(message)).toBeInTheDocument();

    // Step 5 — Review: the Run button is gated by the bad range.
    await advanceSteps(2);
    await waitFor(() => expect(runButton()).toBeDisabled());
    expect(runButton()).toHaveAttribute('title', 'Fix the date range to run the backtest');

    // Go back to the range, fix it, and return to Review — Run enables again.
    await userEvent.click(screen.getByRole('button', { name: /^back$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^back$/i }));
    // Re-query — the Capital step unmounts/re-mounts on navigation, so the
    // element captured above is stale.
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-01-01' } });
    expect(screen.queryByText(message)).not.toBeInTheDocument();

    await advanceSteps(2);
    await waitFor(() => expect(runButton()).toBeEnabled());
  });
});

describe('BacktestPanel — Commission-step Next gating (SampleFeesCard)', () => {
  let onRun: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* jsdom no localStorage */
    }
    onRun = vi.fn();
  });

  afterEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* jsdom no localStorage */
    }
    vi.unstubAllGlobals();
  });

  function renderPanel() {
    return render(<BacktestPanel onRun={onRun} onClose={vi.fn()} />);
  }

  async function selectStrategy(name: string) {
    await userEvent.click(screen.getByText('Select a strategy...'));
    await userEvent.click(await screen.findByText(name));
  }

  /** Advance the 5-step wizard (strategy → market → capital → commission → review). */
  async function advanceSteps(count: number) {
    for (let i = 0; i < count; i++) {
      await userEvent.click(screen.getByRole('button', { name: /^next$/i }));
    }
  }

  function nextButton() {
    return screen.getByRole('button', { name: /^next$/i });
  }

  /**
   * Stub fetch with the dex-fee MAIN load (panel symbol, default BTCUSDT) left
   * PENDING until the test resolves it. The route probe (symbol=SOL) resolves
   * immediately with 200 so it never flips the phase to 'absent'. Scripts routes
   * serve the strategy dropdown as usual.
   */
  function installDeferredDexFeeMock() {
    let resolveMain: (r: Partial<Response>) => void = () => {};
    const mainPending = new Promise<Partial<Response>>((resolve) => {
      resolveMain = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Partial<Response>> => {
      const url = String(input);
      if (url.endsWith('/api/scripts') && !url.endsWith('/built-in')) {
        return { ok: true, status: 200, json: async () => MOCK_SCRIPTS_RESPONSE };
      }
      if (url.endsWith('/api/scripts/built-in')) {
        return { ok: true, status: 200, json: async () => MOCK_BUILT_IN_RESPONSE };
      }
      if (url.includes('/api/backtest/dex-fee')) {
        // Route probe only — let it settle; the MAIN load (any other symbol) gates.
        if (url.includes('symbol=SOL')) {
          return { ok: true, status: 200, json: async () => ({}) };
        }
        return mainPending;
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);
    return { fetchMock, resolveMain };
  }

  it('disables Next while sample fees are loading and enables it once fees succeed', async () => {
    const { resolveMain } = installDeferredDexFeeMock();
    renderPanel();
    await selectStrategy('User Momentum');
    await advanceSteps(3); // strategy → market → capital → commission

    // SampleFeesCard mounts on the commission step; the main dex-fee fetch is
    // still pending → phase 'loading' → Next is gated with the waiting title.
    await waitFor(() => expect(nextButton()).toBeDisabled());
    expect(nextButton()).toHaveAttribute('title', 'Waiting for sample fees…');

    // Resolve the pending dex-fee fetch with valid fee data → phase 'success'.
    await act(async () => {
      resolveMain({ ok: true, status: 200, json: async () => ({ dexFeeBps: 2.5 }) });
    });

    await waitFor(() => expect(nextButton()).toBeEnabled());
    expect(nextButton()).not.toHaveAttribute('title', 'Waiting for sample fees…');
  });

  it('does not gate Next once the fee fetch settles to a non-loading phase', async () => {
    installFetchMock(); // dex-fee probe + load resolve 200 without dexFeeBps → 'empty'
    renderPanel();
    await selectStrategy('User Momentum');
    await advanceSteps(3);

    // The card settled to its empty info callout — proof the fetch resolved —
    // and Next is NOT blocked by fee logic (gating is loading-phase-only).
    expect(await screen.findByText(/No fee data available for/)).toBeInTheDocument();
    const next = nextButton();
    await waitFor(() => expect(next).toBeEnabled());
    expect(next).not.toHaveAttribute('title', 'Waiting for sample fees…');
  });
});
