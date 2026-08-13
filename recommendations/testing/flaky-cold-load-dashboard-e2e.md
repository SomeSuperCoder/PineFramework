# Flaky cold-load determinism in dashboard e2e specs
**Date:** 2026-08-13
**Source:** team/quality/test-engineer (sidebar-overlay verification)
**Priority:** low
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Give the dashboard e2e specs a deterministic warm-up before chart-data assertions: retry the `/api/ohlcv/seed` request inside `setupSeedDataInterception` (2-3 attempts with short backoff) instead of a single `page.request.get`, and relax `chunk-boundary.spec.ts:174`'s cold-load wait (its `waitForFunction` already times out on a slow backend re-execution). The shared fixture lives in `frontend/e2e/dashboard-toolbar.spec.ts:28` and is copied by `sidebar-overlay.spec.ts` and `chunk-boundary.spec.ts`.

## Rationale
During a 6-spec run, two failures were cold-load infra flakes, both on first attempt, both passing/known on retry:
- `dashboard-toolbar.spec.ts:195` — `apiRequestContext.get: read ECONNRESET` on `GET http://localhost:8081/api/ohlcv/seed` (backend just started by the Playwright webServer).
- `chunk-boundary.spec.ts:174` — known pre-existing cold-load flake: indicator labels = 0 on first attempt, then `waitForFunction` timeout on retry waiting for the indicator to re-execute.

Neither is related to the sidebar-overlay layout change (chart-data timing, not panel geometry), but they burn ~2 minutes per affected run and will keep flaking CI until made deterministic.

## Evidence
- Run: `pnpm --filter pine-framework-frontend test:e2e e2e/sidebar-overlay.spec.ts e2e/dashboard-toolbar.spec.ts e2e/trade-dashboard.spec.ts e2e/chunk-boundary.spec.ts e2e/chunk-border-visual-regression.spec.ts e2e/scroll-back.spec.ts`
- `frontend/test-results/.last-run.json` → `failedTests` = [chunk-boundary:174 only]; summary `14 passed / 1 flaky / 1 failed`.
- Failure excerpts: `Error: apiRequestContext.get: read ECONNRESET` (dashboard-toolbar:195, passed on retry); `indicator "...": has labels (got 0)` then `page.waitForFunction: Test timeout of 60000ms exceeded` (chunk-boundary:174).

## Supersedes
- `recommendations/testing/2026-08-13-chunk-boundary-cold-load-flake.md` (qa-engineer, same day) — this recommendation covers that spec's cold-load flake (chunk-boundary.spec.ts:174) AND the seed-request ECONNRESET flake with a shared-fixture fix. Merged here; the older file is dismissed.
