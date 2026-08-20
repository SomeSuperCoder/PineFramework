import { test, expect, type APIResponse, type Page } from '@playwright/test';
import { enterAppDirectly } from './helpers';

/**
 * Dashboard toolbar (shadcn migration) — user-flow coverage.
 *
 * The toolbar above the chart (Add / Editor / Backtest / Auto Scale·Manual /
 * Debug / Go to Date / Export / Errors) was extracted from App.tsx into
 * DashboardToolbar.tsx using shadcn primitives. Behavior must be preserved
 * from the user's side: dialogs open, toggles flip their state (now exposed
 * via aria-pressed), and the connection status is announced.
 *
 * Safety: interactions are state-only (dialogs, toggles, popover). No form is
 * submitted, no chart teleport is triggered, Export is never clicked (it
 * alerts on success), and no backend state is created or mutated.
 */

const FRONTEND = 'http://localhost:3000';

/** The toolbar container is the direct parent of the Symbol select. */
function toolbarLocator(page: Page) {
  return page.getByLabel('Symbol').locator('..');
}

/**
 * Serve deterministic OHLCV seed data so the chart renders identically to the
 * chunk-boundary specs (copy of the established fixture pattern).
 */
async function setupSeedDataInterception(page: Page) {
  // Hardened seed fetch: the backend connection is occasionally reset
  // (ECONNRESET on GET /api/ohlcv/seed) during parallel e2e setup. Retry the
  // seed GET up to 3 times with short backoff so a transient network error
  // cannot fail the spec. Real failures are NOT swallowed — if no attempt
  // yields an ok response, the last error is rethrown, and the response shape
  // is still asserted (data.length > 100) after the retries.
  let seedRes: APIResponse | undefined;
  let seedErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await page.request.get('http://localhost:8081/api/ohlcv/seed');
      if (res.ok()) {
        seedRes = res;
        break;
      }
      seedErr = new Error(`seed GET returned ${res.status()}`);
    } catch (err) {
      seedErr = err; // e.g. ECONNRESET — transient, retry
    }
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  if (!seedRes) throw seedErr;
  const seedData = (await seedRes.json()).data;
  expect(seedData.length).toBeGreaterThan(100);

  const TOTAL_BARS = 10_000;
  const INITIAL_COUNT = 300;
  const START_OFFSET = 5000;
  let barsServed = 0;

  const seedRouteHandler = async (route: any) => {
    const url = new URL(route.request().url());
    const end = url.searchParams.get('end') || url.searchParams.get('before');
    const limit = parseInt(url.searchParams.get('limit') || url.searchParams.get('count') || '1000', 10);

    if (!end) {
      barsServed = INITIAL_COUNT;
      const bars = seedData.slice(START_OFFSET, START_OFFSET + INITIAL_COUNT);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: bars, hasMore: true }) });
      return;
    }

    const endTs = parseInt(end, 10);
    const refIdx = seedData.findIndex((b: any) => b.timestamp >= endTs);
    const start = Math.max(0, (refIdx >= 0 ? refIdx : seedData.length) - limit);
    if (start <= 0 && barsServed >= INITIAL_COUNT) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], hasMore: false }) });
      return;
    }
    const bars = seedData.slice(Math.max(0, start), Math.min(start + limit, seedData.length));
    barsServed += bars.length;
    const hasMore = start > 0 && barsServed < TOTAL_BARS;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: bars, hasMore }) });
  };

  await page.route(/\/api\/ohlcv\b/, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/seed')) { await route.fallback(); return; }
    await seedRouteHandler(route);
  });
  await page.route(/\/api\/bars\b/, async (route) => { await seedRouteHandler(route); });
}

/** Launch the dashboard like the chunk-boundary specs: seed data + canvas. */
async function openDashboard(page: Page) {
  await setupSeedDataInterception(page);
  await enterAppDirectly(page);
  await page.goto(FRONTEND);
  await page.waitForSelector('canvas', { timeout: 30_000 });
}

test.describe('Dashboard toolbar (shadcn migration)', () => {
  test('renders above the chart with all action buttons and controls', async ({ page }) => {
    await openDashboard(page);
    const toolbar = toolbarLocator(page);

    // Left side: market selects + connection status
    await expect(toolbar.getByLabel('Symbol')).toBeVisible();
    await expect(toolbar.getByLabel('Timeframe')).toBeVisible();
    await expect(toolbar.getByRole('status')).toBeVisible();

    // Quick action buttons (Export is presence-only — it alerts on success)
    for (const name of ['Add', 'Editor', 'Backtest', /Auto Scale|Manual/, 'Debug', 'Go to Date', 'Export', 'Errors']) {
      await expect(toolbar.getByRole('button', { name })).toBeVisible();
    }

    // The toolbar sits ABOVE the chart canvas
    const toolbarBox = await toolbar.boundingBox();
    const canvasBox = await page.locator('canvas').first().boundingBox();
    expect(toolbarBox).not.toBeNull();
    expect(canvasBox).not.toBeNull();
    expect(toolbarBox!.y).toBeLessThan(canvasBox!.y);
  });

  test('Editor opens the Pine Script Editor dialog', async ({ page }) => {
    await openDashboard(page);
    await toolbarLocator(page).getByRole('button', { name: 'Editor' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pine Script Editor' })).toBeVisible();

    // Close (Escape) without editing — no data mutation
    await dialog.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('Debug toggles aria-pressed and keeps its visible label', async ({ page }) => {
    await openDashboard(page);
    const debug = toolbarLocator(page).getByRole('button', { name: 'Debug' });

    await expect(debug).toHaveAttribute('aria-pressed', 'false');
    await debug.click();
    await expect(debug).toHaveAttribute('aria-pressed', 'true');
    await expect(debug).toContainText('Debug');
    await debug.click();
    await expect(debug).toHaveAttribute('aria-pressed', 'false');
  });

  test('Auto Scale toggles between Auto Scale and Manual with aria-pressed', async ({ page }) => {
    await openDashboard(page);
    const toolbar = toolbarLocator(page);

    const auto = toolbar.getByRole('button', { name: 'Auto Scale' });
    await expect(auto).toHaveAttribute('aria-pressed', 'true');
    await auto.click();

    const manual = toolbar.getByRole('button', { name: 'Manual' });
    await expect(manual).toHaveAttribute('aria-pressed', 'false');
    await manual.click();

    await expect(toolbar.getByRole('button', { name: 'Auto Scale' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('Go to Date opens the date popover without mutating data', async ({ page }) => {
    await openDashboard(page);
    await toolbarLocator(page).getByRole('button', { name: 'Go to Date' }).click();

    const popup = page.getByRole('dialog');
    await expect(popup).toBeVisible();
    await expect(popup.getByText('Go to Date')).toBeVisible();
    await expect(popup.getByLabel('Date')).toBeVisible();
    await expect(popup.getByLabel(/Time \(MSK/)).toBeVisible();

    // Cancel without submitting — no chart teleport, no data mutation
    await popup.getByRole('button', { name: 'Cancel' }).click();
    await expect(popup).toBeHidden();
  });

  test('Errors toggles the error console popover and shows a badge count when errors exist', async ({ page }) => {
    // Force the chart-data fetch to fail deterministically → error state → badge.
    // Indicators are intercepted as empty so the error comes ONLY from the
    // forced OHLCV fetch. No backend state is created: pure route interception.
    await page.route(/\/api\/indicators/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ indicators: [] }) }),
    );
    await page.route(/\/api\/ohlcv\b/, (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/seed')) return route.fallback();
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'e2e forced failure' }) });
    });
    await enterAppDirectly(page);
    await page.goto(FRONTEND);

    const errorsBtn = toolbarLocator(page).getByRole('button', { name: 'Errors' });
    await expect(errorsBtn).toBeVisible({ timeout: 30_000 });
    await expect(errorsBtn).toHaveAttribute('aria-expanded', 'false');

    // Toggle opens the shadcn popover anchored to the Errors button (Radix
    // trigger wires aria-expanded). Close via its own control, then Escape.
    await errorsBtn.click();
    await expect(errorsBtn).toHaveAttribute('aria-expanded', 'true');
    const popover = page.getByRole('dialog');
    await expect(popover).toBeVisible();
    await expect(popover.getByRole('heading', { name: /Errors/ })).toBeVisible();

    await popover.getByRole('button', { name: 'Close errors' }).click();
    await expect(errorsBtn).toHaveAttribute('aria-expanded', 'false');

    await errorsBtn.click();
    await expect(errorsBtn).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(errorsBtn).toHaveAttribute('aria-expanded', 'false');

    // The forced fetch failure surfaces an error → badge count becomes visible
    await expect(errorsBtn).toContainText(/[1-9]\d*/, { timeout: 30_000 });
  });

  test('Errors popover shows the "No errors" empty state when no errors exist', async ({ page }) => {
    // Deterministic: no forced failures + empty indicator list → no errors.
    await page.route(/\/api\/indicators/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ indicators: [] }) }),
    );
    await openDashboard(page);

    const errorsBtn = toolbarLocator(page).getByRole('button', { name: 'Errors' });
    await expect(errorsBtn).toBeVisible({ timeout: 30_000 });
    await errorsBtn.click();

    const popover = page.getByRole('dialog');
    await expect(popover).toBeVisible();
    await expect(popover.getByRole('heading', { name: 'Errors (0)' })).toBeVisible();
    await expect(popover.getByText('No errors')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(errorsBtn).toHaveAttribute('aria-expanded', 'false');
  });

  test('EngineError OBJECT from /api/execute renders in the Errors popover without crashing (black-screen regression)', async ({ page }) => {
    // The dashboard auto-executes each indicator on load. Feed it ONE indicator
    // whose /api/execute response mirrors the REAL backend wire shape
    // (backend/src/routes/execute.ts:178 sends the EngineError object raw;
    // JSON serialization drops `span: undefined`, leaving {message, barIndex,
    // stack}). Pure route interception — no backend state is created.
    await page.route(/\/api\/indicators/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          indicators: [
            { id: 'e2e-engine-error', scriptId: 'e2e-engine-error', name: 'E2E Engine Error', overlay: true, source: 'plot(unknownVar)' },
          ],
        }),
      }),
    );
    await page.route('**/api/execute', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: {
            message: 'Variable unknownVar is not defined',
            barIndex: 0,
            stack: 'Error: Variable unknownVar is not defined',
          },
        }),
      }),
    );

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await openDashboard(page);

    const errorsBtn = toolbarLocator(page).getByRole('button', { name: 'Errors' });
    // The normalized message surfaces as an error → badge count
    await expect(errorsBtn).toContainText(/[1-9]\d*/, { timeout: 30_000 });

    // PRE-FIX: opening the popover rendered the raw OBJECT → React threw
    // 'Objects are not valid as a React child (found: object with keys
    // {message, barIndex, stack})' → black screen. The message must render.
    await errorsBtn.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Variable unknownVar is not defined', { exact: false })).toBeVisible();

    // No uncaught page error — the crash path is dead
    expect(pageErrors).toEqual([]);
  });

  test('connection indicator announces Connected once the websocket opens', async ({ page }) => {
    await openDashboard(page);
    const status = toolbarLocator(page).getByRole('status');
    await expect(status).toBeVisible();
    await expect(status).toContainText('Connected', { timeout: 30_000 });
  });
});
