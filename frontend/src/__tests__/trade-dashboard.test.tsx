/**
 * Component + unit tests for the Trade History + Statistics dashboards
 * (OpenSpec change add-trade-history-stats-dashboard, tasks 4.7 + exported seams).
 *
 * Covers:
 *  - DashboardTabs switching inside LiveDashboard (Overview stays intact)
 *  - TradeHistoryTab: mocked-fetch rows, PnL/closedAt sorting, mode/strategy/
 *    timeframe/symbol filters, cursor pagination
 *  - matchesTradeFilter / computeEquityCurve exported seams (HISTORY_PAGE_SIZE)
 *  - StatisticsTab: metric cards, groupBy refetch, equity/grouped canvases,
 *    empty + error states
 *  - useTradeHistory: live bot:trade merge + reconnect refetch
 *
 * House style: vitest + @testing-library/react, fetch mocked by URL,
 * WebSocket stubbed (see TradingBotPanel.test.tsx / bot-stop-step.test.tsx).
 * All backend calls are mocked — never touches a real backend.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiveDashboard } from '../components/TradingBotPanel';
import type { BotStatusSnapshot } from '../components/TradingBotPanel';
import { TradeHistoryTab } from '../components/TradeHistoryTab';
import { StatisticsTab, computeEquityCurve } from '../components/StatisticsTab';
import { useTradeHistory, matchesTradeFilter, HISTORY_PAGE_SIZE } from '../hooks/useTradeHistory';
import type { TradeHistoryFilter } from '../hooks/useTradeHistory';
import type { TradeRecord, TradeStats, TradeStatsGroup } from '../types/trade';

// LiveDashboard mounts LiveBotView (mini chart) in running states — stub both
// chart dependencies so the tab-switching contract is tested hermetically
// (house precedent: TradingBotPanel.test.tsx / bot-stop-step.test.tsx).
vi.mock('../components/MiniChart', () => ({
  MiniChart: () => <div data-testid="mini-chart" />,
}));
vi.mock('../hooks/useMiniChartData', () => ({
  useBotMiniChartData: () => ({
    candles: [],
    displayCandles: [],
    displayScriptResult: null,
    loading: false,
    error: null,
  }),
}));

const BACKEND = 'http://test:8081';

// jsdom has no canvas 2D context — provide a no-op so the hand-rolled equity /
// grouped charts exercise their draw paths without throwing.
function createCtxMock(): CanvasRenderingContext2D {
  const ctx: Record<string, unknown> = {
    scale: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    fillRect: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

/** Fetch mock routing by URL — mirrors the backend contract per pathname. */
function createFetchMock(
  handlers: Array<{ match: (url: URL) => boolean; handler: (url: URL) => unknown }>,
): ReturnType<typeof vi.fn> {
  return vi.fn((input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const h = handlers.find((x) => x.match(url));
    if (!h) return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
    return Promise.resolve({ ok: true, json: () => Promise.resolve(h.handler(url)) } as Response);
  });
}

// ---- Fixtures (mirror of backend/src/routes/trade-history.ts contracts) ----

function makeTrade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return {
    id: 't-' + Math.random().toString(36).slice(2, 8),
    botId: 'bot-1',
    symbol: 'BTCUSDT',
    side: 'buy',
    entryPrice: 100,
    exitPrice: 110,
    size: 0.5,
    fees: 0.1,
    realizedPnl: 5,
    dex: 'jupiter-swap',
    openedAt: 1_700_000_000_000,
    closedAt: 1_700_000_360_000,
    strategy: 'Scalper',
    timeframe: '15',
    mode: 'live',
    status: 'confirmed',
    ...overrides,
  };
}

// Page 1 (newest-first): closedAt 3000 / 2000 / 1000.
const TRADE_ETH = makeTrade({
  id: 't3',
  symbol: 'ETHUSDT',
  entryPrice: 3000,
  exitPrice: 3100,
  size: 0.1,
  fees: 0.2,
  realizedPnl: 3,
  openedAt: 1_700_000_002_400,
  closedAt: 1_700_000_003_000,
  strategy: 'Trend',
  timeframe: '60',
  mode: 'live',
});
const TRADE_BTC = makeTrade({
  id: 't1',
  symbol: 'BTCUSDT',
  realizedPnl: 10,
  openedAt: 1_700_000_001_500,
  closedAt: 1_700_000_002_000,
  strategy: 'Scalper',
  timeframe: '15',
  mode: 'live',
});
const TRADE_SOL = makeTrade({
  id: 't2',
  symbol: 'SOLUSDT',
  side: 'sell',
  entryPrice: 50,
  exitPrice: 45,
  size: 1,
  fees: 0.05,
  realizedPnl: -5,
  openedAt: 1_700_000_000_600,
  closedAt: 1_700_000_001_000,
  strategy: 'Chaos Mode',
  timeframe: '5',
  mode: 'chaos',
});
// Page 2 (older): closedAt 500.
const TRADE_ADA = makeTrade({
  id: 't4',
  symbol: 'ADAUSDT',
  entryPrice: 0.5,
  exitPrice: 0.48,
  size: 100,
  fees: 0.01,
  realizedPnl: -2,
  openedAt: 1_700_000_000_200,
  closedAt: 1_700_000_000_500,
  strategy: 'Scalper',
  timeframe: '15',
  mode: 'live',
});

// Page 1 is the newest-first page the API serves for a null cursor; page 2
// (older) is served only when a cursor is present.
const PAGE1 = [TRADE_BTC, TRADE_SOL, TRADE_ETH];
const PAGE2 = [TRADE_ADA];

const ALL_FILTER: TradeHistoryFilter = {
  mode: 'all',
  status: 'all',
  symbol: '',
  timeframe: '',
  strategy: '',
};

const SUMMARY: TradeStats = {
  totalTrades: 12,
  winningTrades: 7,
  losingTrades: 5,
  winRate: 7 / 12, // 0.5833… → "58.3%"
  totalPnl: 123.45,
  totalFees: 4.2,
  averageWin: 25,
  averageLoss: -10,
  netPnl: 119.25,
  profitFactor: 1.85,
  avgTrade: 9.94,
  bestTrade: 40,
  worstTrade: -18,
  maxDrawdown: 22,
};

const GROUPS: TradeStatsGroup[] = [
  { key: 'Scalper', stats: { ...SUMMARY, totalPnl: 80 } },
  { key: 'Chaos Mode', stats: { ...SUMMARY, totalPnl: -30 } },
];

const ZERO_SUMMARY: TradeStats = {
  totalTrades: 0,
  winningTrades: 0,
  losingTrades: 0,
  winRate: 0,
  totalPnl: 0,
  totalFees: 0,
  averageWin: 0,
  averageLoss: 0,
  netPnl: 0,
  profitFactor: 0,
  avgTrade: 0,
  bestTrade: 0,
  worstTrade: 0,
  maxDrawdown: 0,
};

// ---- LiveDashboard status snapshot (house pattern from bot-stop-step.test.tsx) ----

function statusSnapshot(state: BotStatusSnapshot['state']): BotStatusSnapshot {
  return {
    state,
    strategyName: 'Test strategy',
    dex: 'jupiter-swap',
    walletPublicKey: null,
    startedAt: Date.now() - 60_000,
    uptimeMs: 60_000,
    balance: 100,
    realizedPnl: 10,
    unrealizedPnl: -2,
    positions: [],
    exposure: 0,
    errors: [],
  };
}

const WALLET_STATUS_OK = { success: true, hasWallet: false, locked: false };

let fetchMock: ReturnType<typeof vi.fn>;

/**
 * History response honoring the API filter params (server-side mirror).
 * nextCursor mirrors the route's opaque composite "<closedAt>:<id>" echo.
 */
function historyBody(url: URL) {
  const p = url.searchParams;
  if (p.get('cursor')) {
    return { success: true, trades: PAGE2, hasMore: false, nextCursor: null };
  }
  const mode = p.get('mode');
  const status = p.get('status');
  const symbol = p.get('symbol');
  const timeframe = p.get('timeframe');
  const strategy = p.get('strategy');
  const filtered = PAGE1.filter(
    (t) =>
      (!mode || t.mode === mode) &&
      (!status || t.status === status) &&
      (!symbol || t.symbol.includes(symbol)) &&
      (!timeframe || t.timeframe === timeframe) &&
      (!strategy || t.strategy === strategy),
  );
  const oldest =
    filtered.length > 1 ? filtered.reduce((a, b) => (a.closedAt <= b.closedAt ? a : b)) : null;
  return {
    success: true,
    trades: filtered,
    hasMore: filtered.length > 1,
    nextCursor: oldest ? `${oldest.closedAt}:${oldest.id}` : null,
  };
}

function installDashboardFetch() {
  fetchMock = createFetchMock([
    { match: (u) => u.pathname === '/api/bot/wallet/status', handler: () => WALLET_STATUS_OK },
    { match: (u) => u.pathname === '/api/bot/config', handler: () => ({ success: false }) },
    {
      match: (u) => u.pathname === '/api/bot/wallet/balance',
      handler: () => ({ success: true, balance: 100 }),
    },
    { match: (u) => u.pathname === '/api/bot/history', handler: historyBody },
    {
      match: (u) => u.pathname === '/api/bot/stats',
      handler: () => ({ success: true, summary: SUMMARY, groups: GROUPS }),
    },
  ]);
  global.fetch = fetchMock as unknown as typeof fetch;
}

function renderRunningDashboard() {
  return render(
    <LiveDashboard
      backendUrl={BACKEND}
      status={statusSnapshot('Running')}
      logs={[]}
      onClose={() => {}}
      liveTrades={[]}
      connectionEpoch={0}
    />,
  );
}

/** Second column of each data row (Symbol) — stable table-shape assertion. */
function rowSymbols(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[1]?.textContent ?? '');
}

/** Click a sortable table header by label. jsdom does not expose `<th>` as a
 *  `columnheader` role, so target the header row's text directly. */
async function clickColumnHeader(label: string) {
  const headerRow = screen.getAllByRole('row')[0];
  await userEvent.click(within(headerRow).getByText(new RegExp(`^${label}(\\s|$)`)));
}

beforeEach(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  HTMLCanvasElement.prototype.getContext = vi.fn(() =>
    createCtxMock(),
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

describe('DashboardTabs (LiveDashboard) — task 4.7', () => {
  beforeEach(() => {
    installDashboardFetch();
  });

  it('renders Overview | Trade History | Statistics tabs with the Overview panel active by default', async () => {
    renderRunningDashboard();
    // LiveDashboard tabs are shadcn Tabs (Radix) — role is `tab`, not `button`.
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Trade History' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Statistics' })).toBeInTheDocument();
    // Overview 3-col grid content is present (Status panel).
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Test strategy')).toBeInTheDocument();
    // No history/stats panel is mounted yet.
    expect(screen.queryByPlaceholderText('Symbol (e.g. BTCUSDT)')).not.toBeInTheDocument();
    expect(screen.queryByText('Trade Statistics')).not.toBeInTheDocument();
  });

  it('switches to Trade History, then Statistics, then back — Overview stays intact', async () => {
    renderRunningDashboard();

    await userEvent.click(screen.getByRole('tab', { name: 'Trade History' }));
    // History panel mounts and renders mocked rows.
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Symbol (e.g. BTCUSDT)')).toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByText('BTCUSDT')).toBeInTheDocument());
    expect(screen.getByText('ETHUSDT')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Statistics' }));
    // Wait on a data-dependent element so the mocked stats fetch has resolved.
    await waitFor(() => expect(screen.getByText('Total Trades')).toBeInTheDocument());
    expect(screen.getByText('Trade Statistics')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Symbol (e.g. BTCUSDT)')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    // Overview panel is back, byte-identical content.
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Test strategy')).toBeInTheDocument();
    expect(screen.queryByText('Trade Statistics')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Symbol (e.g. BTCUSDT)')).not.toBeInTheDocument();
  });
});

describe('TradeHistoryTab — task 4.7', () => {
  beforeEach(() => {
    installDashboardFetch();
  });

  const renderTab = () =>
    render(<TradeHistoryTab backendUrl={BACKEND} liveTrades={[]} reconnectEpoch={0} />);

  it('renders rows from the mocked fetch with a loaded count', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('BTCUSDT')).toBeInTheDocument());
    expect(screen.getByText('ETHUSDT')).toBeInTheDocument();
    expect(screen.getByText('SOLUSDT')).toBeInTheDocument();
    expect(screen.getByText('3 loaded · more available')).toBeInTheDocument();
    // Default sort is closedAt descending (newest first): ETH (3000), BTC (2000), SOL (1000).
    expect(rowSymbols()).toEqual(['ETHUSDT', 'BTCUSDT', 'SOLUSDT']);
  });

  it('sorts by realized PnL — descending then ascending on second click', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('BTCUSDT')).toBeInTheDocument());

    await clickColumnHeader('PnL');
    await waitFor(
      () => expect(rowSymbols()).toEqual(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']), // 10, 3, -5
    );

    await clickColumnHeader('PnL');
    await waitFor(
      () => expect(rowSymbols()).toEqual(['SOLUSDT', 'ETHUSDT', 'BTCUSDT']), // -5, 3, 10
    );
  });

  it('sorts by closedAt ascending when the default column is clicked again', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('BTCUSDT')).toBeInTheDocument());
    expect(rowSymbols()).toEqual(['ETHUSDT', 'BTCUSDT', 'SOLUSDT']); // default desc

    await clickColumnHeader('Closed');
    await waitFor(() => expect(rowSymbols()).toEqual(['SOLUSDT', 'BTCUSDT', 'ETHUSDT'])); // 1000, 2000, 3000
  });

  it('filters by mode — Live hides chaos rows (refetches with mode=live)', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('SOLUSDT')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('tab', { name: 'Live' }));
    await waitFor(() => expect(screen.queryByText('SOLUSDT')).not.toBeInTheDocument());
    expect(screen.getByText('BTCUSDT')).toBeInTheDocument();
    expect(screen.getByText('ETHUSDT')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('mode=live'));
  });

  it('filters by strategy (debounced text input)', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('BTCUSDT')).toBeInTheDocument());

    await userEvent.type(screen.getByPlaceholderText('Strategy'), 'Trend');
    await waitFor(() => expect(screen.queryByText('BTCUSDT')).not.toBeInTheDocument(), {
      timeout: 2000,
    });
    expect(screen.getByText('ETHUSDT')).toBeInTheDocument();
    expect(rowSymbols()).toEqual(['ETHUSDT']);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('strategy=Trend'));
  });

  it('filters by timeframe select', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('BTCUSDT')).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByTitle('Timeframe filter'), '60');
    await waitFor(() => expect(screen.queryByText('BTCUSDT')).not.toBeInTheDocument());
    expect(screen.getByText('ETHUSDT')).toBeInTheDocument();
    expect(rowSymbols()).toEqual(['ETHUSDT']);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('timeframe=60'));
  });

  it('filters by symbol (debounced text input)', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('BTCUSDT')).toBeInTheDocument());

    await userEvent.type(screen.getByPlaceholderText('Symbol (e.g. BTCUSDT)'), 'ETH');
    await waitFor(() => expect(screen.queryByText('BTCUSDT')).not.toBeInTheDocument(), {
      timeout: 2000,
    });
    expect(screen.getByText('ETHUSDT')).toBeInTheDocument();
    expect(rowSymbols()).toEqual(['ETHUSDT']);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('symbol=ETH'));
  });

  it('paginates with Next/Prev using mocked hasMore/nextCursor', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('BTCUSDT')).toBeInTheDocument());

    // Page 1: Prev disabled, Next enabled.
    expect(screen.getByText('Page 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Prev/ })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(screen.getByText('ADAUSDT')).toBeInTheDocument());
    expect(screen.getByText('4 loaded')).toBeInTheDocument();
    expect(screen.getByText('Page 2')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      // Composite cursor "<closedAt>:<id>" of the oldest page-1 record (SOL),
      // URL-encoded by URLSearchParams (':' → '%3A').
      expect.stringContaining('cursor=1700000001000%3At2'),
    );

    await userEvent.click(screen.getByRole('button', { name: /Prev/ }));
    await waitFor(() => expect(screen.queryByText('ADAUSDT')).not.toBeInTheDocument());
    expect(screen.getByText('BTCUSDT')).toBeInTheDocument();
    expect(screen.getByText('Page 1')).toBeInTheDocument();
  });
});

describe('matchesTradeFilter / computeEquityCurve / HISTORY_PAGE_SIZE — exported seams', () => {
  it('HISTORY_PAGE_SIZE matches the API page size contract', () => {
    expect(HISTORY_PAGE_SIZE).toBe(50);
  });

  it('matchesTradeFilter honors mode / status / symbol / timeframe / strategy', () => {
    const liveConfirmed = makeTrade({
      id: 'f1',
      mode: 'live',
      status: 'confirmed',
      symbol: 'BTCUSDT',
      timeframe: '60',
      strategy: 'Scalper',
    });
    const chaosUnknown = makeTrade({
      id: 'f2',
      mode: 'chaos',
      status: 'unknown',
      symbol: 'SOLUSDT',
      timeframe: '15',
      strategy: 'Chaos Mode',
    });

    expect(matchesTradeFilter(liveConfirmed, ALL_FILTER)).toBe(true);
    expect(matchesTradeFilter(chaosUnknown, ALL_FILTER)).toBe(true);
    // mode
    expect(matchesTradeFilter(chaosUnknown, { ...ALL_FILTER, mode: 'live' })).toBe(false);
    expect(matchesTradeFilter(liveConfirmed, { ...ALL_FILTER, mode: 'live' })).toBe(true);
    expect(matchesTradeFilter(liveConfirmed, { ...ALL_FILTER, mode: 'chaos' })).toBe(false);
    // status
    expect(matchesTradeFilter(chaosUnknown, { ...ALL_FILTER, status: 'confirmed' })).toBe(false);
    expect(matchesTradeFilter(liveConfirmed, { ...ALL_FILTER, status: 'unknown' })).toBe(false);
    // symbol
    expect(matchesTradeFilter(liveConfirmed, { ...ALL_FILTER, symbol: 'SOLUSDT' })).toBe(false);
    // timeframe
    expect(matchesTradeFilter(liveConfirmed, { ...ALL_FILTER, timeframe: '15' })).toBe(false);
    // strategy
    expect(matchesTradeFilter(liveConfirmed, { ...ALL_FILTER, strategy: 'Scalper' })).toBe(true);
    expect(matchesTradeFilter(liveConfirmed, { ...ALL_FILTER, strategy: 'Trend' })).toBe(false);
  });

  it('computeEquityCurve returns the exact cumulative curve sorted by closedAt', () => {
    const a = makeTrade({ id: 'a', realizedPnl: 5, closedAt: 1000 });
    const b = makeTrade({ id: 'b', realizedPnl: -2, closedAt: 3000 });
    const c = makeTrade({ id: 'c', realizedPnl: 4, closedAt: 2000 });
    expect(computeEquityCurve([b, a, c])).toEqual([
      { time: 1000, equity: 5 },
      { time: 2000, equity: 9 },
      { time: 3000, equity: 7 },
    ]);
  });

  it('computeEquityCurve ties same-timestamp trades by id and handles empty input', () => {
    const a = makeTrade({ id: 'a', realizedPnl: 1, closedAt: 500 });
    const b = makeTrade({ id: 'b', realizedPnl: 2, closedAt: 500 });
    expect(computeEquityCurve([b, a])).toEqual([
      { time: 500, equity: 1 },
      { time: 500, equity: 3 },
    ]);
    expect(computeEquityCurve([])).toEqual([]);
  });
});

describe('StatisticsTab — task 4.7', () => {
  const installStatsFetch = (opts: { reject?: boolean; empty?: boolean } = {}) => {
    const statsCalls: string[] = [];
    if (opts.reject) {
      fetchMock = vi.fn(() => Promise.reject(new Error('Network down')));
    } else {
      fetchMock = createFetchMock([
        {
          match: (u) => u.pathname === '/api/bot/stats',
          handler: (u) => {
            statsCalls.push(u.toString());
            return {
              success: true,
              summary: opts.empty ? ZERO_SUMMARY : SUMMARY,
              groups: opts.empty ? null : GROUPS,
            };
          },
        },
        {
          match: (u) => u.pathname === '/api/bot/history',
          handler: () => ({
            success: true,
            trades: opts.empty ? [] : [TRADE_BTC, TRADE_SOL, TRADE_ETH],
            hasMore: false,
            nextCursor: null,
          }),
        },
      ]);
    }
    global.fetch = fetchMock as unknown as typeof fetch;
    return statsCalls;
  };

  const renderTab = () =>
    render(<StatisticsTab backendUrl={BACKEND} liveTrades={[]} reconnectEpoch={0} />);

  it('renders the global metric cards from the mocked summary', async () => {
    installStatsFetch();
    renderTab();

    // Wait on a data-dependent card so the mocked stats fetch has resolved.
    await waitFor(() => expect(screen.getByText('Total Trades')).toBeInTheDocument());
    expect(screen.getByText('Trade Statistics')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Win Rate')).toBeInTheDocument();
    expect(screen.getByText('58.3%')).toBeInTheDocument();
    expect(screen.getByText('Gross PnL')).toBeInTheDocument();
    expect(screen.getByText('Net PnL')).toBeInTheDocument();
    expect(screen.getByText('+$119.25')).toBeInTheDocument();
    expect(screen.getByText('Fees')).toBeInTheDocument();
    expect(screen.getByText('$4.20')).toBeInTheDocument();
    expect(screen.getByText('Profit Factor')).toBeInTheDocument();
    expect(screen.getByText('1.85')).toBeInTheDocument();
    expect(screen.getByText('Max Drawdown')).toBeInTheDocument();
    expect(screen.getByText('$22.00')).toBeInTheDocument();

    // Equity curve + grouped PnL chart sections render (Recharts renders in real browser, not jsdom).
    await waitFor(() => expect(screen.getByText('Equity Curve')).toBeInTheDocument());
    expect(screen.getByText('PnL by Strategy')).toBeInTheDocument();
  });

  it('groupBy toggle refetches stats with the new groupBy', async () => {
    const statsCalls = installStatsFetch();
    renderTab();
    await waitFor(() => expect(screen.getByText('Trade Statistics')).toBeInTheDocument());
    expect(screen.getByText('PnL by Strategy')).toBeInTheDocument();

    // The groupBy control is now a shadcn Select (Radix): open the combobox
    // trigger, then pick the option from the portal'd listbox (native
    // selectOptions no longer applies).
    await userEvent.click(
      screen.getByRole('combobox', {
        name: 'Group the PnL comparison chart by strategy, timeframe, or asset',
      }),
    );
    await userEvent.click(await screen.findByRole('option', { name: 'Asset' }));
    await waitFor(() => expect(screen.getByText('PnL by Asset')).toBeInTheDocument());
    expect(statsCalls.some((u) => u.includes('groupBy=asset'))).toBe(true);
  });

  it('renders empty states when the mocked summary has zero trades', async () => {
    installStatsFetch({ empty: true });
    renderTab();

    await waitFor(() => expect(screen.getByText('No trades yet.')).toBeInTheDocument());
    expect(screen.getByText('No trades to chart.')).toBeInTheDocument();
    expect(screen.getByText('No groups to chart.')).toBeInTheDocument();
    // No chart data rendered when there are no trades — and no crash.
  });

  it('renders the error state when the stats fetch rejects', async () => {
    installStatsFetch({ reject: true });
    renderTab();

    await waitFor(() =>
      expect(
        screen.getAllByText(/Network error — is the backend running\?/).length,
      ).toBeGreaterThan(0),
    );
  });
});

describe('useTradeHistory — live merge + reconnect refetch', () => {
  beforeEach(() => {
    installDashboardFetch();
  });

  it('merges a bot:trade live trade at the head (newest closedAt) without refetching', async () => {
    let props = {
      backendUrl: BACKEND,
      filter: ALL_FILTER,
      enabled: true,
      reconnectEpoch: 0,
      liveTrades: [] as TradeRecord[],
    };
    const { result, rerender } = renderHook(() => useTradeHistory(props));
    await waitFor(() => expect(result.current.trades).toHaveLength(3));
    const callsBefore = fetchMock.mock.calls.length;

    const liveTrade = makeTrade({
      id: 't-live',
      symbol: 'NEWUSDT',
      realizedPnl: 7,
      closedAt: 1_700_000_004_000, // newest
      strategy: 'Scalper',
      timeframe: '60',
    });
    props = { ...props, liveTrades: [liveTrade] };
    rerender();

    await waitFor(() => expect(result.current.trades).toHaveLength(4));
    expect(result.current.trades[0].id).toBe('t-live');
    // Client-side merge — no extra REST page load.
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('refetches page 0 when reconnectEpoch bumps (WS reconnect)', async () => {
    let props = {
      backendUrl: BACKEND,
      filter: ALL_FILTER,
      enabled: true,
      reconnectEpoch: 0,
      liveTrades: [] as TradeRecord[],
    };
    const { result, rerender } = renderHook(() => useTradeHistory(props));
    await waitFor(() => expect(result.current.trades).toHaveLength(3));
    const callsBefore = fetchMock.mock.calls.length;

    props = { ...props, reconnectEpoch: 1 };
    rerender();

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(result.current.trades).toHaveLength(3);
  });
});
