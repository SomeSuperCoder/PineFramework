import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  function runButton() {
    return screen.getByRole('button', { name: /run backtest/i });
  }

  it('disables Run Backtest on an invalid explicit range and re-enables when fixed', async () => {
    renderPanel();
    await selectStrategy('User Momentum');
    expect(runButton()).toBeEnabled();

    // Switch to the explicit Begin / End range.
    await userEvent.click(screen.getByRole('tab', { name: 'Begin / End' }));

    const startInput = screen.getByLabelText(/start date/i);
    const endInput = screen.getByLabelText(/end date/i);
    fireEvent.change(startInput, { target: { value: '2026-01-15' } });
    fireEvent.change(endInput, { target: { value: '2026-01-10' } });

    const message = 'Start date must be on or before the end date.';
    expect(await screen.findByText(message)).toBeInTheDocument();
    await waitFor(() => expect(runButton()).toBeDisabled());
    expect(runButton()).toHaveAttribute('title', 'Fix the date range to run the backtest');

    // Fix the range → Run is enabled again and the error clears.
    fireEvent.change(startInput, { target: { value: '2026-01-01' } });
    await waitFor(() => expect(runButton()).toBeEnabled());
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });
});
