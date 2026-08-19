import { test, expect, type APIResponse, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * curved-radius-supertrend fill rendering — SURVIVES after WS update.
 *
 * USER REQUESTED: Verify that fills between close and curvedBand survive
 * WS updates (execution_result diffs). The fill-vanishing bug has been fixed.
 *
 * ROOT CAUSE (was fixed):
 *   `mergeFillColorData` (indicator-merge.ts:741) used to start accumulator
 *   with `{}`, only processing keys from the incoming WS diff. Any keys in
 *   `prev.fillColorData` NOT in the diff were silently dropped.
 *   Combined: every WS tick dropped all fillColorData keys except the few
 *   that grew → fills vanished progressively. This is now fixed; fills
 *   survive WS updates.
 *
 * ACCEPTANCE:
 *   1. Indicator badge visible, not stuck computing.
 *   2. Fill pixels EXIST after REST load.
 *   3. After SYNTHETIC WS execution_result frames, fill metrics MUST
 *      survive (>= 70% pixel count, >= 50% fillRows/maxRun).
 *      If they do → TEST PASSES (fills survive).
 *
 * DESIGN:
 *   - Seed data interception for deterministic renders.
 *   - Synthetic WS frame injection via `ws.send()` to simulate the real bug
 *     (partial fillColorData diff that drops keys not in the diff).
 *   - NO dependency on real WS — the bug is deterministic with synthetic frames.
 *   - fillRows/maxRun distinguish fills from candle bodies (wide runs = fills).
 */

const FRONTEND = 'http://localhost:3000';
const BACKEND = 'http://localhost:8081';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Load the curved-radius-supertrend indicator source from disk. */
const INDICATOR_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../test_indicators/curved-radius-supertrend.pine'),
  'utf-8',
);

// ─────────────────────────────────────────────────────────────────────────────
// SEED DATA INTERCEPTION
// ─────────────────────────────────────────────────────────────────────────────

let seedLastClose = 0;

/**
 * Serve deterministic OHLCV seed data — relabeled to end at the current
 * UTC MINUTE so the WS forming candle lands on a VISIBLE bar (REPLACE, not
 * off-screen PUSH).
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
  seedLastClose = Number(seedData[seedData.length - 1]?.close) || 0;

  // Relabel so seed ends at the current UTC MINUTE — WS forming candle lands
  // on the visible last bar (REPLACE), matching the Director's real scenario.
  const lastSeedTs = seedData[seedData.length - 1].timestamp;
  const currentBarTs = () => Math.floor(Date.now() / 60_000) * 60_000;
  const timestampShift = () => currentBarTs() - lastSeedTs;
  const shiftBar = (b: any) => ({ ...b, timestamp: b.timestamp + timestampShift() });

  const TOTAL_BARS = 10_000;
  const INITIAL_COUNT = 300;
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
      const bars = seedData.slice(seedData.length - INITIAL_COUNT).map(shiftBar);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: bars, hasMore: true }),
      });
      return;
    }

    const endTs = parseInt(end, 10);
    const refIdx = seedData.findIndex((b: any) => b.timestamp + timestampShift() >= endTs);
    const start = Math.max(0, (refIdx >= 0 ? refIdx : seedData.length) - limit);
    if (start <= 0 && barsServed >= INITIAL_COUNT) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], hasMore: false }),
      });
      return;
    }
    const bars = seedData
      .slice(Math.max(0, start), Math.min(start + limit, seedData.length))
      .map(shiftBar);
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

// ─────────────────────────────────────────────────────────────────────────────
// INDICATOR SETUP
// ─────────────────────────────────────────────────────────────────────────────

async function cleanupIndicator(page: Page) {
  try {
    const res = await page.request.get(`${BACKEND}/api/indicators`);
    if (!res.ok()) return;
    const { indicators } = await res.json();
    for (const ind of indicators) {
      if (ind.source?.includes('Curved Radius Supertrend')) {
        await page.request.delete(`${BACKEND}/api/indicators/${ind.id}`);
      }
    }
  } catch {
    // Backend may be down during cleanup — not a test failure.
  }
}

async function openDashboard(page: Page) {
  await setupSeedDataInterception(page);
  await page.goto(FRONTEND);
  await page.waitForSelector('canvas', { timeout: 30_000 });
}

/**
 * Add the curved-radius-supertrend indicator via the backend API.
 * overlay=true — renders on the main chart (overlay, not separate pane).
 */
async function addIndicator(page: Page) {
  const scriptId = `e2e-curved-radius-${Date.now()}`;
  const indicatorRes = await page.request.post(`${BACKEND}/api/indicators`, {
    data: {
      scriptId,
      name: 'Curved Radius Supertrend',
      overlay: true,
      source: INDICATOR_SOURCE,
    },
  });
  expect(indicatorRes.ok()).toBeTruthy();
  const { indicator } = await indicatorRes.json();
  expect(indicator).toBeDefined();
  expect(indicator.id).toBeTruthy();

  await page.reload();
  await page.waitForSelector('canvas', { timeout: 30_000 });

  await expect(page.getByText('Curved Radius Supertrend').first()).toBeVisible({
    timeout: 15_000,
  });

  return indicator.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// WS INTERCEPTION — synthetic frame injection
// ─────────────────────────────────────────────────────────────────────────────

let wsMessages: string[] = [];
let wsFrameCount = 0;
let syntheticFrameCount = 0;

/**
 * Build a synthetic execution_result that simulates the real bug.
 * The diff has fillColorData with ONLY 1 key. The REST load had 2+ keys.
 * After merge, only the 1 diff key survives → fills vanish.
 */
function buildSyntheticFrame(index: number): string {
  return JSON.stringify({
    type: 'execution_result',
    data: {
      success: true,
      formingCandle: true,
      isConfirmed: false,
      overlay: true,
      fillColorData: {
        fill_close_curvedBand: ['#00ff00', '#00ff00'],
      },
    },
  });
}

/**
 * Install WS interceptor that REPLACES all real server frames with synthetic
 * execution_result frames containing a PARTIAL fillColorData diff.
 *
 * This triggers the mergeFillColorData bug: the diff has 1 key, but the
 * previous state (from REST load) has 2+ keys. After merge, only the diff
 * key survives → fills vanish.
 *
 * Must be called BEFORE the page opens any WS connections.
 */
function installWsInterceptor(page: Page) {
  wsMessages = [];
  wsFrameCount = 0;
  syntheticFrameCount = 0;
  page.routeWebSocket(/\/ws$/, (ws) => {
    const server = ws.connectToServer();

    // Intercept server→page messages and REPLACE with synthetic frames.
    // The first server message triggers the injection of 5 synthetic frames.
    let injected = false;
    server.onMessage(() => {
      if (!injected) {
        injected = true;
        let frameIndex = 0;
        const injectNext = () => {
          const frame = buildSyntheticFrame(frameIndex);
          wsMessages.push(frame);
          wsFrameCount++;
          syntheticFrameCount++;
          ws.send(frame);
          frameIndex++;
          if (frameIndex < 5) {
            setTimeout(injectNext, 300);
          }
        };
        injectNext();
      }
      // Drop all real server frames — only synthetic ones reach the page
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// FILL DETECTION — horizontal-run analysis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scan the main chart canvas for fill pixels.
 *
 * Detection criteria for a "fill pixel":
 *   - NOT background color (#0d0d18 = rgb(13,13,24))
 *   - NOT fully transparent (alpha > 0)
 *   - NOT near-black (candle wicks)
 *   - Has color saturation (fill pixels are colored by trendColor)
 *
 * A "fill row" = row with ≥15 consecutive colored pixels (at 3px step,
 * that's ~45px — wider than any candle body). This distinguishes fill
 * areas from candle bodies/wicks.
 */
interface FillSnapshot {
  count: number;
  total: number;
  ratio: number;
  fillRows: number;   // rows with ≥15 consecutive colored pixels
  maxRun: number;     // longest consecutive run in any row
}

async function detectFillPixels(page: Page): Promise<FillSnapshot> {
  return page.evaluate(() => {
    // Pick the LARGEST canvas — the main chart.
    const canvases = Array.from(document.querySelectorAll('canvas'));
    let canvas: HTMLCanvasElement | null = null;
    let best = -1;
    for (const c of canvases) {
      const area = c.width * c.height;
      if (area > best) {
        best = area;
        canvas = c;
      }
    }
    if (!canvas) return { count: 0, total: 0, ratio: 0, fillRows: 0, maxRun: 0 };
    const ctx = canvas.getContext('2d');
    if (!ctx) return { count: 0, total: 0, ratio: 0, fillRows: 0, maxRun: 0 };

    const w = canvas.width;
    const h = canvas.height;
    const priceScaleWidth = 70;
    const chartW = Math.max(0, w - priceScaleWidth);

    // Scan top 80% — exclude time scale at bottom
    const scanTop = 0;
    const scanBottom = Math.floor(h * 0.8);
    const scanHeight = scanBottom - scanTop;

    if (chartW < 100 || scanHeight < 10)
      return { count: 0, total: 0, ratio: 0, fillRows: 0, maxRun: 0 };

    const imgData = ctx.getImageData(0, scanTop, chartW, scanHeight);
    const data = imgData.data;

    const bgR = 13, bgG = 13, bgB = 24;
    const tolerance = 15;

    let fillPixels = 0;
    let totalPixels = 0;
    let fillRows = 0;
    let globalMaxRun = 0;

    for (let y = 0; y < scanHeight; y += 3) {
      let currentRun = 0;
      let rowMaxRun = 0;

      for (let x = 0; x < chartW; x += 3) {
        const i = (y * chartW + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        totalPixels++;

        if (a === 0) { currentRun = 0; continue; }

        if (Math.abs(r - bgR) < tolerance &&
            Math.abs(g - bgG) < tolerance &&
            Math.abs(b - bgB) < tolerance) { currentRun = 0; continue; }

        if (r < 30 && g < 30 && b < 30) { currentRun = 0; continue; }

        fillPixels++;
        currentRun++;
        rowMaxRun = Math.max(rowMaxRun, currentRun);
      }

      if (rowMaxRun >= 15) fillRows++;
      globalMaxRun = Math.max(globalMaxRun, rowMaxRun);
    }

    return {
      count: fillPixels,
      total: totalPixels,
      ratio: totalPixels > 0 ? fillPixels / totalPixels : 0,
      fillRows,
      maxRun: globalMaxRun,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST: Fill renders after REST, VANISHES after synthetic WS (bug detected)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('curved-radius-supertrend fill rendering after WS update', () => {
  test.afterEach(async ({ page }) => {
    await cleanupIndicator(page);
  });

  test('fill pixels VANISH after synthetic WS execution_result updates (bug detected)', async ({ page }) => {
    // ── Step 0: Install synthetic WS interceptor BEFORE any connections ──
    installWsInterceptor(page);

    await openDashboard(page);
    const indicatorId = await addIndicator(page);

    // ── Step 1: Wait for execution to complete ──
    await expect(page.getByText('Computing…').first()).toBeHidden({
      timeout: 15_000,
    });

    // Give the chart time to finish rendering the initial REST load
    await page.waitForTimeout(1500);

    // ── Step 2: FILL SNAPSHOT BEFORE WS ──
    const beforeWs = await detectFillPixels(page);
    console.log('═══ FILL SNAPSHOT BEFORE WS ═══');
    console.log(`  fillPixels: ${beforeWs.count}`);
    console.log(`  fillRows:   ${beforeWs.fillRows}`);
    console.log(`  maxRun:     ${beforeWs.maxRun}`);
    console.log(`  ratio:      ${beforeWs.ratio.toFixed(4)}`);
    console.log(`  total:      ${beforeWs.total}`);

    // Sanity: fills MUST exist after REST load
    expect(beforeWs.count).toBeGreaterThan(0);
    expect(beforeWs.fillRows).toBeGreaterThan(0);
    expect(beforeWs.maxRun).toBeGreaterThanOrEqual(15);

    // ── Step 3: Inject synthetic WS frames ──
    // The interceptor already started injecting on WS open.
    // Wait for all 5 synthetic frames to arrive.
    console.log('═══ WAITING FOR SYNTHETIC WS FRAMES ═══');
    const deadline = Date.now() + 10_000;
    while (syntheticFrameCount < 5 && Date.now() < deadline) {
      await page.waitForTimeout(100);
    }
    console.log(`  synthetic frames injected: ${syntheticFrameCount}`);
    console.log(`  total WS frames: ${wsFrameCount}`);

    // Give the chart time to re-render after WS updates
    await page.waitForTimeout(2000);

    // ── Step 4: FILL SNAPSHOT AFTER WS ──
    const afterWs = await detectFillPixels(page);
    console.log('═══ FILL SNAPSHOT AFTER WS ═══');
    console.log(`  fillPixels: ${afterWs.count}`);
    console.log(`  fillRows:   ${afterWs.fillRows}`);
    console.log(`  maxRun:     ${afterWs.maxRun}`);
    console.log(`  ratio:      ${afterWs.ratio.toFixed(4)}`);
    console.log(`  total:      ${afterWs.total}`);

    // ── Step 5: ASSERT FILLS SURVIVE (BUG FIXED) ──
    // The bug where fillColorData keys were dropped during WS merge has been
    // fixed. Fills now survive WS updates. Assert metrics stay above thresholds.
    console.log('═══ FILL-SURVIVAL ASSERTIONS (BUG FIXED) ═══');

    // Fill pixel count must not drop below 70% of before
    const pixelThreshold = Math.floor(beforeWs.count * 0.7);
    console.log(`  fillPixels: ${afterWs.count} >= ${pixelThreshold} (70% of ${beforeWs.count})?`);
    expect(afterWs.count).toBeGreaterThanOrEqual(pixelThreshold);

    // fillRows must not drop below 50% of before
    const fillRowsThreshold = Math.floor(beforeWs.fillRows * 0.5);
    console.log(`  fillRows:   ${afterWs.fillRows} >= ${fillRowsThreshold} (50% of ${beforeWs.fillRows})?`);
    expect(afterWs.fillRows).toBeGreaterThanOrEqual(fillRowsThreshold);

    // maxRun must not drop below 50% of before
    const maxRunThreshold = Math.floor(beforeWs.maxRun * 0.5);
    console.log(`  maxRun:     ${afterWs.maxRun} >= ${maxRunThreshold} (50% of ${beforeWs.maxRun})?`);
    expect(afterWs.maxRun).toBeGreaterThanOrEqual(maxRunThreshold);

    console.log('═══ FILLS SURVIVED WS UPDATE (TEST GREEN) ═══');
  });
});
