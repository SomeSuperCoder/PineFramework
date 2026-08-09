# Pre-existing tsc failures in tests/ and frontend/
**Date:** 2026-08-09
**Source:** multiple agents (backend-engineer M2/M5/M6, integration-engineer M4, test-engineer M3/M8)
**Priority:** high
**Status:** pending
**Effort:** large (>4hr)

## Recommendation
Fix the repo-wide `pnpm exec tsc --noEmit` failures (~323–369 errors) concentrated in `tests/unit/trading/*`, `tests/integration/*`, `tests/evil/*`, `frontend/` (incl. `frontend/src/chart/InteractionHandler.ts` DOM-globals and `diagnostics-card.test.tsx`). This predates the PnL SSOT change and is not caused by it, but it degrades every future change's verification story (agents must filter noise).

## Rationale
Every engineer on this change reported the same pre-existing errors. They obscure whether a change introduces new type errors; agents spend tokens filtering. A dedicated cleanup wave (typed mocks, DOM-global types, dead-code removal) restores a clean baseline so the typecheck is a reliable gate.

## Evidence
- M2/M5/M6 reports: "323 pre-existing errors in tests/ + frontend/".
- M4 report: "369 test-tree errors, 4 of which were NEW (fixed by test-engineer)".
- The errors are in test fixtures and chart DOM-globals — unrelated to PnL math.
