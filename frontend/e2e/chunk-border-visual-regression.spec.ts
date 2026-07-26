import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Visual regression test for chunk border data quality.
 *
 * Instead of screenshot comparison (fragile across environments), this test
 * checks that indicator plot data does not have abnormal null-value density
 * near chunk boundaries. A fill gap IS a run of null values in fillColorData
 * or plotColors — so null-density comparison directly measures the data quality
 * that causes visual gaps.
 */

const BACKEND = 'http://localhost:8081';
const FRONTEND = 'http://localhost:3000';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load indicator sources from test_indicators/
const zeroLagSource = fs.readFileSync(
  path.resolve(__dirname, '../../test_indicators/zero-lag-signals-for-loop.pine'),
  'utf-8',
);
const kalmanSource = fs.readFileSync(
  path.resolve(__dirname, '../../test_indicators/kalman-trend-levels.pine'),
  'utf-8',
);

test.describe('Chunk border visual regression', () => {
  test.beforeAll(async ({ request }) => {
    // Clean up any previous test indicators
    const existingRes = await request.get(`${BACKEND}/api/indicators`);
    if (existingRes.ok()) {
      const existing = (await existingRes.json()).indicators || [];
      for (const ind of existing) {
        if (
          ind.scriptId === 'e2e-test-zero-lag' ||
          ind.scriptId === 'e2e-test-kalman'
        ) {
          await request.delete(`${BACKEND}/api/indicators/${ind.id}`);
        }
      }
    }

    // Add zero-lag-signals indicator
    const addZeroLag = await request.post(`${BACKEND}/api/indicators`, {
      data: {
        scriptId: 'e2e-test-zero-lag',
        name: 'Zero Lag E2E',
        overlay: true,
        source: zeroLagSource,
      },
    });
    expect(addZeroLag.ok()).toBeTruthy();

    // Add kalman-trend-levels indicator
    const addKalman = await request.post(`${BACKEND}/api/indicators`, {
      data: {
        scriptId: 'e2e-test-kalman',
        name: 'Kalman E2E',
        overlay: true,
        source: kalmanSource,
      },
    });
    expect(addKalman.ok()).toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    // Clean up — best effort, don't fail the suite if cleanup fails
    try {
      const res = await request.get(`${BACKEND}/api/indicators`);
      if (res.ok()) {
        const indicators = (await res.json()).indicators || [];
        for (const ind of indicators) {
          if (
            ind.scriptId === 'e2e-test-zero-lag' ||
            ind.scriptId === 'e2e-test-kalman'
          ) {
            await request.delete(`${BACKEND}/api/indicators/${ind.id}`);
          }
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Read __pineTestData — returns null if not yet populated.
   */
  async function getTestData(page: Page): Promise<{
    indicators: Array<{
      id: string;
      plotNullCounts: Record<string, number>;
      boundaryNullDensities: Array<{
        borderIndex: number;
        nullCount: number;
        totalBars: number;
      }>;
    }>;
    chunkBorders: Array<number>;
  } | null> {
    return page.evaluate(() => {
      const td = (window as any).__pineTestData;
      if (!td) return null;
      return {
        indicators: td.indicators,
        chunkBorders: td.chunkBorders,
      };
    });
  }

  /**
   * Programmatically trigger a scroll-back by moving the viewport to
   * the oldest data and firing fetchOlderOHLCV.
   */
  async function triggerScrollBack(page: Page): Promise<boolean> {
    return page.evaluate(() => {
      const chart = (window as any).__pineChart;
      const fetchOlder = (window as any).__pineFetchOlder;
      if (!chart || !fetchOlder) return false;
      try {
        chart.viewportManager.viewport.state.firstBarIndex = 0;
        chart.viewportManager.viewport.state.barCount = 50;
        fetchOlder('BTCUSDT', '1');
        return true;
      } catch {
        return false;
      }
    });
  }

  /**
   * Set up seed data route interception for chunk loading.
   * Returns a cleanup function.
   */
  async function setupSeedDataInterception(page: Page) {
    const seedRes = await page.request.get(`${BACKEND}/api/ohlcv/seed`);
    expect(seedRes.ok()).toBeTruthy();
    const seedData = (await seedRes.json()).data;
    expect(seedData.length).toBeGreaterThan(100);

    const TOTAL_BARS = 10_000;
    const INITIAL_COUNT = 300;
    const START_OFFSET = 2000;

    let barsServed = 0;

    const seedRouteHandler = async (route: any) => {
      const url = new URL(route.request().url());
      const end = url.searchParams.get('end') || url.searchParams.get('before');
      const limit = parseInt(url.searchParams.get('limit') || url.searchParams.get('count') || '1000', 10);

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
      const bars = seedData.slice(Math.max(0, start), Math.min(start + limit, seedData.length));
      barsServed += bars.length;
      const hasMore = start > 0 && barsServed < TOTAL_BARS;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: bars, hasMore }),
      });
    };

    // Intercept /api/ohlcv (but not /api/ohlcv/seed)
    await page.route(/\/api\/ohlcv\b/, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/seed')) {
        await route.fallback();
        return;
      }
      await seedRouteHandler(route);
    });

    // Intercept /api/bars (used by fetchSeedBars for maxLookback)
    await page.route(/\/api\/bars\b/, async (route) => {
      await seedRouteHandler(route);
    });
  }

  /**
   * Assert boundary null density does not exceed threshold.
   * For each chunk border, the null count in the 50-bar window must not
   * exceed 2x the baseline null density (nulls per bar in the full dataset).
   */
  function assertBoundaryNullDensity(
    data: NonNullable<Awaited<ReturnType<typeof getTestData>>>,
    indicatorIdx: number,
    chunkLabel: string,
  ) {
    const ind = data.indicators[indicatorIdx];
    expect(ind, `indicator at index ${indicatorIdx} found`).toBeDefined();

    // Compute baseline: average null density across all plot arrays
    const nullCounts = Object.values(ind!.plotNullCounts);
    const baselineDensity =
      nullCounts.length > 0
        ? nullCounts.reduce((a, b) => a + b, 0) / nullCounts.length
        : 0;

    // Check each boundary
    for (const boundary of ind!.boundaryNullDensities) {
      const density =
        boundary.totalBars > 0 ? boundary.nullCount / boundary.totalBars : 0;
      expect(
        density,
        `[${chunkLabel}] indicator "${ind!.id}": boundary at index ${boundary.borderIndex} null density (${density.toFixed(4)}) <= 2x baseline (${(baselineDensity * 2).toFixed(4)})`,
      ).toBeLessThanOrEqual(baselineDensity * 2);
    }
  }

  test('Indicators survive scroll-back through 3+ chunk boundaries', async ({
    page,
  }) => {
    // ── Set up route interception ───────────────────────────────────────
    await setupSeedDataInterception(page);

    // ── Navigate and wait for chart ─────────────────────────────────────
    await page.goto(FRONTEND);
    await page.waitForSelector('canvas', { timeout: 30_000 });

    // ── Enable debug mode ───────────────────────────────────────────────
    const debugBtn = page.locator('button', { hasText: 'Debug' });
    await debugBtn.click();

    // ── Wait for indicator data to appear ───────────────────────────────
    await page.waitForFunction(() => {
      const td = (window as any).__pineTestData;
      return td !== undefined && td.indicators && td.indicators.length > 0;
    }, { timeout: 60_000 });

    // ── Scroll back through 3+ chunk boundaries ──────────────────────────
    for (let i = 0; i < 4; i++) {
      const prevChunkCount = (await getTestData(page))?.chunkBorders.length ?? 0;
      await triggerScrollBack(page);
      // Wait for chunk border count to increase
      await page.waitForFunction(
        (prevCount) => {
          const td = (window as any).__pineTestData;
          return td && td.chunkBorders && td.chunkBorders.length > prevCount;
        },
        prevChunkCount,
        { timeout: 30_000 },
      );
      await page.waitForTimeout(1000);
    }

    // ── Get final data ──────────────────────────────────────────────────
    const data = await getTestData(page);
    expect(data, 'test data available').not.toBeNull();

    // ── Assert boundary null density for all indicators ─────────────────
    for (let i = 0; i < data!.indicators.length; i++) {
      assertBoundaryNullDensity(data!, i, 'after 4 scrolls');
    }

    // ── Diagnostic output ───────────────────────────────────────────────
    for (const ind of data!.indicators) {
      console.log(
        `Indicator "${ind.id}" plotNullCounts:`,
        JSON.stringify(ind.plotNullCounts),
      );
      console.log(
        `Indicator "${ind.id}" boundaryNullDensities count:`,
        ind.boundaryNullDensities.length,
      );
    }
  });

  test('Fill regions span chunk boundaries — no consecutive null gaps', async ({
    page,
  }) => {
    // ── Set up route interception ───────────────────────────────────────
    await setupSeedDataInterception(page);

    // ── Navigate and wait for chart ─────────────────────────────────────
    await page.goto(FRONTEND);
    await page.waitForSelector('canvas', { timeout: 30_000 });

    // ── Enable debug mode ───────────────────────────────────────────────
    const debugBtn = page.locator('button', { hasText: 'Debug' });
    await debugBtn.click();

    // ── Wait for indicator data to appear ───────────────────────────────
    await page.waitForFunction(() => {
      const td = (window as any).__pineTestData;
      return td !== undefined && td.indicators && td.indicators.length > 0;
    }, { timeout: 60_000 });

    // ── Scroll back through 3+ chunk boundaries ──────────────────────────
    for (let i = 0; i < 4; i++) {
      const prevChunkCount = (await getTestData(page))?.chunkBorders.length ?? 0;
      await triggerScrollBack(page);
      await page.waitForFunction(
        (prevCount) => {
          const td = (window as any).__pineTestData;
          return td && td.chunkBorders && td.chunkBorders.length > prevCount;
        },
        prevChunkCount,
        { timeout: 30_000 },
      );
      await page.waitForTimeout(1000);
    }

    // ── Get final data ──────────────────────────────────────────────────
    const data = await getTestData(page);
    expect(data, 'test data available').not.toBeNull();

    // ── Check all indicators for fill gaps at boundaries ─────────────────
    // Note: some nulls near the beginning of the dataset are expected
    // (warmup zone). We only check boundaries that are far enough from the
    // start to have meaningful data.
    const MIN_BORDER_INDEX = 800; // Skip boundaries within warmup zone
    for (const ind of data!.indicators) {
      for (const boundary of ind.boundaryNullDensities) {
        if (boundary.borderIndex < MIN_BORDER_INDEX) continue;
        const nullRatio =
          boundary.totalBars > 0
            ? boundary.nullCount / boundary.totalBars
            : 0;
        expect(
          nullRatio,
          `[fill-gap] indicator "${ind.id}": boundary at index ${boundary.borderIndex} has ${(nullRatio * 100).toFixed(1)}% nulls (max 30%)`,
        ).toBeLessThanOrEqual(0.3);
      }
    }
  });
});
