import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Visual regression test for chunk border data quality.
 *
 * The core issue: when an indicator's plot has a color parameter that
 * depends on state (e.g. trend), there are two data streams:
 *   1. Raw plot data — the numeric values (determines if the line is drawn)
 *   2. plotColors — per-bar color overrides (determines the line's color)
 *
 * If the raw data extends past the warmup zone but plotColors has nulls
 * there, the line is drawn but uncolored — an "orphaned value." When the
 * next chunk loads and re-executes, the merge may keep the old orphaned
 * values instead of overwriting them with the new result's nulls.
 *
 * This test detects orphaned values at chunk borders by comparing
 * plotColors null positions against raw data null positions.
 */

const BACKEND = 'http://localhost:8081';
const FRONTEND = 'http://localhost:3000';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    try {
      const existingRes = await request.get(`${BACKEND}/api/indicators`);
      if (existingRes.ok()) {
        const existing = (await existingRes.json()).indicators || [];
        for (const ind of existing) {
          if (ind.scriptId === 'e2e-test-zero-lag' || ind.scriptId === 'e2e-test-kalman') {
            await request.delete(`${BACKEND}/api/indicators/${ind.id}`);
          }
        }
      }
    } catch { /* ignore */ }

    const addZeroLag = await request.post(`${BACKEND}/api/indicators`, {
      data: { scriptId: 'e2e-test-zero-lag', name: 'Zero Lag E2E', overlay: true, source: zeroLagSource },
    });
    expect(addZeroLag.ok()).toBeTruthy();

    const addKalman = await request.post(`${BACKEND}/api/indicators`, {
      data: { scriptId: 'e2e-test-kalman', name: 'Kalman E2E', overlay: true, source: kalmanSource },
    });
    expect(addKalman.ok()).toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    try {
      const res = await request.get(`${BACKEND}/api/indicators`);
      if (res.ok()) {
        for (const ind of (await res.json()).indicators || []) {
          if (ind.scriptId === 'e2e-test-zero-lag' || ind.scriptId === 'e2e-test-kalman') {
            await request.delete(`${BACKEND}/api/indicators/${ind.id}`);
          }
        }
      }
    } catch { /* ignore */ }
  });

  async function getTestData(page: Page): Promise<{
    indicators: Array<{
      id: string;
      plotNullCounts: Record<string, number>;
      boundaryNullDensities: Array<{ borderIndex: number; nullCount: number; totalBars: number }>;
      orphanedValueCounts: Record<string, number>;
      orphanedAtBorders: Array<{ plotKey: string; borderIndex: number; count: number }>;
    }>;
    chunkBorders: Array<number>;
  } | null> {
    return page.evaluate(() => {
      const td = (window as any).__pineTestData;
      if (!td) return null;
      return { indicators: td.indicators, chunkBorders: td.chunkBorders };
    });
  }

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
      } catch { return false; }
    });
  }

  async function setupSeedDataInterception(page: Page) {
    const seedRes = await page.request.get(`${BACKEND}/api/ohlcv/seed`);
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

  test('No orphaned plot values after 10 chunk loads', async ({ page }) => {
    await setupSeedDataInterception(page);
    await page.goto(FRONTEND);
    await page.waitForSelector('canvas', { timeout: 30_000 });

    const debugBtn = page.locator('button', { hasText: 'Debug' });
    await debugBtn.click();

    await page.waitForFunction(() => {
      const td = (window as any).__pineTestData;
      return td !== undefined && td.indicators && td.indicators.length > 0;
    }, { timeout: 60_000 });

    // Scroll back through 10 chunk boundaries
    for (let i = 0; i < 10; i++) {
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
      await page.waitForTimeout(500);
    }

    const data = await getTestData(page);
    expect(data, 'test data available').not.toBeNull();

    // ── Core assertion: no merge-induced orphaned values at borders ─────
    // An orphaned value is a position where plotColors is null (uncolored)
    // but the raw data has a value (line is drawn).
    //
    // Indicators may have inherent orphaned values in their warmup period
    // (e.g. Kalman filter). We don't flag those. We only flag when the
    // orphaned density at a chunk border significantly exceeds the indicator's
    // overall orphaned density — that signals a merge regression.
    const orphanedErrors: string[] = [];
    for (const ind of data!.indicators) {
      const totalOrphaned = Object.values(ind.orphanedValueCounts).reduce((a, b) => a + b, 0);
      const baselineDensity = ind.totalBars > 0 ? totalOrphaned / ind.totalBars : 0;

      for (const entry of ind.orphanedAtBorders) {
        const windowSize = 100; // ±50 bars = 100 bar window
        const borderDensity = entry.count / windowSize;
        // Flag only if border density exceeds 2x baseline (merge regression)
        // and the count is significant (>5 orphaned values)
        if (borderDensity > baselineDensity * 2 && entry.count > 5) {
          orphanedErrors.push(
            `indicator "${ind.id}": plot "${entry.plotKey}" has ${entry.count} orphaned values at border index ${entry.borderIndex} (density ${borderDensity.toFixed(3)} > 2x baseline ${baselineDensity.toFixed(3)})`,
          );
        }
      }
    }
    if (orphanedErrors.length > 0) {
      console.log('ORPHANED VALUES AT BORDERS:');
      for (const err of orphanedErrors) console.log(`  - ${err}`);
    }

    // ── Diagnostic output ───────────────────────────────────────────────
    for (const ind of data!.indicators) {
      console.log(`Indicator "${ind.id}": plots=${Object.keys(ind.plotNullCounts).join(',')} borders=${ind.boundaryNullDensities.length} orphanedAtBorders=${JSON.stringify(ind.orphanedAtBorders)}`);
    }

    expect(orphanedErrors.length, `no orphaned values at chunk borders`).toBe(0);

    // ── Boundary null density check ─────────────────────────────────────
    for (let i = 0; i < data!.indicators.length; i++) {
      const ind = data!.indicators[i];
      const nullCounts = Object.values(ind.plotNullCounts);
      const baselineDensity = nullCounts.length > 0
        ? nullCounts.reduce((a, b) => a + b, 0) / nullCounts.length
        : 0;

      for (const boundary of ind.boundaryNullDensities) {
        const density = boundary.totalBars > 0 ? boundary.nullCount / boundary.totalBars : 0;
        expect(
          density,
          `[boundary] indicator "${ind.id}": boundary at ${boundary.borderIndex} density ${density.toFixed(4)} <= 2x baseline ${baselineDensity.toFixed(4)}`,
        ).toBeLessThanOrEqual(baselineDensity * 2);
      }
    }

    // ── Diagnostic output ───────────────────────────────────────────────
    for (const ind of data!.indicators) {
      console.log(`Indicator "${ind.id}": ${Object.keys(ind.plotNullCounts).length} plots, ${ind.boundaryNullDensities.length} borders, orphaned=${JSON.stringify(ind.orphanedAtBorders)}`);
    }
  });
});
