/**
 * Regression tests: after a normal (non-emergency) stop, the SetupWizard must
 * land on the 'review' step — not the 'wallet' (import) step.
 *
 * Root cause: LiveDashboard only re-fetched config (not wallet status) on
 * Idle/Stopped, and the wizard's recovery-to-review logic only handled the
 * 'config' step — so a stale/failed wallet fetch stranded the user on the
 * import-wallet step after a stop.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiveDashboard, type BotStatusSnapshot } from '../components/TradingBotPanel';

// jsdom has no canvas — the mini chart's PineChart would throw 'Canvas 2D not
// supported'. The regression tests target the data pipeline (fetch calls), not
// chart rendering, so stub the component.
vi.mock('../components/MiniChart', () => ({
  MiniChart: () => <div data-testid="mini-chart" />,
}));

const BACKEND = 'http://test:8081';

let wsInstances: MockWS[] = [];

// Minimal WebSocket stub — matches the pattern in useChartData.test.ts
class MockWS {
  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    wsInstances.push(this);
  }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.(); }
}

function statusSnapshot(state: BotStatusSnapshot['state']): BotStatusSnapshot {
  return {
    state,
    strategyName: 'Simple EMA Cross Strategy',
    dex: 'jupiter-swap',
    walletPublicKey: 'DqxdMe458TuhjYXf4Q7VBS4WgBeNne5fHwMT16SkN9mw',
    startedAt: Date.now() - 60000,
    uptimeMs: 60000,
    balance: 100,
    realizedPnl: 10,
    unrealizedPnl: -2,
    positions: [],
    exposure: 0,
    errors: [],
  };
}

const WALLET_STATUS_OK = {
  success: true,
  hasWallet: true,
  locked: false,
  publicKey: 'DqxdMe458TuhjYXf4Q7VBS4WgBeNne5fHwMT16SkN9mw',
};

const CONFIG_OK = {
  strategySource: '//@version=5\nstrategy("x")',
  dex: 'jupiter-swap',
  risk: { maxDailyLoss: 50 },
  autoSelect: true,
  pairs: [{ symbol: 'SOLUSDT', timeframe: '15' }],
};

function jsonRes(data: unknown, ok = true): Promise<Response> {
  return Promise.resolve({ ok, json: () => Promise.resolve(data) } as Response);
}

const CANDLE = { timestamp: 1785722700000, open: 100, high: 101, low: 99, close: 100.5, volume: 10 };

const EXECUTE_RESULT = {
  success: true,
  outputs: {},
  shapes: [],
  fills: [],
  strategyMarkers: [],
  bgcolor: [],
  plotColors: {},
  fillColorData: {},
  lines: [],
  labels: [],
  alertConditions: [],
  alertTriggers: [],
  boxes: [],
  tables: [],
  hiddenPlotKeys: [],
  barColors: [],
};

// Config before manual selection: autoSelect unresolved, no pairs resolved.
const CONFIG_UNRESOLVED = {
  strategySource: '//@version=5\nstrategy("x")',
  dex: 'jupiter-swap',
  risk: { maxDailyLoss: 50 },
  autoSelect: true,
};

// Config after manual selection persists the chosen pair and disables autoSelect.
const CONFIG_RESOLVED = {
  ...CONFIG_UNRESOLVED,
  autoSelect: false,
  pairs: [{ symbol: 'SOLUSDT', timeframe: '60' }],
};

describe('LiveDashboard stop flow', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
    wsInstances = [];
    vi.stubGlobal('WebSocket', MockWS as unknown as typeof WebSocket);
    fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const path = new URL(url, BACKEND).pathname;
      if (path.endsWith('/api/bot/wallet/status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(WALLET_STATUS_OK) } as Response);
      }
      if (path.endsWith('/api/bot/config') && (!init || init.method === 'GET' || init.method === undefined)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(CONFIG_OK) } as Response);
      }
      if (path.endsWith('/api/bot/stop') || path.endsWith('/api/bot/emergency-stop')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) } as Response);
      }
      if (path.endsWith('/api/bot/wallet/balance')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, balance: 100 }) } as Response);
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    onClose = vi.fn();
  });

  it('lands on REVIEW after a normal stop when wallet + config exist', async () => {
    const { rerender } = render(
      <LiveDashboard backendUrl={BACKEND} status={statusSnapshot('Running')} logs={[]} onClose={onClose} />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/bot/wallet/status')));

    const stopBtn = await screen.findByRole('button', { name: /^Stop$/ });
    await userEvent.click(stopBtn);
    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND}/api/bot/stop`, { method: 'POST' });

    rerender(<LiveDashboard backendUrl={BACKEND} status={statusSnapshot('Stopping')} logs={[]} onClose={onClose} />);
    rerender(<LiveDashboard backendUrl={BACKEND} status={statusSnapshot('Stopped')} logs={[]} onClose={onClose} />);

    await screen.findByText(/Review & Start/);
    expect(screen.queryByPlaceholderText(/Paste 12 or 24 word seed phrase/)).toBeNull();
  });

  it('recovers from the import-wallet step to REVIEW after a failed mount wallet fetch', async () => {
    let walletCalls = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const path = new URL(url, BACKEND).pathname;
      if (path.endsWith('/api/bot/wallet/status')) {
        walletCalls++;
        // First (mount) fetch fails — leaves LiveDashboard wallet state stale
        if (walletCalls === 1) return Promise.reject(new Error('network'));
        return Promise.resolve({ ok: true, json: () => Promise.resolve(WALLET_STATUS_OK) } as Response);
      }
      if (path.endsWith('/api/bot/config') && (!init || init.method === 'GET' || init.method === undefined)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(CONFIG_OK) } as Response);
      }
      if (path.endsWith('/api/bot/wallet/balance')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, balance: 100 }) } as Response);
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
    });

    // Dashboard opens while the bot is already stopped
    render(<LiveDashboard backendUrl={BACKEND} status={statusSnapshot('Stopped')} logs={[]} onClose={onClose} />);

    // Stale wallet -> wizard initially shows the import-wallet step
    await screen.findByPlaceholderText(/Paste 12 or 24 word seed phrase/);

    // The idle/stopped re-fetch recovers wallet+config -> advance to review
    await screen.findByText(/Review & Start/);
    expect(screen.queryByPlaceholderText(/Paste 12 or 24 word seed phrase/)).toBeNull();
  });

  it('does NOT execute the strategy or fetch OHLCV while Idle/Stopped (saved config)', async () => {
    // Dashboard opens directly to the Review step (saved config + wallet).
    render(<LiveDashboard backendUrl={BACKEND} status={statusSnapshot('Stopped')} logs={[]} onClose={onClose} />);

    await screen.findByText(/Review & Start/);

    // Give any stray effects a tick to fire
    await new Promise((r) => setTimeout(r, 50));

    // The mini chart data pipeline must NOT run while Idle/Stopped
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls.some((u) => u.includes('/api/execute'))).toBe(false);
    expect(urls.some((u) => u.includes('/api/ohlcv'))).toBe(false);
  });

  it('starts the mini chart data pipeline (ohlcv + execute) once Running', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const path = new URL(url, BACKEND).pathname;
      if (path.endsWith('/api/bot/wallet/status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(WALLET_STATUS_OK) } as Response);
      }
      if (path.endsWith('/api/bot/config') && (!init || init.method === 'GET' || init.method === undefined)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(CONFIG_OK) } as Response);
      }
      if (path.endsWith('/api/ohlcv')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [
          { timestamp: 1785722700000, open: 100, high: 101, low: 99, close: 100.5, volume: 10 },
        ] }) } as Response);
      }
      if (path.endsWith('/api/execute')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          success: true,
          outputs: {},
          shapes: [],
          fills: [],
          strategyMarkers: [],
          bgcolor: [],
          plotColors: {},
          fillColorData: {},
          lines: [],
          labels: [],
          alertConditions: [],
          alertTriggers: [],
          boxes: [],
          tables: [],
          hiddenPlotKeys: [],
          barColors: [],
        }) } as Response);
      }
      if (path.endsWith('/api/bot/wallet/balance')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, balance: 100 }) } as Response);
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
    });

    render(<LiveDashboard backendUrl={BACKEND} status={statusSnapshot('Running')} logs={[]} onClose={onClose} />);

    // The mini chart data pipeline runs once the bot is Running
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([u]) => String(u));
      expect(urls.some((u) => u.includes('/api/ohlcv'))).toBe(true);
    });
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([u]) => String(u));
      expect(urls.some((u) => u.includes('/api/execute'))).toBe(true);
    });
  });

  it('shows the mini chart on first start after manual pair selection', async () => {
    let resolved = false;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const path = new URL(url, BACKEND).pathname;
      if (path.endsWith('/api/bot/wallet/status')) return jsonRes(WALLET_STATUS_OK);
      if (path.endsWith('/api/bot/wallet/balance')) return jsonRes({ success: true, balance: 100 });
      if (path.endsWith('/api/bot/config')) {
        if (!init || init.method === 'GET' || init.method === undefined) {
          // Unresolved until the manual pair has been persisted via /configure.
          return jsonRes(resolved ? CONFIG_RESOLVED : CONFIG_UNRESOLVED);
        }
        return jsonRes({ success: true });
      }
      if (path.endsWith('/api/bot/configure') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body || '{}'));
        if (Array.isArray(body.pairs) && body.pairs.length > 0) resolved = true;
        return jsonRes({ success: true, config: body });
      }
      if (path.endsWith('/api/bot/start') && init?.method === 'POST') {
        return jsonRes({ success: true, state: 'Starting' });
      }
      if (path.endsWith('/api/ohlcv')) return jsonRes({ data: [CANDLE] });
      if (path.endsWith('/api/execute')) return jsonRes(EXECUTE_RESULT);
      return jsonRes({ success: true });
    });

    const { rerender } = render(
      <LiveDashboard backendUrl={BACKEND} status={statusSnapshot('Stopped')} logs={[]} onClose={onClose} />,
    );

    // Saved wallet + unresolved autoSelect config -> wizard lands on Review
    await screen.findByText(/Review & Start/);

    // Enter manual pair selection via Re-run Backtest
    await userEvent.click(await screen.findByText('Re-run Backtest'));
    await userEvent.click(screen.getByRole('button', { name: /Manually Select Pair/ }));

    // Pick a pair (timeframe defaults to 60) and proceed to Review. The pair
    // selector is a shadcn Select (Radix): open the combobox trigger, then pick
    // the option from the portal'd listbox (native selectOptions no longer
    // applies; getAllByRole('combobox')[0] ordering is fragile with multiple
    // radix comboboxes). The option's accessible name is the display label
    // "SOL/USDT" (getTokenInfo symbol/quote) — the internal value stays
    // "SOLUSDT", which is what gets sent to the backend.
    await userEvent.click(screen.getByRole('combobox', { name: /Pair/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'SOL/USDT' }));
    await userEvent.click(screen.getByRole('button', { name: /^Next/ }));

    await screen.findByText(/Review & Start/);
    await userEvent.click(screen.getByRole('button', { name: /Start Bot/ }));
    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND}/api/bot/start`, { method: 'POST' });

    // Bot Running -> the mini chart data pipeline must start on the manual pair
    rerender(<LiveDashboard backendUrl={BACKEND} status={statusSnapshot('Running')} logs={[]} onClose={onClose} />);
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([u]) => String(u));
      expect(urls.some((u) => u.includes('/api/ohlcv'))).toBe(true);
    });
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([u]) => String(u));
      expect(urls.some((u) => u.includes('/api/execute'))).toBe(true);
    });
  });

  it('refreshes config on Running so the mini chart mounts when the mount fetch was stale', async () => {
    let configCalls = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const path = new URL(url, BACKEND).pathname;
      if (path.endsWith('/api/bot/wallet/status')) return jsonRes(WALLET_STATUS_OK);
      if (path.endsWith('/api/bot/wallet/balance')) return jsonRes({ success: true, balance: 100 });
      if (path.endsWith('/api/bot/config') && (!init || init.method === 'GET' || init.method === undefined)) {
        configCalls++;
        // Mount fetch returns stale config (no pairs); the Running-transition
        // refresh returns the resolved config with pairs.
        return jsonRes(configCalls === 1 ? null : CONFIG_OK);
      }
      if (path.endsWith('/api/ohlcv')) return jsonRes({ data: [CANDLE] });
      if (path.endsWith('/api/execute')) return jsonRes(EXECUTE_RESULT);
      return jsonRes({});
    });

    render(<LiveDashboard backendUrl={BACKEND} status={statusSnapshot('Running')} logs={[]} onClose={onClose} />);

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([u]) => String(u));
      expect(urls.some((u) => u.includes('/api/ohlcv'))).toBe(true);
    });
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([u]) => String(u));
      expect(urls.some((u) => u.includes('/api/execute'))).toBe(true);
    });
  });
});
