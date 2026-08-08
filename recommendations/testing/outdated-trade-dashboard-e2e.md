# Outdated e2e test targets dead 'Bot Dashboard' footer button (pre-existing, NOT from split)
**Date:** 2026-08-08
**Source:** Test Engineer
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Update `frontend/e2e/trade-dashboard.spec.ts` `openDashboard()` to open the dashboard via the current sidebar nav (`getByRole('button', { name: 'Bot panel' })` — the app switched to full-screen sidebar navigation in commit `1d1a4cb`), instead of the footer-bar `TradingBotControlButton` ('Bot Dashboard') that is no longer rendered anywhere. The footer-bar `AppToolbar` component is dead code and can likely be removed.

## Rationale
The 3 trade-dashboard e2e failures are NOT caused by the TradingBotPanel split — they predate it. The test clicks `getByRole('button', { name: 'Bot Dashboard' })`, which existed only in `AppToolbar` (rendered by nobody since commit `1d1a4cb` "full-screen ControlPanel shell with sidebar navigation"). Commit order: `02e2dc9` (test added) → `1d1a4cb` (nav migration, button removed) → split commits. The page snapshot shows the app fully loads with the sidebar 'Bot panel' button. App.tsx was untouched by the split (last commit `2606f49`).

## Evidence
- `frontend/e2e/trade-dashboard.spec.ts:278` — `await page.getByRole('button', { name: 'Bot Dashboard' }).click();`
- `frontend/src/components/AppToolbar.tsx:237` — renders `<TradingBotControlButton>`, but no file imports/renders `<AppToolbar>`.
- Page snapshot in `test-results/trade-dashboard-*/error-context.md` shows sidebar nav ('Bot panel') present, footer 'Bot Dashboard' absent.
- Vitest suite 248/248 green (incl. all facade-importing tests); pinned visual regression passes.
