import { test, expect, type Page } from '@playwright/test';

/**
 * User-behavior E2E for the Trade History + Statistics dashboards
 * (OpenSpec change add-trade-history-stats-dashboard, task 4.8, design D6).
 *
 * House mandate: features are tested as user behavior; integration tests mock
 * the backend. Every request under /api/** is intercepted via page.route —
 * the real backend is never queried and no real data can be touched. The
 * WebSocket is stubbed in-page with a deterministic Idle bot snapshot so
 * LiveDashboard mounts without any real connection.
 */

const FRONTEND = 'http://localhost:3000';

// ---- Fixtures (mirror of backend/src/routes/trade-history.ts contracts) ----

const TRADES = {
  btc: {
    id: 't-btc',
    botId: 'bot-1',
    symbol: 'BTCUSDT',
    side: 'buy',
    entryPrice: 100,
    exitPrice: 110,
    size: 0.5,
    fees: 0.1,
    realizedPnl: 10,
    dex: 'jupiter-swap',
    openedAt: 1_700_000_001_500,
    closedAt: 1_700_000_002_000,
    strategy: 'Scalper',
    timeframe: '15',
    mode: 'live',
    status: 'confirmed',
  },
  sol: {
    id: 't-sol',
    botId: 'bot-1',
    symbol: 'SOLUSDT',
    side: 'sell',
    entryPrice: 50,
    exitPrice: 45,
    size: 1,
    fees: 0.05,
    realizedPnl: -5,
    dex: 'jupiter-swap',
    openedAt: 1_700_000_000_600,
    closedAt: 1_700_000_001_000,
    strategy: 'Chaos Mode',
    timeframe: '5',
    mode: 'chaos',
    status: 'confirmed',
  },
  eth: {
    id: 't-eth',
    botId: 'bot-1',
    symbol: 'ETHUSDT',
    side: 'buy',
    entryPrice: 3000,
    exitPrice: 3100,
    size: 0.1,
    fees: 0.2,
    realizedPnl: 3,
    dex: 'jupiter-swap',
    openedAt: 1_700_000_002_400,
    closedAt: 1_700_000_003_000,
    strategy: 'Trend',
    timeframe: '60',
    mode: 'live',
    status: 'confirmed',
  },
  ada: {
    id: 't-ada',
    botId: 'bot-1',
    symbol: 'ADAUSDT',
    side: 'buy',
    entryPrice: 0.5,
    exitPrice: 0.48,
    size: 100,
    fees: 0.01,
    realizedPnl: -2,
    dex: 'jupiter-swap',
    openedAt: 1_700_000_000_200,
    closedAt: 1_700_000_000_500,
    strategy: 'Scalper',
    timeframe: '15',
    mode: 'live',
    status: 'confirmed',
  },
};

const SUMMARY = {
  totalTrades: 12,
  winningTrades: 7,
  losingTrades: 5,
  winRate: 7 / 12,
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

const ZERO_SUMMARY = {
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

const GROUPS = [
  { key: 'Scalper', stats: { ...SUMMARY, totalPnl: 80 } },
  { key: 'Chaos Mode', stats: { ...SUMMARY, totalPnl: -30 } },
];

function defaultApiConfig() {
  return {
    historyTrades: [TRADES.btc, TRADES.sol, TRADES.eth], // newest-first page 1
    historyPage2: [TRADES.ada], // older page, served on cursor
    summary: SUMMARY,
    groups: GROUPS,
  };
}

/**
 * Stub the WebSocket in-page and mock every /api/** request. The FakeWS only
 * delivers a deterministic Idle bot snapshot on the bot socket (/ws/bot); all
 * other sockets stay inert so the app never connects anywhere real.
 */
async function installApiMocks(
  page: Page,
  cfg: ReturnType<typeof defaultApiConfig>,
  statsRequests: string[],
) {
  await page.addInitScript(() => {
    class FakeWebSocket {
      url: string;
      readyState = 0;
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      onopen: (() => void) | null = null;
      onmessage: ((ev: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: ((ev: unknown) => void) | null = null;

      constructor(url: string) {
        this.url = url;
        if (url.includes('/ws/bot')) {
          setTimeout(() => {
            if (this.onopen) this.onopen();
            if (this.onmessage) {
              this.onmessage({
                data: JSON.stringify({
                  channel: 'bot:snapshot',
                  type: 'snapshot',
                  data: {
                    status: {
                      state: 'Idle',
                      strategyName: 'E2E Strategy',
                      dex: 'jupiter-swap',
                      walletPublicKey: null,
                      startedAt: null,
                      uptimeMs: 0,
                      balance: 0,
                      realizedPnl: 0,
                      unrealizedPnl: 0,
                      positions: [],
                      exposure: 0,
                      errors: [],
                    },
                    chaosSignals: [],
                    chaosHeartbeat: null,
                  },
                }),
              });
            }
          }, 0);
        }
      }
      send() {}
      close() {}
      addEventListener() {}
      removeEventListener() {}
    }
    (window as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
  });

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const respond = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    switch (path) {
      case '/api/bot/wallet/status':
        return respond({ success: true, hasWallet: false, locked: false });
      case '/api/bot/config':
        return respond({
          success: true,
          strategySource: '//@version=5\nstrategy("x")',
          dex: 'jupiter-swap',
          risk: { maxDailyLoss: 1 },
          autoSelect: true,
        });
      case '/api/bot/wallet/balance':
        return respond({ success: true, balance: 100 });
      case '/api/bot/history': {
        const p = url.searchParams;
        const mode = p.get('mode');
        const status = p.get('status');
        const symbol = p.get('symbol');
        const timeframe = p.get('timeframe');
        const strategy = p.get('strategy');
        const filter = (t: (typeof TRADES)['btc']) =>
          (!mode || t.mode === mode) &&
          (!status || t.status === status) &&
          (!symbol || t.symbol.includes(symbol)) &&
          (!timeframe || t.timeframe === timeframe) &&
          (!strategy || t.strategy === strategy);
        if (p.get('cursor')) {
          return respond({
            success: true,
            trades: cfg.historyPage2.filter(filter),
            hasMore: false,
            nextCursor: null,
          });
        }
        const page1 = cfg.historyTrades.filter(filter);
        const oldest =
          page1.length > 0 ? page1.reduce((a, b) => (a.closedAt <= b.closedAt ? a : b)) : null;
        return respond({
          success: true,
          trades: page1,
          hasMore: page1.length > 0,
          // Composite cursor "<closedAt>:<id>" — opaque, echoed back verbatim.
          nextCursor: oldest ? `${oldest.closedAt}:${oldest.id}` : null,
        });
      }
      case '/api/bot/stats': {
        statsRequests.push(url.href);
        return respond({ success: true, summary: cfg.summary, groups: cfg.groups });
      }
      case '/api/ohlcv':
      case '/api/ohlcv/seed':
        return respond({ data: [], hasMore: false });
      case '/api/scripts':
      case '/api/scripts/built-in':
        return respond({ scripts: [] });
      case '/api/indicators':
        return respond({ indicators: [] });
      default:
        return respond({ success: true });
    }
  });
}

/** The dashboard opens via the toolbar TradingBotControlButton toggle. */
async function openDashboard(page: Page) {
  await page.goto(FRONTEND);
  await page.getByRole('button', { name: 'Bot panel' }).click();
  // LiveDashboard mounts once the (stubbed) bot snapshot sets botStatus.
  await expect(page.getByRole('tab', { name: 'Trade History' })).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * The dashboard content is scoped to the bot panel region (ControlPanel renders
 * the active panel inside a `<div role="region" aria-label="bot panel">`). All
 * assertions on dashboard content are scoped to that region so they don't match
 * the underlying chart app. The region uniquely contains the Trade History /
 * Statistics tabs.
 */
function dashboardPanel(page: Page) {
  // The bot dashboard is rendered by ControlPanel inside a
  // <div role="region" aria-label="bot panel"> (App.tsx → ControlPanel.tsx:88).
  // That accessible-name handle is stable and uniquely targets the dashboard
  // content (the Trade History / Statistics tabs live inside it), immune to the
  // inline-style / class churn that broke the old `div[style*="position: fixed"]`.
  return page.getByRole('region', { name: 'bot panel' });
}

test.describe('Trade History + Statistics dashboards (D6 user flows)', () => {
  test('user opens the dashboard, browses Trade History, filters Live mode, paginates', async ({
    page,
  }) => {
    const cfg = defaultApiConfig();
    const statsRequests: string[] = [];
    await installApiMocks(page, cfg, statsRequests);
    await openDashboard(page);

    await page.getByRole('tab', { name: 'Trade History' }).click();
    const dashboard = dashboardPanel(page);
    await expect(dashboard.getByRole('cell', { name: 'BTCUSDT' })).toBeVisible();
    await expect(dashboard.getByRole('cell', { name: 'ETHUSDT' })).toBeVisible();
    await expect(dashboard.getByRole('cell', { name: 'SOLUSDT' })).toBeVisible();

    // Live mode hides the chaos-mode row (refetches with mode=live).
    await dashboard.getByRole('tab', { name: 'Live', exact: true }).click();
    await expect(dashboard.getByRole('cell', { name: 'SOLUSDT' })).toHaveCount(0);
    await expect(dashboard.getByRole('cell', { name: 'BTCUSDT' })).toHaveCount(1);
    await expect(dashboard.getByRole('cell', { name: 'ETHUSDT' })).toHaveCount(1);

    // Next page loads the older trade; Prev returns to page 1.
    await dashboard.getByRole('button', { name: /Next/ }).click();
    await expect(dashboard.getByRole('cell', { name: 'ADAUSDT' })).toBeVisible();
    await expect(dashboard.getByText('Page 2')).toBeVisible();
    await dashboard.getByRole('button', { name: /Prev/ }).click();
    await expect(dashboard.getByRole('cell', { name: 'ADAUSDT' })).toHaveCount(0);
  });

  test('user opens Statistics: metric cards, equity + grouped charts, groupBy toggle', async ({
    page,
  }) => {
    const cfg = defaultApiConfig();
    const statsRequests: string[] = [];
    await installApiMocks(page, cfg, statsRequests);
    await openDashboard(page);

    await page.getByRole('tab', { name: 'Statistics' }).click();
    const dashboard = dashboardPanel(page);
    await expect(dashboard.getByText('Trade Statistics')).toBeVisible();
    await expect(dashboard.getByText('Total Trades')).toBeVisible();
    await expect(dashboard.getByText('12', { exact: true })).toBeVisible();
    await expect(dashboard.getByText('Net PnL')).toBeVisible();

    // Equity curve + grouped PnL charts (Recharts SVG, not <canvas>) both render.
    // Scoping to the panel keeps the count exact (the main app chart is outside it).
    await expect(dashboard.locator('[data-slot="chart"]')).toHaveCount(2);

    // Group-by toggle refetches stats with groupBy=asset and re-renders.
    await dashboard
      .getByRole('combobox', { name: 'Group the PnL comparison chart by strategy, timeframe, or asset' })
      .click();
    await page.getByRole('option', { name: 'Asset' }).click();
    await expect(dashboard.getByText('PnL by Asset')).toBeVisible();
    await expect.poll(() => statsRequests.some((u) => u.includes('groupBy=asset'))).toBeTruthy();
  });

  test('empty backend shows empty states in History and Statistics without crashing', async ({
    page,
  }) => {
    const cfg = defaultApiConfig();
    cfg.historyTrades = [];
    cfg.historyPage2 = [];
    cfg.summary = ZERO_SUMMARY;
    cfg.groups = null;
    const statsRequests: string[] = [];
    await installApiMocks(page, cfg, statsRequests);
    await openDashboard(page);

    await page.getByRole('tab', { name: 'Trade History' }).click();
    const dashboard = dashboardPanel(page);
    await expect(dashboard.getByText('No trades yet.')).toBeVisible();

    await page.getByRole('tab', { name: 'Statistics' }).click();
    await expect(dashboard.getByText('No trades yet.')).toBeVisible();
    await expect(dashboard.getByText('No trades to chart.')).toBeVisible();
    await expect(dashboard.getByText('No groups to chart.')).toBeVisible();
    await expect(dashboard.locator('[data-slot="chart"]')).toHaveCount(0);
  });
});
