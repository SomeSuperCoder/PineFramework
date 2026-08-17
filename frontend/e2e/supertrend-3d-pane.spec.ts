import { test, expect, type APIResponse, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * supertrend-3d bottom pane rendering — E2E proof that the rendering pipeline
 * actually works end-to-end.
 *
 * USER REQUESTED: Create a failing Playwright test that loads the supertrend-3d
 * indicator and verifies a bottom pane with rendered drawing objects actually
 * exists. The execution engine produces 339 lines, 81 linefills, 8 labels — all
 * verified by unit tests. But the browser shows NOTHING. This test will prove
 * whether the rendering pipeline actually works end-to-end. If the test fails,
 * we know exactly what to fix.
 *
 * The indicator is overlay=false (PineScript declaration), so it MUST render in
 * a separate pane below the main chart — not overlaid on price.
 *
 * ACCEPTANCE (asserted below):
 *   1. The indicator badge "LuxAlgo - ST 3D Surface" is visible. The badge
 *      renders the API name POSTed to /api/indicators, NOT the PineScript
 *      title ("Supertrend Parameter Sensitivity 3D").
 *   2. The badge is NOT stuck on "Computing…" — the execution engine finished.
 *   3. The overlay=false indicator renders a bottom pane: the indicator-pane
 *      band of the canvas (≈70–93% of height, below the volume area) contains
 *      non-transparent pixels — the pane's drawing objects actually drew.
 */

const FRONTEND = 'http://localhost:3000';
const BACKEND = 'http://localhost:8081';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Load the supertrend-3d indicator source from disk. */
const SUPERTREND_3D_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../test_indicators/supertrend-3d.pine'),
  'utf-8',
);

/**
 * Serve deterministic OHLCV seed data so the chart renders identically to the
 * established fixture pattern.
 */
async function setupSeedDataInterception(page: Page) {
  let seedRes: APIResponse | undefined;
  let seedErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await page.request.get(`${BACKEND}/api/ohlcv/seed`);
      if (res.ok()) {
        seedRes = res;
        break;
      }
      seedErr = new Error(`seed GET returned ${res.status()}`);
    } catch (err) {
      seedErr = err;
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
    const refIdx = seedData.findIndex((b: any) => b.timestamp >= endTs);
    const start = Math.max(0, (refIdx >= 0 ? refIdx : seedData.length) - limit);
    if (start <= 0 && barsServed >= INITIAL_COUNT) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], hasMore: false }),
      });
      return;
    }
    const bars = seedData.slice(
      Math.max(0, start),
      Math.min(start + limit, seedData.length),
    );
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

/**
 * Remove any previously-added supertrend-3d indicator to keep the test
 * idempotent across runs. Resilient — never throws.
 */
async function cleanupIndicator(page: Page) {
  try {
    const res = await page.request.get(`${BACKEND}/api/indicators`);
    if (!res.ok()) return;
    const { indicators } = await res.json();
    for (const ind of indicators) {
      if (ind.source?.includes('Supertrend Parameter Sensitivity 3D')) {
        await page.request.delete(`${BACKEND}/api/indicators/${ind.id}`);
      }
    }
  } catch {
    // Backend may be down during cleanup — not a test failure.
  }
}

/** Launch the dashboard with seed data interception. */
async function openDashboard(page: Page) {
  await setupSeedDataInterception(page);
  await page.goto(FRONTEND);
  await page.waitForSelector('canvas', { timeout: 30_000 });
}

/**
 * Add the supertrend-3d indicator via the backend API and trigger execution.
 * This mirrors what handleAddIndicator in App.tsx does:
 *   1. POST /api/indicators (register in backend store)
 *   2. Reload page → useIndicatorManager fetches it → executeScript runs it
 *   3. Assert the indicator badge becomes visible
 */
async function addSupertrend3D(page: Page) {
  // 1. Register the indicator in the backend store (overlay=false matches the
  //    PineScript declaration — the indicator MUST render in a separate pane).
  const scriptId = `e2e-supertrend-3d-${Date.now()}`;
  const indicatorRes = await page.request.post(`${BACKEND}/api/indicators`, {
    data: {
      scriptId,
      name: 'LuxAlgo - ST 3D Surface',
      overlay: false,
      source: SUPERTREND_3D_SOURCE,
    },
  });
  expect(indicatorRes.ok()).toBeTruthy();
  const { indicator } = await indicatorRes.json();
  expect(indicator).toBeDefined();
  expect(indicator.id).toBeTruthy();

  // 2. Reload so useIndicatorManager picks up the new indicator and
  //    the app calls executeScript for it.
  await page.reload();
  await page.waitForSelector('canvas', { timeout: 30_000 });

  // 3. The indicator badge MUST appear. The badge renders the API name we
  //    sent ("LuxAlgo - ST 3D Surface"), not the PineScript title.
  await expect(page.getByText('LuxAlgo - ST 3D Surface')).toBeVisible({
    timeout: 15_000,
  });

  return indicator.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST: Bottom pane exists, badge visible, not stuck computing
// ─────────────────────────────────────────────────────────────────────────────

test.describe('supertrend-3d indicator pane rendering', () => {
  test.afterEach(async ({ page }) => {
    await cleanupIndicator(page);
  });

  test('supertrend-3d renders a bottom indicator pane', async ({ page }) => {
    await openDashboard(page);
    await addSupertrend3D(page);

    // ── Acceptance 2: the indicator finished computing ──
    // While executing, the badge shows a spinner with sr-only "Computing…"
    // text. When the execution engine finishes, that text is replaced by
    // "Ready". It must NOT be stuck on "Computing…".
    await expect(page.getByText('Computing…')).toBeHidden({
      timeout: 15_000,
    });

    // ── Acceptance 3: a bottom pane exists for the overlay=false indicator ──
    // LayoutManager.calculate allocates an indicator PaneRegion in the bottom
    // of the canvas (above the volume area, below the main chart). Evidence:
    // the indicator-pane band (≈70–93% of canvas height) contains
    // non-transparent pixels — the pane's drawing objects actually drew.
    // Poll because the canvas render lands asynchronously after execution.
    await expect
      .poll(
        async () => {
          const pane = await page.evaluate(() => {
            const canvas = document.querySelector(
              'canvas',
            ) as HTMLCanvasElement | null;
            if (!canvas) return { coverage: 0, width: 0, height: 0 };
            const ctx = canvas.getContext('2d');
            if (!ctx) return { coverage: 0, width: canvas.width, height: canvas.height };
            const w = canvas.width;
            const h = canvas.height;
            const startY = Math.floor(h * 0.7);
            const endY = Math.floor(h * 0.93);
            let nonEmpty = 0;
            let total = 0;
            for (let x = 0; x < Math.min(w, 200); x += 10) {
              for (let y = startY; y < endY; y += 10) {
                const px = ctx.getImageData(x, y, 1, 1).data;
                if (px[3] > 0) nonEmpty++;
                total++;
              }
            }
            return {
              coverage: total > 0 ? nonEmpty / total : 0,
              width: w,
              height: h,
            };
          });
          return pane.coverage;
        },
        {
          timeout: 10_000,
          message: 'supertrend-3d bottom pane NOT rendered',
        },
      )
      .toBeGreaterThan(0);
  });
});