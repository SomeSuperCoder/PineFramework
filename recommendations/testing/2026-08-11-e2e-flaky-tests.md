# E2E flaky tests block green `just test`
**Date:** 2026-08-11
**Source:** DevOps Engineer (work report, Playwright wiring)
**Priority:** medium
**Status:** pending
**Effort:** large (>4hr)

## Recommendation
Triage and fix pre-existing E2E flakiness + failures so `just test` can exit 0:
- `tests/integration/trading/bot-lifecycle.test.ts` — flaky `[Shutdown] Hook 0 failed: Error: Hook failed` (passed run #1, failed run #2, zero code change)
- `frontend/e2e/trade-dashboard.spec.ts` — 3 failures ('Bot Dashboard' button timeout)
- `frontend/e2e/chunk-boundary.spec.ts` — labels got 0 (flaky)
- `frontend/e2e/dashboard-toolbar.spec.ts` — ECONNRESET on seed (flaky)

Also: `retries: 1` in `frontend/playwright.config.ts` is masking flakiness — investigate root causes instead of relying on retries.

## Rationale
The recipes are wired correctly (all 6 Playwright specs + vitest run under `just test`), but the suite exits non-zero due to these untouched-file failures, which blocks a green CI/commit gate.

## Evidence
- `just test` run #1: vitest passed → Playwright ran all 6 spec files → 9 passed, 3 failed, 2 flaky (all pre-existing specs, not the moved one)
- Isolated `scroll-back.spec.ts` run: ✅ 1 passed (14.3s)
