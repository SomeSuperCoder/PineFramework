# Harden DashboardToolbar E2E locator with data-testid
**Date:** 2026-08-11
**Source:** QA Engineer
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Add `data-testid="dashboard-toolbar"` to the toolbar root div and change the `toolbarLocator()` helper in `frontend/e2e/dashboard-toolbar.spec.ts` from `page.getByLabel('Symbol').locator('..')` to `page.getByTestId('dashboard-toolbar')`.

## Rationale
The current helper couples the toolbar container to the DOM nesting of the Symbol select (its direct parent). Any future wrapper around the selects (e.g. grouping left-side controls in a labeled container) silently breaks the locator's meaning, and `..`-style parent traversal is brittle across refactors. A stable testid is the house pattern for explicit test hooks.

## Evidence
`frontend/e2e/dashboard-toolbar.spec.ts:20-22` — helper relies on `getByLabel('Symbol').locator('..')`. TopBar already uses `data-testid="topbar"` (`frontend/src/components/TopBar.tsx:28`) as the established precedent.