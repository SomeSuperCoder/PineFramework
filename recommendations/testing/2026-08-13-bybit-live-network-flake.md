# bybit.test.ts live-network flake
**Date:** 2026-08-13
**Source:** Test Engineer (handoff: data/handoffs/team/quality/test-engineer/sso-tests.json)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
`backend/tests/bybit.test.ts` (fetchBars) calls the real Bybit public API and flakes on a 5s timeout. It should mock the HTTP layer or use a recorded fixture so the suite is deterministic and network-independent.

## Rationale
A live-network unit test makes the full suite non-deterministic — the SSoT verification run showed 2774 passed / 1 failed, and the single failure was this pre-existing flake, unrelated to the change. Deterministic tests are the baseline for trustworthy verdicts.

## Evidence
- Failure: `backend/tests/bybit.test.ts` fetchBars, 5s timeout against real Bybit public API.
- Files untouched by the SSoT change (git diff empty) — pre-existing, not a regression.
