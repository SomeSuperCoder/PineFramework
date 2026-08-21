import { test, expect, type Page, type Route } from '@playwright/test';
import { enterAppDirectly } from './helpers';

/**
 * B2 user-flow proof — removing an indicator WHILE it computes must take
 * effect promptly and leave no broken UI behind.
 *
 * USER REQUESTED (fix under test): "removing a long-computing indicator must
 * cancel its computation and take effect promptly" — cancellation registry +
 * async yielding (B1/B2). Unit/integration tests cover the registry + route
 * seams; this spec proves the USER-VISIBLE behavior in a real browser:
 *   (a) the badge disappears PROMPTLY after clicking its X during a compute,
 *   (b) the UI stays clickable while the (former) compute is in flight,
 *   (c) NO error toast/console entry appears for the cancelled run,
 *   (d) the backend actually STOPPED the compute — the /api/execute response
 *       carries `success:false, cancelled:true` (network probe).
 *
 * DETERMINISM: real supertrend on 1000 bars is flaky-slow, so this spec uses
 * a synthetic indicator whose ONLY job is a controlled nested-loop burn per
 * bar (deterministic work, no market-data sensitivity). The engine yields
 * every 50 bars (B1), so DELETE's registry.cancel lands within ≤50 bars of
 * the click.
 *
 * SAFETY: OHLCV data comes from the established seed interception (view-only,
 * shared fixture pattern); the ONLY state created is one indicator record,
 * deleted in afterEach by source marker — idempotent across runs.
 */

const FRONTEND = 'http://localhost:3000';
const BACKEND = 'http://127.0.0.1:8081';

/** Unique name marker — used for badge locators AND afterEach cleanup. */
const INDICATOR_NAME = 'E2E Slow Calc';

/**
 * Deterministic long-computing indicator: ~1.3k loop iterations per bar over
 * ~300 bars (~1M interpreted ops — seconds-long through the Pine interpreter) — seconds-long on the dev server, zero data variance.
 */
const SLOW_SOURCE = `//@version=6
indicator("${INDICATOR_NAME}", overlay=true)
s = 0.0
for i = 0 to 30
    for j = 0 to 40
        s := s + (i * j) % 7
plot(s)`;

/**
 * Serve deterministic OHLCV seed data (copy of the established fixture
 * pattern from supertrend-3d-pane.spec.ts / chart-toolbar-selects.spec.ts).
 */
async function setupSeedDataInterception(page: Page) {
  const seedRes = await page.request.get(`${BACKEND}/api/ohlcv/seed`);
  expect(seedRes.ok()).toBeTruthy();
  const seedData = (await seedRes.json()).data;
  expect(seedData.length).toBeGreaterThan(100);

  const TOTAL_BARS = 10_000;
  const INITIAL_COUNT = 300;
  const START_OFFSET = 5000;
  let barsServed = 0;

  const seedRouteHandler = async (route: Route) => {
    const url = new URL(route.request().url());
    const end = url.searchParams.get('end') || url.searchParams.get('before');
    const limit = parseInt(
      url.searchParams.get('limit') || url.searchParams.get('count') || '1000',
      10,
    );

    if (!end) {
      barsServed = INITIAL_COUNT;
      const bars = seedData.slice(START_OFFSET, START_OFFSET + INITIAL_COUNT);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: bars, hasMore: true }),
      });
      return;
    }

    const endTs = parseInt(end, 10);
    const refIdx = seedData.findIndex((b: { timestamp: number }) => b.timestamp >= endTs);
    const start = Math.max(0, (refIdx >= 0 ? refIdx : seedData.length) - limit);
    if (start <= 0 && barsServed >= INITIAL_COUNT) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], hasMore: false }),
      });
      return;
    }
    const bars = seedData.slice(Math.max(0, start), Math.min(start + limit, seedData.length));
    barsServed += bars.length;
    const hasMore = start > 0 && barsServed < TOTAL_BARS;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: bars, hasMore }),
    });
  };

  await page.route(/\/api\/ohlcv\b/, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/seed')) {
      await route.fallback();
      return;
    }
    await seedRouteHandler(route);
  });
  await page.route(/\/api\/bars\b/, async (route) => {
    await seedRouteHandler(route);
  });
}

async function openDashboard(page: Page) {
  await setupSeedDataInterception(page);
  await enterAppDirectly(page);
  await page.goto(FRONTEND);
  await page.waitForSelector('canvas', { timeout: 30_000 });
}

/** API surface shared by page.request and the standalone fixture request. */
type RequestLike = {
  get(url: string): Promise<{ ok(): boolean; json(): Promise<unknown> }>;
  delete(url: string): Promise<unknown>;
};

/**
 * Remove any previously-added slow-calc indicator to keep the test idempotent.
 * PASSES repeatedly until none are left: a crashed earlier run can leave many
 * copies, and every copy re-executes (and re-executes via WS ticks) on page
 * load — stacked copies starve the backend API and poison the next attempt.
 * Resilient — never throws.
 */
async function cleanupIndicator(request: RequestLike) {
  for (let pass = 0; pass < 6; pass++) {
    try {
      const res = await request.get(`${BACKEND}/api/indicators`);
      if (!res.ok()) return;
      const { indicators } = (await res.json()) as {
        indicators: Array<{ id: string; source?: string }>;
      };
      const stale = indicators.filter((i) => i.source?.includes(`indicator("${INDICATOR_NAME}"`));
      if (stale.length === 0) return;
      for (const ind of stale) {
        await request.delete(`${BACKEND}/api/indicators/${ind.id}`);
      }
    } catch {
      // Backend may be down/busy during cleanup — not a test failure.
      return;
    }
  }
}

/** Register the slow indicator in the backend store (mirrors handleAddIndicator). */
async function addSlowIndicator(page: Page): Promise<string> {
  const res = await page.request.post(`${BACKEND}/api/indicators`, {
    data: {
      scriptId: `e2e-slow-calc-${Date.now()}`,
      name: INDICATOR_NAME,
      overlay: true,
      source: SLOW_SOURCE,
    },
  });
  expect(res.ok()).toBeTruthy();
  const { indicator } = await res.json();
  expect(indicator.id).toBeTruthy();
  return indicator.id as string;
}

test.describe('remove-during-compute (B2 user flow)', () => {
  // SERIAL ONLY: this spec mutates the SHARED backend indicator store; parallel
  // workers would purge each other's fixtures mid-flight (proven: paired
  // adds 150ms apart under --repeat-each). Serial keeps purge→add→reload atomic.
  test.describe.configure({ mode: 'serial' });

  // Self-healing: leftovers from an earlier crashed/timed-out run would stack
  // slow computes on every page load — purge BEFORE each attempt too.
  test.beforeEach(async ({ request }) => {
    await cleanupIndicator(request as unknown as Page);
  });

  test.afterEach(async ({ request }) => {
    await cleanupIndicator(request as unknown as Page);
  });

  test('X during a long compute cancels promptly, keeps UI alive, no error toast, backend responds cancelled', async ({
    page,
  }) => {
    // ── Network probe on /api/execute ──
    // PASSTHROUGH observation (route.fetch → fulfill): the request still hits
    // the REAL backend and the app receives the byte-identical response — we
    // only capture the body so we can prove `cancelled:true` later. No mock
    // of behavior, nothing runs longer than reality.
    let executeProbe: { success?: boolean; cancelled?: boolean } | null = null;
    await page.route('**/api/execute', async (route) => {
      const response = await route.fetch();
      try {
        const body = route.request().postDataJSON() as { indicatorId?: string };
        if (body?.indicatorId) {
          executeProbe = (await response.json()) as {
            success?: boolean;
            cancelled?: boolean;
          };
        }
      } catch {
        // Probe is best-effort — never break the app's request.
      }
      // A page reload can abort this in-flight request mid-handler, disposing
      // the fetched response — never let that surface as a spec failure.
      await route.fulfill({ response }).catch(() => {});
    });

    await openDashboard(page);
    await addSlowIndicator(page);

    // Reload so useIndicatorManager picks it up and triggers execution.
    await page.reload();
    await page.waitForSelector('canvas', { timeout: 30_000 });

    // ── The compute IS running ──
    const badge = page.getByText(INDICATOR_NAME).first();
    await expect(badge).toBeVisible({ timeout: 15_000 });
    const computing = page.getByText('Computing…').first();
    await expect(computing).toBeVisible({ timeout: 15_000 });

    // ── THE USER ACTION: remove WHILE computing ──
    await page.getByRole('button', { name: `Remove ${INDICATOR_NAME}` }).click();

    // (a) Label disappears PROMPTLY — not after the multi-second compute ends.
    await expect(badge).toBeHidden({ timeout: 5_000 });

    // (b) UI stays clickable while everything settles.
    const timeframeTrigger = page.getByRole('combobox', { name: 'Timeframe' });
    await timeframeTrigger.click();
    await expect(page.getByRole('option', { name: '1m', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    // (c) No error surfaced for the cancelled run — the app treats
    //     cancelled:true as user intent, not failure (no ErrorConsole entry).
    await expect(page.getByText('Execution cancelled')).toBeHidden();

    // (d) Backend PROVED it stopped the compute: the probed /api/execute
    //     response for our indicatorId carries cancelled:true (success:false).
    await expect
      .poll(() => executeProbe, { timeout: 30_000 })
      .toMatchObject({ success: false, cancelled: true });
  });
});
