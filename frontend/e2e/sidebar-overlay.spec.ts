import { test, expect, type Page } from '@playwright/test';

/**
 * Sidebar overlay layout — regression lock for the flex-push → absolute
 * overlay change.
 *
 * USER REQUESTED: "The sidebar should not resize the current panel — it should
 * go over top of it (extend right, hover over the current panel)." The chart
 * must never flash/resize on sidebar hover.
 *
 * Old behavior: the sidebar's hover-expand was a flex item — widening it
 * shrank the active panel (and the chart canvas inside it) → visible flash.
 * New behavior: the sidebar is `absolute inset-y-0 left-0 z-40` and the
 * content wrapper carries a fixed `ml-16` (collapsed rail = 64px), so the
 * content region NEVER changes size on hover — the sidebar just floats over it.
 *
 * This spec proves, from the user's side:
 *  1. The dashboard panel region's box (x AND width) is unchanged after hover.
 *  2. The sidebar's expanded box overlaps the panel region (overlay, not push).
 *  3. The sidebar collapses back on mouse-out (no persistent state).
 *
 * Safety: view-only. No form submitted, no chart teleport, no backend state
 * created or mutated (the seed-data interception is the established
 * deterministic-chart fixture shared by the chunk-boundary/toolbar specs).
 */

const FRONTEND = 'http://localhost:3000';

/** 1px tolerance — bounding boxes can report fractional pixels. */
function expectSameBox(before: { x: number; width: number }, after: { x: number; width: number }, tolerance = 1) {
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(tolerance);
}

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

test.describe('Sidebar overlay layout (hover-expand floats over the panel)', () => {
  test('dashboard panel region does NOT resize on sidebar hover — sidebar overlays it', async ({ page }) => {
    await openDashboard(page);

    // App shell: nav + dashboard panel region + chart canvas.
    const sidebar = page.locator('nav[aria-label="Main navigation"]');
    const panel = page.locator('[aria-label="dashboard panel"]');
    const canvas = page.locator('canvas').first();
    await expect(sidebar).toBeVisible();
    await expect(panel).toBeVisible();
    await expect(canvas).toBeVisible();

    // Baseline: collapsed rail (64px), content region, chart canvas.
    await expect(sidebar).toHaveCSS('width', '64px');
    await expect(sidebar).toHaveAttribute('aria-expanded', 'false');
    const panelBefore = await panel.boundingBox();
    const canvasBefore = await canvas.boundingBox();
    expect(panelBefore).not.toBeNull();
    expect(canvasBefore).not.toBeNull();

    // Hover the sidebar → expands to the 220px overlay width (200ms transition;
    // toHaveCSS polls until the transition settles — no arbitrary timeout).
    await sidebar.hover();
    await expect(sidebar).toHaveAttribute('aria-expanded', 'true');
    await expect(sidebar).toHaveCSS('width', '220px');

    const panelAfter = await panel.boundingBox();
    const canvasAfter = await canvas.boundingBox();
    const sidebarBox = await sidebar.boundingBox();
    expect(panelAfter).not.toBeNull();
    expect(canvasAfter).not.toBeNull();
    expect(sidebarBox).not.toBeNull();

    // CORE PROOF — the content region never moves or resizes (no chart flash):
    expectSameBox(panelBefore!, panelAfter!);
    // The chart canvas itself is unchanged too — the user-visible proof.
    expectSameBox(canvasBefore!, canvasAfter!);

    // OVERLAY PROOF — the expanded sidebar extends INTO the content region
    // (x-range overlaps) instead of pushing it right.
    expect(sidebarBox!.width).toBeGreaterThan(200); // ~220px expanded
    expect(sidebarBox!.x).toBeLessThan(panelBefore!.x); // starts left of content
    expect(sidebarBox!.x + sidebarBox!.width).toBeGreaterThan(panelBefore!.x); // reaches into content

    // CLEANUP — mouse out collapses the sidebar; no persistent state.
    await page.mouse.move(panelBefore!.x + panelBefore!.width / 2, panelBefore!.y + panelBefore!.height / 2);
    await expect(sidebar).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar).toHaveCSS('width', '64px');

    // After collapse the content region is still exactly where it started.
    const panelAfterCollapse = await panel.boundingBox();
    expect(panelAfterCollapse).not.toBeNull();
    expectSameBox(panelBefore!, panelAfterCollapse!);
  });
});
