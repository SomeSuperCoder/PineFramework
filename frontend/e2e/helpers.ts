import type { Page } from '@playwright/test';

/**
 * Shared E2E helpers (landing-page-and-nav-flow blast radius).
 *
 * The landing page is now the first screen (openspec landing-page-and-nav-flow,
 * requirement "Landing page rendered on first open"). Existing specs that
 * target the MAIN PANEL must pre-set the `pine-landing-entered` flag BEFORE the
 * app boots so `useLandingGate` resolves to the app view synchronously.
 *
 * `addInitScript` runs in the page context before the app's own scripts on
 * every navigation, so the flag is in place when `useState`'s lazy initializer
 * reads it — no landing flash, no waitForTimeout.
 */
export async function enterAppDirectly(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pine-landing-entered', '1');
    } catch {
      // Storage unavailable (private mode) — the panel still opens for the
      // session, mirroring the hook's best-effort persistence contract.
    }
  });
}