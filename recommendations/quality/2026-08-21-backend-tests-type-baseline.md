# [Fix backend/tests type baseline — 74 errors across 22 files]
**Date:** 2026-08-21
**Source:** Backend Engineer (b10-tsconfig wave; trims original backend-tests-tsconfig-gap rec — coverage gap CLOSED)
**Priority:** medium
**Status:** pending
**Effort:** large (>4hr)

## Recommendation
`backend/tsconfig.test.json` + `pnpm typecheck:tests` now exist (coverage gap closed, CI gate untouched). Remaining: fix the 74 surfaced pre-existing errors across 22 test files so `typecheck:tests` can eventually join the CI gate. Breakdown: TS2322 ×23 (null vs number|undefined, mostly backtest-card.test.ts), TS2339 ×17, TS2345 ×12 (FeeFetchResult stubs in backtest-parity.test.ts), TS6133 ×7, TS2352 ×6. Worst files: builtInScripts(9), backtest-card(8), settings-route/logger/backtest-parity(7 each).

## Rationale
Stale types in backend tests silently survive every gate; the new config makes them visible but red.

## Evidence
data/handoffs/team/backend/backend-engineer/b10-tsconfig.json
