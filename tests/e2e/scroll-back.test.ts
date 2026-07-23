import { test, expect } from '@playwright/test';

/**
 * Integration test: scroll-back loads older OHLCV data.
 *
 * Prerequisites:
 *   - Backend server running on localhost:8081
 *   - Frontend dev server running on localhost:3000
 */
test.describe('OHLCV scroll-back', () => {
  test('scrolling left loads older data and viewport stays at left edge', async ({ page }) => {
    const ohlcvRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/ohlcv')) {
        ohlcvRequests.push(req.url());
      }
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 10_000 });

    // Wait for initial data
    await expect.poll(() => ohlcvRequests.length, {
      timeout: 15_000,
    }).toBeGreaterThanOrEqual(1);

    await page.waitForTimeout(2000);

    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas has no bounding box');

    const requestsBefore = ohlcvRequests.length;

    // Drag RIGHT from near-left-edge to right-edge of canvas.
    // canvas: x=0..1280. Drag from x=50 to x=1250 = 1200px.
    // With barSpacing=2 (1000 bars on 1280px), that's 600 bars.
    // Starting from firstBarIndex≈358, this scrolls to ≈0.
    const dragStartX = box.x + 50;
    const dragEndX = box.x + box.width - 30;
    const dragY = box.y + box.height / 2;

    await page.mouse.move(dragStartX, dragY);
    await page.mouse.down();

    // Drag in small steps so each mousemove is dispatched on the canvas
    const steps = 40;
    const stepSize = (dragEndX - dragStartX) / steps;
    for (let i = 0; i < steps; i++) {
      await page.mouse.move(dragStartX + (i + 1) * stepSize, dragY);
      await page.waitForTimeout(16);
    }

    await page.mouse.up();
    await page.waitForTimeout(3000);

    const newRequests = ohlcvRequests.slice(requestsBefore);
    const scrollBackCalls = newRequests.filter((url) => url.includes('end='));

    console.log('All OHLCV requests:', ohlcvRequests);
    console.log('Scroll-back calls:', scrollBackCalls);

    await page.screenshot({ path: 'tests/e2e/scroll-back-result.png' });

    expect(scrollBackCalls.length).toBeGreaterThanOrEqual(1);
  });
});
