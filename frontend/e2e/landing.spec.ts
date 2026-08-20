import { test, expect, type Page } from '@playwright/test';
import { enterAppDirectly } from './helpers';

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

/* ===================================================================== */
/* Landing v2 — interactive shadcn charts (DESIGN §2.2/§2.4/§2.5)        */
/* ===================================================================== */

test.describe('Landing v2 — interactive charts (user flows)', () => {
  test('hovering the hero area chart reveals the tooltip', async ({ page }) => {
    await page.goto(FRONTEND);
    await expect(landingHero(page)).toBeVisible();

    const heroChart = page.locator('section[aria-labelledby="landing-title"] .recharts-wrapper');
    await heroChart.hover({ position: { x: 160, y: 60 } });

    // Recharts renders the tooltip wrapper with visibility:hidden until active.
    // The hero chart's shadcn formatter REPLACES the row content with the
    // formatted value (toFixed(1)) — assert the numeric value, not the label.
    const tooltip = heroChart.locator('.recharts-tooltip-wrapper');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(/\d+\.\d/);
  });

  test('hovering the equity area chart reveals the tooltip', async ({ page }) => {
    await page.goto(FRONTEND);
    await expect(landingHero(page)).toBeVisible();

    const equityChart = page.locator('#backtest .recharts-wrapper');
    await equityChart.scrollIntoViewIfNeeded();
    await equityChart.hover({ position: { x: 160, y: 60 } });

    const tooltip = equityChart.locator('.recharts-tooltip-wrapper');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(/\d+\.\d/);
  });

  test('hovering the bot bar sparkline reveals the tooltip + active-bar highlight', async ({
    page,
  }) => {
    await page.goto(FRONTEND);
    await expect(landingHero(page)).toBeVisible();

    const botChart = page.locator('section[aria-labelledby="bot-heading"] .recharts-wrapper');
    await botChart.scrollIntoViewIfNeeded();
    await botChart.hover({ position: { x: 160, y: 40 } });

    const tooltip = botChart.locator('.recharts-tooltip-wrapper');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Trades');
    // activeBar highlight — the hovered bar is remapped to the brighter blue.
    await expect(botChart.locator('[fill="#5b7bff"]').first()).toBeVisible();
  });
});

/* ===================================================================== */
/* Landing v2 — PullCord light/dark toggle (DESIGN §13.3)                */
/* ===================================================================== */

test.describe('Landing v2 — PullCord theme toggle (§13)', () => {
  function pullCord(page: Page) {
    return page.getByRole('button', { name: 'Toggle theme' });
  }

  function landingRoot(page: Page) {
    return page.locator('[data-landing-theme]');
  }

  test('default dark; PullCord flips data-landing-theme to light and persists on reload', async ({
    page,
  }) => {
    await page.goto(FRONTEND);
    await expect(landingHero(page)).toBeVisible();
    await expect(landingRoot(page)).toHaveAttribute('data-landing-theme', 'dark');

    await expect(page.locator('.pullcord-inner--drop')).toHaveCount(0);
    await pullCord(page).click();

    await expect(landingRoot(page)).toHaveAttribute('data-landing-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('pine-landing-theme'))).toBe('light');

    // Refresh restores the choice.
    await page.reload();
    await expect(landingHero(page)).toBeVisible();
    await expect(landingRoot(page)).toHaveAttribute('data-landing-theme', 'light');
  });

  test('toggling back restores dark and persists', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('pine-landing-theme', 'light'));
    await page.goto(FRONTEND);
    await expect(landingRoot(page)).toHaveAttribute('data-landing-theme', 'light');

    await expect(page.locator('.pullcord-inner--drop')).toHaveCount(0);
    await pullCord(page).click();

    await expect(landingRoot(page)).toHaveAttribute('data-landing-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('pine-landing-theme'))).toBe('dark');
  });

  test('PullCord mirrors the theme state to aria-pressed (WAI-ARIA toggle button)', async ({
    page,
  }) => {
    await page.goto(FRONTEND);
    await expect(page.locator('.pullcord-inner--drop')).toHaveCount(0);
    await expect(pullCord(page)).toHaveAttribute('aria-pressed', 'false');

    await pullCord(page).click();
    await expect(pullCord(page)).toHaveAttribute('aria-pressed', 'true');
  });
});

/* ===================================================================== */
/* Landing v2 — landing-only theme scope (§13.1)                         */
/* ===================================================================== */

test.describe('Landing v2 — main panel stays dark (§13.1)', () => {
  test('the app surface carries NO landing-theme attribute', async ({ page }) => {
    await installAppMocks(page);
    await enterAppDirectly(page);
    await page.goto(FRONTEND);

    await expect(appTopbar(page)).toBeVisible();
    await expect(landingHero(page)).toHaveCount(0);
    // The landing theme scope is landing-only: it unmounts with the landing
    // view, so no [data-landing-theme] (dark OR light) can exist in the app.
    await expect(page.locator('[data-landing-theme]')).toHaveCount(0);
  });
});

/* ===================================================================== */
/* Landing v2 — reduced-motion collapse (DESIGN §8)                      */
/* ===================================================================== */

test.describe('Landing v2 — advanced motion collapses under reduced motion (§8)', () => {
  test('magnetic CTA and parallax/tilt hero panel are static for prefers-reduced-motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(FRONTEND);
    await expect(landingHero(page)).toBeVisible();

    // Magnetic CTA: hover the header Get Started — its Magnetic wrapper span
    // must NOT pull (renders as a plain span under reduced motion). The header
    // holds exactly one Magnetic wrapper, so scope to it (the hero/footer CTAs
    // are also wrapped in identical spans).
    const headerMagnetic = page.locator('header span.inline-flex');
    const headerCta = page.getByRole('button', { name: 'Get Started' }).first();
    await headerCta.hover();
    expect(await headerMagnetic.evaluate((el) => getComputedStyle(el).transform)).toBe('none');

    // Parallax/tilt hero demo panel: scroll, then assert no scroll-linked or
    // pointer-linked transform ever appears.
    const heroPanel = page.locator('section[aria-labelledby="landing-title"] div.relative.p-5');
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    expect((await heroPanel.getAttribute('style')) ?? '').not.toContain('transform');
    expect(await heroPanel.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  });
});

/* ===================================================================== */
/* Landing v2 — JellyBlobMascot accent (DESIGN §12/§13.3)                */
/* ===================================================================== */

test.describe('Landing v2 — JellyBlobMascot near the bot panel', () => {
  test('the mascot is visible beside the bot panel', async ({ page }) => {
    await page.goto(FRONTEND);
    await expect(landingHero(page)).toBeVisible();

    const botSection = page.locator('section[aria-labelledby="bot-heading"]');
    const mascot = botSection.locator('.landing-mascot svg');
    await mascot.scrollIntoViewIfNeeded();
    await expect(mascot).toBeVisible();
  });
});