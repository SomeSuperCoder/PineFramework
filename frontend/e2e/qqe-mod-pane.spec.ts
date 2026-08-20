import { test, expect, type APIResponse, type Page } from '@playwright/test';
import { enterAppDirectly } from './helpers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * qqe-mod bottom pane rendering — E2E proof that the rendering pipeline
 * actually works end-to-end for the QQE MOD indicator.
 *
 * USER REQUESTED: Create a failing Playwright test that loads the qqe-mod
 * indicator and verifies a bottom pane with rendered drawing objects actually
 * exists. The execution engine currently MISSES two runtime builtins the
 * script uses, so execution dies at bar 0 and NO pane is rendered:
 *
 *   GAP 1 (test_indicators/qqe-mod.pine:69): `ta.stdev` is not registered in
 *     the Pine runtime eng.builtins map (src/language/runtime/builtins/ta/
 *     ta-statistics.ts registers only highest/lowest/pivothigh/pivotlow).
 *     Unknown `ta.*` falls through to dispatch('ta') -> executeIdentifier
 *     THROWS `Variable 'ta' is not defined`.
 *   GAP 2 (test_indicators/qqe-mod.pine:89): `hline` is missing entirely —
 *     plot-builtins.ts registers plot/plotshape/plotchar/plotcandle/bgcolor/
 *     barcolor/fill only, and 'hline' is not in executeMemberExpression's
 *     enum namespace list, so `hline.style_dotted` throws.
 *
 * With either gap, execution throws at bar 0, the indicator produces no
 * outputs, regions.indicatorPanes stays empty, and no pane separator is ever
 * drawn. THIS TEST MUST FAIL AGAINST THE CURRENT BUILD — it is the loop's
 * done-criteria: once the engine fixes land (ta.stdev + hline), the SAME test
 * must go GREEN.
 *
 * The indicator is overlay=false (PineScript declaration), so it MUST render
 * in a separate pane below the main chart — not overlaid on price.
 *
 * ACCEPTANCE (asserted below):
 *   1. The indicator badge "QQE MOD" is visible. The badge renders the API
 *      name POSTed to /api/indicators, NOT the PineScript title.
 *   2. The badge is NOT stuck on "Computing…" — the execution engine finished.
 *   3. A REAL indicator pane exists: the pixel-level proof is the SEPARATOR
 *      line. PineChart.ts:374-379 strokes a full-width horizontal line at the
 *      pane's top edge in the chart's configured borderColor — but ONLY when
 *      regions.indicatorPanes is non-empty. No separator = no pane.
 *      NOTE: the app passes borderColor = tokens.colors.hairline.default
 *      (#262636) from ChartComponent, NOT tokens.chart.border (#35354a). The
 *      detection predicate below matches #262636 and its anti-aliased blends.
 *   4. The pane BELOW the separator contains rendered content (the QQE MOD
 *      plot lines/columns), not an empty box.
 */

const FRONTEND = 'http://localhost:3000';
const BACKEND = 'http://localhost:8081';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Load the qqe-mod indicator source from disk. */
const QQE_MOD_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../test_indicators/qqe-mod.pine'),
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
 * Remove any previously-added qqe-mod indicator to keep the test idempotent
 * across runs. Resilient — never throws.
 */
async function cleanupIndicator(page: Page) {
  try {
    const res = await page.request.get(`${BACKEND}/api/indicators`);
    if (!res.ok()) return;
    const { indicators } = await res.json();
    for (const ind of indicators) {
      if (ind.source?.includes('QQE MOD')) {
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
  await enterAppDirectly(page);
  await page.goto(FRONTEND);
  await page.waitForSelector('canvas', { timeout: 30_000 });
}

/**
 * Add the qqe-mod indicator via the backend API and trigger execution.
 * This mirrors what handleAddIndicator in App.tsx does:
 *   1. POST /api/indicators (register in backend store)
 *   2. Reload page → useIndicatorManager fetches it → executeScript runs it
 *   3. Assert the indicator badge becomes visible
 */
async function addQqeMod(page: Page) {
  // 1. Register the indicator in the backend store (overlay=false matches the
  //    PineScript declaration — the indicator MUST render in a separate pane).
  const scriptId = `e2e-qqe-mod-${Date.now()}`;
  const indicatorRes = await page.request.post(`${BACKEND}/api/indicators`, {
    data: {
      scriptId,
      name: 'QQE MOD',
      overlay: false,
      source: QQE_MOD_SOURCE,
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
  //    sent ("QQE MOD"), not the PineScript title.
  //    `.first()`: a stale duplicate indicator in the backend store (from a
  //    prior session) renders a second badge with the same name — the first
  //    badge is the one this test added. Strict mode would otherwise throw.
  await expect(page.getByText('QQE MOD').first()).toBeVisible({
    timeout: 15_000,
  });

  return indicator.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST: Bottom pane exists, badge visible, not stuck computing
// ─────────────────────────────────────────────────────────────────────────────

test.describe('qqe-mod indicator pane rendering', () => {
  test.afterEach(async ({ page }) => {
    await cleanupIndicator(page);
  });

  test('qqe-mod renders a bottom indicator pane', async ({ page }) => {
    await openDashboard(page);
    await addQqeMod(page);

    // Evidence channel: capture any page errors / console errors raised by the
    // execution engine (e.g. `Variable 'ta' is not defined` for ta.stdev, or
    // the hline.style_dotted throw). These are dumped to the reporter output
    // ONLY if the pane assertion fails, so the RED run carries the root cause.
    // They never affect pass/fail — the assertions below are the verdict.
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') pageErrors.push(`console.error: ${msg.text()}`);
    });
    // Dump the captured engine errors to the reporter output when an
    // acceptance assertion fails, so a RED run carries the root cause
    // (e.g. `Variable 'ta' is not defined`). Informational only — never
    // affects pass/fail; the assertions below are the verdict.
    const dumpPageErrors = () => {
      if (pageErrors.length > 0) {
        console.log('=== PAGE ERRORS captured during qqe-mod run ===');
        for (const e of pageErrors) console.log(e);
      }
    };

    // ── Acceptance 2: the indicator finished computing ──
    // While executing, the badge shows a spinner with sr-only "Computing…"
    // text. When the execution engine finishes, that text is replaced by
    // "Ready". It must NOT be stuck on "Computing…".
    try {
      await expect(page.getByText('Computing…').first()).toBeHidden({
        timeout: 15_000,
      });
    } catch (err) {
      dumpPageErrors();
      throw err;
    }

    // ── Acceptance 3: a REAL indicator pane exists (separator line) ──
    // The distinguishing pixel feature of a pane is the SEPARATOR drawn by
    // PineChart.ts:374-379: a full-width horizontal line in the chart's
    // configured borderColor at pane.y, drawn ONLY when regions.indicatorPanes
    // is non-empty. When the pane machinery is broken (indicatorPanes stays
    // []), no separator is ever drawn — the main chart simply fills the whole
    // canvas, which is why the old "70–93% band has non-transparent pixels"
    // check was a false positive.
    //
    // The app configures borderColor = tokens.colors.hairline.default =
    // #262636 = rgb(38,38,54) (ChartComponent passes it to createChart), and
    // pane.y is fractional (0.7*(h-30)), so the 1px line anti-aliases across
    // two rows at ~70%/30% blend over the canvas background rgb(13,13,24) →
    // measured separator pixels ≈ rgb(34,41,48) / rgb(20,20,32). Predicate:
    // blue-dominant (B >= R && B >= G), clearly brighter than background
    // (bright >= 30), and not bright content (bright <= 140). The 90%-of-row
    // width threshold keeps vertical bars (candles/volume — sparse per row)
    // and thin linefills from matching.
    //
    // Scan rows between 50% and (height − 40px) of the canvas for a horizontal
    // run ≥90% of the chart width of the separator color family. The scan band
    // deliberately excludes the time-scale top border (drawn at height − 30px
    // in the same border color) and starts below the main-chart price grid.
    // Poll because the canvas render lands asynchronously after execution.
    let paneSeparator: { y: number; coverage: number } | null = null;
    try {
      await expect
        .poll(
        async () => {
          const separator = await page.evaluate(() => {
            const canvas = document.querySelector(
              'canvas',
            ) as HTMLCanvasElement | null;
            if (!canvas) return null;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            const w = canvas.width;
            const h = canvas.height;
            const chartW = Math.max(0, w - 70); // priceScaleWidth=70 → separator spans x∈[0, chartW)
            if (chartW < 100) return null;
            const startY = Math.floor(h * 0.5);
            const endY = Math.max(startY + 1, h - 40); // exclude time-scale border at h-30
            const band = ctx.getImageData(0, startY, w, endY - startY);
            const data = band.data;
            const rowStride = w * 4;
            for (let r = 0; r < endY - startY; r++) {
              let match = 0;
              for (let x = 0; x < chartW; x++) {
                const o = r * rowStride + x * 4;
                const R = data[o];
                const G = data[o + 1];
                const B = data[o + 2];
                // Separator color family: the app's borderColor is
                // #262636 = rgb(38,38,54) (hairline.default), blue-dominant,
                // anti-aliased to ≈rgb(34,41,48) at the fractional pane.y.
                const bright = (R + G + B) / 3;
                if (
                  B >= R &&
                  B >= G &&
                  bright >= 30 &&
                  bright <= 140
                ) {
                  match++;
                }
              }
              if (match >= chartW * 0.9) {
                const sepY = startY + r;
                // ── Acceptance 4: pane BELOW separator must contain content ──
                // Measure non-background pixel coverage in the pane area
                // (separator+1 .. h−30, the indicator pane's vertical extent).
                // Background is tokens.colors.canvas #0d0d18 = rgb(13,13,24);
                // the QQE MOD plot lines/columns are much brighter.
                const paneTop = sepY + 1;
                const paneBottom = Math.min(h - 30, h);
                let nonBg = 0;
                let total = 0;
                if (paneBottom > paneTop) {
                  const paneImg = ctx.getImageData(
                    0,
                    paneTop,
                    chartW,
                    paneBottom - paneTop,
                  );
                  const pdata = paneImg.data;
                  for (let i = 0; i < pdata.length; i += 4) {
                    const pr = pdata[i];
                    const pg = pdata[i + 1];
                    const pb = pdata[i + 2];
                    total++;
                    if (pr > 40 || pg > 40 || pb > 40) nonBg++;
                  }
                }
                return {
                  y: sepY,
                  coverage: total > 0 ? nonBg / total : 0,
                };
              }
            }
            return null;
          });
          paneSeparator = separator;
          return separator;
        },
        {
          timeout: 10_000,
          message:
            'qqe-mod bottom pane separator NOT rendered — no full-width border-color line in the 50%..h-40px band (regions.indicatorPanes is empty — engine runtime error: ta.stdev/hline missing from runtime builtins)',
        },
      )
      .not.toBeNull();
    } catch (err) {
      dumpPageErrors();
      throw err;
    }

    // ── Acceptance 4 (continued): the pane is not an empty box ──
    // Only reachable once a separator exists. Require meaningful rendered
    // content (the QQE MOD plot lines/columns) inside the pane, not just a line.
    expect(paneSeparator!.coverage).toBeGreaterThan(0.01);
  });
});
