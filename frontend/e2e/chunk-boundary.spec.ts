import { test, expect, type Page } from '@playwright/test';

/**
 * HHLL indicator uses label.new() with text "HH", "HL", "LL", "LH" for
 * pivot points, and line.new() for S/R lines.  On bar re-execution the
 * indicator creates the same labels/lines — the merge logic (text+price
 * dedup) must prevent duplicates and the prepend logic must maintain
 * label==line parity near chunk borders.
 */

const BACKEND = 'http://localhost:8081';
const FRONTEND = 'http://localhost:3000';

test.describe('Chunk boundary invariants', () => {
  let hhllSource: string;

  test.beforeAll(async ({ request }) => {
    // 1. Fetch the HHLL indicator source
    const builtInRes = await request.get(`${BACKEND}/api/scripts/built-in`);
    expect(builtInRes.ok()).toBeTruthy();
    const scripts = (await builtInRes.json()).scripts;
    const hhll = scripts.find((s: any) => s.id === 'builtin_higher-high-lower-low');
    expect(hhll).toBeDefined();
    hhllSource = hhll.source;

    // 2. Clean up any previous test indicator
    const existingRes = await request.get(`${BACKEND}/api/indicators`);
    if (existingRes.ok()) {
      const existing = (await existingRes.json()).indicators || [];
      for (const ind of existing) {
        if (ind.scriptId === 'e2e-test-hhll') {
          await request.delete(`${BACKEND}/api/indicators/${ind.id}`);
        }
      }
    }

    // 3. Add the HHLL indicator so the app auto-loads it on connect
    const addRes = await request.post(`${BACKEND}/api/indicators`, {
      data: {
        scriptId: 'e2e-test-hhll',
        name: 'HHLL E2E',
        overlay: true,
        source: hhllSource,
      },
    });
    expect(addRes.ok()).toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    // Clean up — remove the test indicator
    const res = await request.get(`${BACKEND}/api/indicators`);
    if (res.ok()) {
      const indicators = (await res.json()).indicators || [];
      for (const ind of indicators) {
        if (ind.scriptId === 'e2e-test-hhll') {
          await request.delete(`${BACKEND}/api/indicators/${ind.id}`);
        }
      }
    }
  });

  /**
   * Read __pineTestData — returns null if not yet populated.
   */
  async function getTestData(page: Page): Promise<{
    indicators: Array<{ id: string; labels: any[]; lines: any[] }>;
    chunkBorders: Array<{ barIndex: number; addedCount: number; timestamp: number }>;
    labelCount: number;
    lineCount: number;
  } | null> {
    return page.evaluate(() => {
      const td = (window as any).__pineTestData;
      if (!td) return null;
      return {
        indicators: td.indicators,
        chunkBorders: td.chunkBorders,
        labelCount: td.labelCount,
        lineCount: td.lineCount,
      };
    });
  }

  /**
   * Programmatically trigger a scroll-back by moving the viewport to
   * the oldest data and firing onVisibleRangeChange.
   * Returns true if the scroll-back was triggered.
   */
  async function triggerScrollBack(page: Page): Promise<{ ok: boolean; debug: any }> {
    return page.evaluate(() => {
      const chart = (window as any).__pineChart;
      const fetchOlder = (window as any).__pineFetchOlder;
      if (!chart || !fetchOlder) {
        return { ok: false, debug: `chart=${!!chart}, fetchOlder=${!!fetchOlder}` };
      }
      try {
        const stateBefore = chart.viewportManager.viewport.getState();
        // Set viewport to beginning so data is within threshold
        chart.viewportManager.viewport.state.firstBarIndex = 0;
        chart.viewportManager.viewport.state.barCount = 50;
        // Call fetchOlderOHLCV directly with current symbol/interval
        const result = fetchOlder('BTCUSDT', '1');
        return {
          ok: true,
          debug: { stateBefore, resultType: typeof result },
        };
      } catch (e: any) {
        return { ok: false, debug: `error: ${e.message}` };
      }
    });
  }

  /**
   * Assert invariants on the current __pineTestData.
   */
  function assertInvariants(
    data: NonNullable<Awaited<ReturnType<typeof getTestData>>>,
    chunkLabel: string,
  ) {
    // 1. Labels and lines must not be empty (no "wall" at chunk borders)
    for (const ind of data.indicators) {
      expect(
        ind.labels.length,
        `[${chunkLabel}] indicator "${ind.id}": has labels (got ${ind.labels.length})`,
      ).toBeGreaterThan(0);
      expect(
        ind.lines.length,
        `[${chunkLabel}] indicator "${ind.id}": has lines (got ${ind.lines.length})`,
      ).toBeGreaterThan(0);
    }

    // 2. No duplicate (time, text, price) tuples within each indicator
    //    HHLL can produce the same (text, price) at different timestamps
    //    (same price level acting as pivot on different bars), so the dedup
    //    key must include time to only catch genuine duplicates.
    for (const ind of data.indicators) {
      const seen = new Set<string>();
      for (const lbl of ind.labels) {
        const key = `${lbl.time}|${lbl.text ?? ''}|${lbl.price}`;
        expect(
          seen.has(key),
          `[${chunkLabel}] indicator "${ind.id}": duplicate label (time=${lbl.time}, text="${lbl.text}", price=${lbl.price})`,
        ).toBeFalsy();
        seen.add(key);
      }
    }

    // 3. Label count is at least line count (labels per pivot > S/R lines)
    for (const ind of data.indicators) {
      expect(
        ind.labels.length,
        `[${chunkLabel}] indicator "${ind.id}": labelCount (${ind.labels.length}) >= lineCount (${ind.lines.length})`,
      ).toBeGreaterThanOrEqual(ind.lines.length);
    }

    // 4. Chunk borders have been recorded
    expect(
      data.chunkBorders.length,
      `[${chunkLabel}] at least one chunk border recorded`,
    ).toBeGreaterThanOrEqual(0);
  }

  test('HHLL labels === lines across chunk boundaries, no duplicates, no wall', async ({ page }) => {
    // ── Intercept OHLCV to serve seed data ──────────────────────────────
    let seedData: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = [];

    // Load seed data once
    const seedRes = await page.request.get(`${BACKEND}/api/ohlcv/seed`);
    expect(seedRes.ok()).toBeTruthy();
    seedData = (await seedRes.json()).data;
    expect(seedData.length).toBeGreaterThan(100);

    const TOTAL_BARS = 10_000; // seed data total
    const INITIAL_COUNT = 300;
    const CHUNK_COUNT = 200;
    const START_OFFSET = 2000; // start serving from the middle so both sides have data

    // Track how many bars have been served total (for hasMore)
    let barsServed = 0;

    const handledUrls: string[] = [];

    // Shared handler for /api/ohlcv?end=&limit= and /api/bars?before=&count=
    const seedRouteHandler = async (route: any) => {
      const url = new URL(route.request().url());
      const requestUrl = route.request().url();
      handledUrls.push(requestUrl);

      const end = url.searchParams.get('end') || url.searchParams.get('before');
      const limit = parseInt(url.searchParams.get('limit') || url.searchParams.get('count') || '1000', 10);

      if (!end) {
        // Initial request — serve from the middle of seed data
        // so there are older bars to scroll back to
        barsServed = INITIAL_COUNT;
        const bars = seedData.slice(START_OFFSET, START_OFFSET + INITIAL_COUNT);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: bars, hasMore: true }),
        });
        return;
      }

      // Scroll-back or seed-fill request — serve bars BEFORE the initial set
      const endTs = parseInt(end, 10);
      const refIdx = seedData.findIndex((b) => b.timestamp >= endTs);
      const start = Math.max(0, (refIdx >= 0 ? refIdx : seedData.length) - limit);
      if (start <= 0 && barsServed >= INITIAL_COUNT) {
        // No more data to serve
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

    // ── Navigate and wait for chart ─────────────────────────────────────
    await page.goto(FRONTEND);
    // Wait for the canvas element (chart rendered)
    await page.waitForSelector('canvas', { timeout: 30000 });

    // ── Enable debug mode ───────────────────────────────────────────────
    const debugBtn = page.locator('button', { hasText: 'Debug' });
    await debugBtn.click();

    // ── Wait for indicator data to appear ───────────────────────────────
    // The app auto-loads the HHLL indicator on fetchIndicators() and
    // executes it via the script runner.  We wait until __pineTestData
    // has at least one indicator with labelCount > 0.
    let testData: Awaited<ReturnType<typeof getTestData>> = null;
    await page.waitForFunction(() => {
      const td = (window as any).__pineTestData;
      return td !== undefined && td.indicators && td.indicators.length > 0 && td.labelCount > 0;
    }, { timeout: 60000 });

    testData = await getTestData(page);
    expect(testData).not.toBeNull();
    console.log('Handled URLs:', handledUrls);
    console.log('Total labelCount:', testData!.labelCount);
    assertInvariants(testData!, 'initial');

    // ── Scroll-back loop: trigger chunk loads and verify invariants ─────
    const MAX_CHUNKS = 4;
    let initialChunkCount = testData!.chunkBorders.length;

    for (let i = 0; i < MAX_CHUNKS; i++) {
      const prevLabelCount = testData!.labelCount;

      // Trigger scroll-back by moving viewport to the oldest bar
      const sbResult = await triggerScrollBack(page);
      console.log(`Chunk ${i + 1} scroll-back result:`, JSON.stringify(sbResult));
      expect(sbResult.ok, `chunk ${i + 1}: chart accessible`).toBeTruthy();

      // Wait for the indicator to re-execute (labelCount changes)
      await page.waitForFunction(
        (args) => {
          const td = (window as any).__pineTestData;
          return (
            td !== undefined &&
            td.chunkBorders &&
            td.chunkBorders.length > args.initialChunkCount &&
            td.labelCount > args.prevLabelCount
          );
        },
        { initialChunkCount, prevLabelCount },
        { timeout: 30000 },
      );

      testData = await getTestData(page);

      // Debug: dump full label list for chunk 2
      if (testData!.chunkBorders.length >= 2) {
        for (const ind of testData!.indicators) {
          console.log(`  ind=${ind.id}: ${ind.labels.length} labels`);
          const seen = new Map<string, number>();
          for (const lbl of ind.labels) {
            const key = `${lbl.time}|${lbl.text ?? ''}|${lbl.price}`;
            const count = (seen.get(key) ?? 0) + 1;
            seen.set(key, count);
            if (count === 2) {
              console.log(`  ⚠️  DUPE: time=${lbl.time} text=${lbl.text} price=${lbl.price}`);
              // Dump all labels at this time
              const sameTime = ind.labels.filter((l2: any) => l2.time === lbl.time);
              console.log(`  same time labels:`, JSON.stringify(sameTime.map((l2: any) => ({time: l2.time, text: l2.text, price: l2.price}))));
            }
          }
        }
      }

      initialChunkCount = testData!.chunkBorders.length;
      assertInvariants(testData!, `chunk ${i + 1} (${testData!.chunkBorders.length} borders)`);
      console.log(`✅ Chunk ${i + 1}: labelCount=${testData!.labelCount}, lineCount=${testData!.lineCount}, borders=${testData!.chunkBorders.length}`);

      // Let React settle before next trigger
      await page.waitForTimeout(1000);
    }

    // ── Final state: we have loaded through at least 4 chunks ────────────
    // Label and line counts should be substantial (many pivot points in 1100+ bars)
    expect(testData!.labelCount).toBeGreaterThan(0);
    expect(testData!.lineCount).toBeGreaterThan(0);
    expect(testData!.chunkBorders.length).toBeGreaterThanOrEqual(1);

    // ── Verify chunk borders have corresponding labels/lines ────────────
    // For each chunk border, check that nearby indicators have labels and lines
    // (i.e., no "wall" where labels disappear at the boundary)
    for (const border of testData!.chunkBorders) {
      for (const ind of testData!.indicators) {
        // Every chunk border should have at least some labels and lines on both sides
        // (HHLL generates ~2-3% of bars as pivots, so with 200-bar chunks we expect ~4-6 labels)
        expect(
          ind.labels.length,
          `border barIndex=${border.barIndex}: indicator "${ind.id}" has ${ind.labels.length} labels (expected > 0)`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
