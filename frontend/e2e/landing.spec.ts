import { test, expect, type Page } from '@playwright/test';

/**
 * User-behavior E2E for the landing page + navigation state machine
 * (openspec landing-page-and-nav-flow).
 *
 * House mandate: features are tested as user behavior; integration tests mock
 * the backend. Every request under /api/** is intercepted via page.route — the
 * real backend is never queried. Any flow that reaches the MAIN PANEL mounts
 * LiveDashboard / the bot WebSocket, so the socket is stubbed in-page with a
 * deterministic Idle bot snapshot (same pattern as trade-dashboard.spec.ts).
 *
 * localStorage is scoped per-test (each Playwright test boots a fresh browser
 * context), so every test starts from a clean entered-flag state; tests that
 * need a flag set it via addInitScript BEFORE navigation.
 */

const FRONTEND = 'http://localhost:3000';

/** Stable landing discriminator — unique to the landing (hero <h1 id="landing-title">). */
const LANDING_HERO = 'Write it in PineScript. Trade it live.';
/** Stable app discriminator — TopBar renders only inside the main panel. */
const APP_TOPBAR = 'topbar';

/**
 * Stub the WebSocket in-page (deterministic Idle bot snapshot on /ws/bot, all
 * other sockets inert) and mock every /api/** request so the main panel mounts
 * without any real connection or data.
 */
async function installAppMocks(page: Page) {
  await page.addInitScript(() => {
    class FakeWebSocket {
      url: string;
      readyState = 0;
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      onopen: (() => void) | null = null;
      onmessage: ((ev: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: ((ev: unknown) => void) | null = null;

      constructor(url: string) {
        this.url = url;
        if (url.includes('/ws/bot')) {
          setTimeout(() => {
            if (this.onopen) this.onopen();
            if (this.onmessage) {
              this.onmessage({
                data: JSON.stringify({
                  channel: 'bot:snapshot',
                  type: 'snapshot',
                  data: {
                    status: {
                      state: 'Idle',
                      strategyName: 'E2E Strategy',
                      dex: 'jupiter-swap',
                      walletPublicKey: null,
                      startedAt: null,
                      uptimeMs: 0,
                      balance: 0,
                      realizedPnl: 0,
                      unrealizedPnl: 0,
                      positions: [],
                      exposure: 0,
                      errors: [],
                    },
                    chaosSignals: [],
                    chaosHeartbeat: null,
                  },
                }),
              });
            }
          }, 0);
        }
      }
      send() {}
      close() {}
      addEventListener() {}
      removeEventListener() {}
    }
    (window as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
  });

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const respond = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    switch (path) {
      case '/api/bot/wallet/status':
        return respond({ success: true, hasWallet: false, locked: false });
      case '/api/bot/config':
        return respond({
          success: true,
          strategySource: '//@version=5\nstrategy("x")',
          dex: 'jupiter-swap',
          risk: { maxDailyLoss: 1 },
          autoSelect: true,
        });
      case '/api/bot/wallet/balance':
        return respond({ success: true, balance: 100 });
      case '/api/bot/history':
        return respond({ success: true, trades: [], hasMore: false, nextCursor: null });
      case '/api/bot/stats':
        return respond({ success: true, summary: null, groups: null });
      case '/api/ohlcv':
      case '/api/ohlcv/seed':
        return respond({ data: [], hasMore: false });
      case '/api/scripts':
      case '/api/scripts/built-in':
        return respond({ scripts: [] });
      case '/api/indicators':
        return respond({ indicators: [] });
      default:
        return respond({ success: true });
    }
  });
}

/** Pre-set the entered flag so the app boots straight into the MAIN PANEL. */
async function presetEnteredFlag(page: Page) {
  await page.addInitScript(() => localStorage.setItem('pine-landing-entered', '1'));
}

function landingHero(page: Page) {
  return page.getByRole('heading', { name: LANDING_HERO });
}

function appTopbar(page: Page) {
  return page.getByTestId(APP_TOPBAR);
}

test.describe('Landing page + navigation state machine (user flows)', () => {
  test('Flow 1 — first open: landing is shown, main panel is not', async ({ page }) => {
    await page.goto(FRONTEND);

    await expect(landingHero(page)).toBeVisible();
    await expect(appTopbar(page)).toHaveCount(0);
    // Get Started is the primary CTA on first open.
    await expect(page.getByRole('button', { name: 'Get Started' }).first()).toBeVisible();
  });

  test('Flow 2 — Get Started enters the main panel and persists the flag', async ({
    page,
  }) => {
    await installAppMocks(page);
    await page.goto(FRONTEND);
    await expect(landingHero(page)).toBeVisible();

    await page.getByRole('button', { name: 'Get Started' }).first().click();

    await expect(appTopbar(page)).toBeVisible();
    await expect(landingHero(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('pine-landing-entered'))).toBe('1');
  });

  test('Flow 3 — reload after entering: main panel, landing not shown', async ({ page }) => {
    await installAppMocks(page);
    await presetEnteredFlag(page);
    await page.goto(FRONTEND);

    await expect(appTopbar(page)).toBeVisible();
    await expect(landingHero(page)).toHaveCount(0);
  });

  test('Flow 4 — About button in the main panel returns to the landing', async ({ page }) => {
    await installAppMocks(page);
    await presetEnteredFlag(page);
    await page.goto(FRONTEND);
    await expect(appTopbar(page)).toBeVisible();

    await page.getByRole('button', { name: 'About' }).click();

    await expect(landingHero(page)).toBeVisible();
    await expect(appTopbar(page)).toHaveCount(0);
    // showLanding clears the flag → next load defaults to landing again.
    expect(await page.evaluate(() => localStorage.getItem('pine-landing-entered'))).toBeNull();
  });

  test('Flow 5 — logo/name click in the main panel returns to the landing', async ({ page }) => {
    await installAppMocks(page);
    await presetEnteredFlag(page);
    await page.goto(FRONTEND);
    await expect(appTopbar(page)).toBeVisible();

    await page.getByRole('button', { name: /back to landing/i }).click();

    await expect(landingHero(page)).toBeVisible();
    await expect(appTopbar(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('pine-landing-entered'))).toBeNull();
  });

  test('Flow 6 — reload after About/logo: landing is shown again', async ({ page }) => {
    await installAppMocks(page);
    // Pure user journey: land → Get Started (persists flag) → About (clears
    // flag) → reload. No init script — an addInitScript would re-apply the
    // flag on reload and defeat the scenario.
    await page.goto(FRONTEND);
    await expect(landingHero(page)).toBeVisible();

    await page.getByRole('button', { name: 'Get Started' }).first().click();
    await expect(appTopbar(page)).toBeVisible();

    await page.getByRole('button', { name: 'About' }).click();
    await expect(landingHero(page)).toBeVisible();

    await page.reload();

    await expect(landingHero(page)).toBeVisible();
    await expect(appTopbar(page)).toHaveCount(0);
  });

  test('F-1 regression — "/" on the landing does NOT open the QuickAdder', async ({ page }) => {
    await page.goto(FRONTEND);
    await expect(landingHero(page)).toBeVisible();

    await page.keyboard.press('/');

    // The QuickAdder popup input never mounts on the landing view.
    await expect(page.getByPlaceholder('Search indicators & strategies...')).toHaveCount(0);
    await expect(appTopbar(page)).toHaveCount(0);
  });
});