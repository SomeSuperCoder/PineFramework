import { test, expect, type Page } from '@playwright/test';
import { enterAppDirectly } from './helpers';

/**
 * QA ACCEPTANCE — Shadcn chart swap in the backtest results popup.
 * (OpenSpec: BacktestResults.tsx canvas → ChartContainer + Recharts.)
 *
 * User journey under test:
 *   1. App launches, user navigates to the Backtest panel.
 *   2. User pastes a strategy, walks the 5-step wizard, clicks "Run Backtest".
 *   3. The StrategyResultsPopup opens and shows: stat grid, "Equity & Drawdown"
 *      Recharts line chart (2 series), legend, interactive tooltip, trade table.
 *   4. CSV export still works; popup closes and re-opens cleanly.
 *   5. No uncaught page errors.
 *
 * House integration-test safety rule: EVERY /api/** request is route-mocked and
 * the WebSocket is stubbed in-page — the real backend is never queried and no
 * real data can be touched. Nothing needs cleanup because nothing can persist.
 */

const FRONTEND = 'http://localhost:3000';

/** Daily equity/drawdown points for a realistic multi-point chart. */
function makeEquityPoints(count = 20, startMs = Date.UTC(2026, 6, 1)) {
  const points = [];
  let equity = 10000;
  for (let i = 0; i < count; i++) {
    equity = equity + (i % 3 === 0 ? 120 : i % 3 === 1 ? -40 : 80);
    points.push({
      time: startMs + i * 86_400_000,
      equity: Math.round(equity * 100) / 100,
      // Backend contract: buildDrawdownCurve = peak − eq ≥ 0 (non-negative).
      drawdown: i > 4 ? Math.round((i - 4) * 25 * 100) / 100 : 0,
      balance: Math.round(equity * 100) / 100,
    });
  }
  return points;
}

const RESULT = {
  metrics: {
    totalTrades: 3,
    winningTrades: 2,
    losingTrades: 1,
    winRate: 66.67,
    profitFactor: 1.85,
    totalPnl: 123.4,
    totalPnlPercent: 1.23,
    maxDrawdown: 150,
    maxDrawdownPercent: 1.5,
    sharpeRatio: 1.2,
    sortinoRatio: 1.1,
    averageWin: 80,
    averageLoss: -40,
    largestWin: 100,
    largestLoss: -50,
    averageTradeDuration: 12,
    commission: 4.2,
  },
  equityCurve: [10000, 10120, 10080, 10160, 10240, 10360],
  drawdownCurve: [0, 0, 0, 0, 0, 25],
  trades: [
    {
      id: 't-qa-1',
      direction: 'long',
      entryPrice: 100,
      exitPrice: 110,
      entryTime: Date.UTC(2026, 6, 2),
      exitTime: Date.UTC(2026, 6, 3),
      quantity: 1,
      pnl: 10,
      pnlPercent: 10,
      commission: 0.5,
      entryName: 'long',
      exitName: 'long',
      mae: -2,
      mfe: 4,
      barsHeld: 8,
    },
    {
      id: 't-qa-2',
      direction: 'short',
      entryPrice: 50,
      exitPrice: 45,
      entryTime: Date.UTC(2026, 6, 4),
      exitTime: Date.UTC(2026, 6, 5),
      quantity: 1,
      pnl: 5,
      pnlPercent: 10,
      commission: 0.5,
      entryName: 'short',
      exitName: 'short',
      mae: -1,
      mfe: 3,
      barsHeld: 5,
    },
    {
      id: 't-qa-3',
      direction: 'long',
      entryPrice: 30,
      exitPrice: 28,
      entryTime: Date.UTC(2026, 6, 6),
      exitTime: Date.UTC(2026, 6, 8),
      quantity: 2,
      pnl: -4,
      pnlPercent: -6.67,
      commission: 0.5,
      entryName: 'long',
      exitName: 'long',
      mae: -3,
      mfe: 1,
      barsHeld: 10,
    },
  ],
  orders: [],
  equityPoints: makeEquityPoints(),
  monthlyReturns: { '2026-07': 1.23 },
  buyHoldReturn: 1.5,
};

/** Stub the WebSocket in-page and mock every /api/** request (house pattern). */
async function installApiMocks(page: Page) {
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
    const respond = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    switch (path) {
      case '/api/backtest': {
        if (route.request().method() === 'POST') {
          return respond({ job_id: 'qa-e2e-job' });
        }
        return respond({ success: true });
      }
      case '/api/backtest/qa-e2e-job':
        return respond({
          status: 'completed',
          progress: 100,
          phase: 'Building results',
          result_url: '/api/backtest/qa-e2e-job/result',
        });
      case '/api/backtest/qa-e2e-job/result':
        return respond(RESULT);
      case '/api/backtest/dex-fee':
        return respond({ dexFeeBps: 25, source: 'mock', solPriceUsd: 150 });
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

const STRATEGY_SOURCE =
  "//@version=5\nstrategy('QA Chart Strategy', initial_capital=10000)\nif close > open\n    strategy.entry('long', strategy.long)";

/** Walk the 5-step wizard and click Run Backtest. */
async function runBacktest(page: Page) {
  // Step 1 — Strategy: paste raw source (deterministic; no script-list dependency).
  await page.getByRole('button', { name: 'Paste raw source' }).click();
  await page.locator('textarea').fill(STRATEGY_SOURCE);
  await page.getByRole('button', { name: /Next/ }).click();

  // Step 2 — Market (defaults: BTCUSDT / 60).
  await page.getByRole('button', { name: /Next/ }).click();

  // Step 3 — Capital & Date Range (defaults: $10k, last 30 days).
  await page.getByRole('button', { name: /Next/ }).click();

  // Step 4 — Commission (jupiter_manual default — wait out the mocked fee fetch).
  const nextBtn = page.getByRole('button', { name: /Next/ });
  await expect(nextBtn).toBeEnabled({ timeout: 10_000 });
  await nextBtn.click();

  // Step 5 — Review & Run.
  await page.getByRole('button', { name: 'Run Backtest' }).click();
}

/** The results dialog + the chart inside it. */
function resultsDialog(page: Page) {
  return page.getByRole('dialog').filter({ hasText: 'Backtest Results' });
}

test.describe('Backtest results popup — Shadcn/Recharts chart acceptance', () => {
  test('user runs a backtest and sees a working Equity & Drawdown chart', async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await installApiMocks(page);

    // 1 — Launch path: app boots, user opens the Backtest panel.
    await enterAppDirectly(page);
    await page.goto(FRONTEND);
    await page.getByRole('button', { name: 'Backtest panel' }).click();
    await expect(page.getByText('Backtest Settings')).toBeVisible();

    // 2 — Run the wizard.
    await runBacktest(page);

    // Popup opens with results.
    const dialog = resultsDialog(page);
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    // Stat grid intact.
    await expect(dialog.getByText('Net Profit')).toBeVisible();
    await expect(dialog.getByText('Win Rate')).toBeVisible();

    // 3 — Chart renders: Shadcn ChartContainer present with two painted Line series.
    const chart = dialog.locator('[data-slot="chart"]');
    await expect(chart).toBeVisible();
    await expect(chart.locator('.recharts-line-curve')).toHaveCount(2);
    // Wrapper keeps the old layout height (h-[200px] on the card content div).
    const wrapper = dialog.locator('.h-\\[200px\\]');
    await expect(wrapper).toHaveCount(1);

    // Legend present with both series labels.
    await expect(chart.getByText('Equity')).toBeVisible();
    await expect(chart.getByText('Drawdown')).toBeVisible();

    // Drawdown curve is actually painted and visible (non-degenerate path with
    // real width — proves the dd series renders inside the [0, dataMax+10] domain,
    // not clipped to nothing).
    const ddCurve = chart.locator('.recharts-line-curve').nth(1);
    await expect(ddCurve).toBeVisible();
    const ddBox = (await ddCurve.boundingBox())!;
    expect(ddBox.width).toBeGreaterThan(0);

    // X-axis ticks render dates (not blank). SVG <text> is the label element;
    // the parent .recharts-cartesian-axis-tick <g> carries no innerText.
    const xTick = chart.locator('.recharts-cartesian-axis-tick-value').first();
    await expect(xTick).toHaveCount(1);
    await expect(xTick).toContainText(/\d/);

    // Tooltip: hover the chart plot → tooltip shows equity + drawdown values.
    const surface = chart.locator('.recharts-surface');
    const box = (await surface.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    const tooltip = page.locator('.recharts-tooltip-wrapper');
    await expect(tooltip).toBeVisible({ timeout: 5_000 });
    await expect(tooltip).toContainText('Equity');
    await expect(tooltip).toContainText('Drawdown');
    await expect(tooltip).toContainText(/\d/);

    // Trade table intact.
    await expect(dialog.getByRole('cell', { name: 'L' }).first()).toBeVisible();

    // 4 — CSV export intact. The Radix dropdown renders in a portal, so the
    // menu item lives on the page, not inside the dialog.
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitem', { name: 'Export CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('backtest-trades.csv');

    // No uncaught page errors.
    expect(pageErrors).toEqual([]);

    // 5 — Popup closes cleanly (header ✕ button, title="Close").
    await page.getByTitle('Close').click();
    await expect(dialog).toHaveCount(0);
    // Backtest panel still alive; wizard reset to step 1.
    await expect(page.getByText('Backtest Settings')).toBeVisible();

    // 6 — Re-run: popup reopens and the chart renders again.
    await runBacktest(page);
    const dialog2 = resultsDialog(page);
    await expect(dialog2).toBeVisible({ timeout: 15_000 });
    await expect(dialog2.locator('[data-slot="chart"] .recharts-line-curve')).toHaveCount(2);
    await expect(dialog2.locator('[data-slot="chart"]').getByText('Drawdown')).toBeVisible();

    // Report any console errors (non-fatal unless they are uncaught page errors).
    test.info().annotations.push({
      type: 'console-errors',
      description: JSON.stringify(consoleErrors),
    });
  });
});
