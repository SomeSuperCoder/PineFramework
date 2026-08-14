import { test, expect, type Page } from '@playwright/test';

/**
 * Chart toolbar symbol/timeframe selects (shadcn/radix Select migration) —
 * user-flow coverage.
 *
 * USER REQUESTED: "The timeframe and symbol select dropdown on the chart
 * toolbar use a browser native dropdown instead of a polished shadcn one" —
 * they should be the polished shadcn/radix dropdown. Behavior must be
 * preserved from the user's side: the selected value is shown in the trigger
 * and the choice persists to localStorage (pine-symbol / pine-timeframe).
 *
 * The triggers are Radix Select buttons (role=combobox, aria-label Symbol /
 * Timeframe) — NOT native <select> elements, so selectOption() would never
 * work on them. This spec proves, from the user's side:
 *  1. Both triggers render with their current (default) values visible.
 *  2. Clicking a trigger opens the radix dropdown with the curated options.
 *  3. Selecting an option updates the trigger text AND localStorage.
 *  4. Cleanup restores the original values → spec is idempotent and does not
 *     leave the app mutated for other specs.
 *
 * Safety: view-only + localStorage. No form submitted, no chart teleport, no
 * backend state created or mutated (the seed-data interception is the
 * established deterministic-chart fixture shared by the toolbar/sidebar specs).
 */

const FRONTEND = 'http://localhost:3000';

/** Known pair options (frontend/src/utils/options.ts ← TRADABLE_PAIRS). */
const KNOWN_PAIRS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT',
  'GOLDUSDC', 'TSLAXUSDC', 'AAPLXUSDC',
];

/** Known timeframe options (frontend/src/utils/options.ts): value → label. */
const TIMEFRAME_VALUE_TO_LABEL: Record<string, string> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '30': '30m',
  '60': '1h',
  '240': '4h',
  D: '1D',
  W: '1W',
};

/**
 * Serve deterministic OHLCV seed data so the chart renders identically to the
 * chunk-boundary specs (copy of the established fixture pattern).
 */
async function setupSeedDataInterception(page: Page) {
  const seedRes = await page.request.get('http://localhost:8081/api/ohlcv/seed');
  expect(seedRes.ok()).toBeTruthy();
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
  await page.goto(FRONTEND);
  await page.waitForSelector('canvas', { timeout: 30_000 });
}

test.describe('Chart toolbar selects (shadcn/radix migration)', () => {
  test('symbol and timeframe dropdowns open, select, and persist to localStorage', async ({ page }) => {
    await openDashboard(page);

    const symbolTrigger = page.getByRole('combobox', { name: 'Symbol' });
    const timeframeTrigger = page.getByRole('combobox', { name: 'Timeframe' });

    // 1. Triggers render with the current value visible. Fresh context per test
    //    → App.tsx defaults: symbol BTCUSDT, timeframe '1' → label '1m'.
    await expect(symbolTrigger).toBeVisible();
    await expect(symbolTrigger).toContainText('BTCUSDT');
    await expect(timeframeTrigger).toBeVisible();
    await expect(timeframeTrigger).toContainText('1m');

    // ---- SYMBOL ----
    await symbolTrigger.click();

    // 2. Radix dropdown opens with the curated pair options (PAIR_OPTIONS).
    await expect(page.getByRole('option', { name: 'BTCUSDT', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'ETHUSDT', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'SOLUSDT', exact: true })).toBeVisible();

    // 3. Select a pair different from the current one (deterministic baseline).
    const symbolTarget = KNOWN_PAIRS.find((p) => p !== 'BTCUSDT')!;
    await page.getByRole('option', { name: symbolTarget, exact: true }).click();

    await expect(symbolTrigger).toContainText(symbolTarget);
    expect(await page.evaluate(() => localStorage.getItem('pine-symbol'))).toBe(symbolTarget);

    // 4. Cleanup: restore the original symbol — idempotent across runs/specs.
    await symbolTrigger.click();
    await page.getByRole('option', { name: 'BTCUSDT', exact: true }).click();
    await expect(symbolTrigger).toContainText('BTCUSDT');
    expect(await page.evaluate(() => localStorage.getItem('pine-symbol'))).toBe('BTCUSDT');

    // ---- TIMEFRAME ----
    await timeframeTrigger.click();

    // 2. Radix dropdown opens with the curated timeframe options.
    await expect(page.getByRole('option', { name: '1m', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: '5m', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: '15m', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: '1D', exact: true })).toBeVisible();

    // 3. Select a timeframe different from the current one ('1' → '15').
    const timeframeTargetValue = '15';
    await page.getByRole('option', { name: TIMEFRAME_VALUE_TO_LABEL[timeframeTargetValue], exact: true }).click();

    await expect(timeframeTrigger).toContainText(TIMEFRAME_VALUE_TO_LABEL[timeframeTargetValue]);
    expect(await page.evaluate(() => localStorage.getItem('pine-timeframe'))).toBe(timeframeTargetValue);

    // 4. Cleanup: restore the original timeframe.
    await timeframeTrigger.click();
    await page.getByRole('option', { name: '1m', exact: true }).click();
    await expect(timeframeTrigger).toContainText('1m');
    expect(await page.evaluate(() => localStorage.getItem('pine-timeframe'))).toBe('1');
  });
});
