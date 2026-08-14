# Fix outdated mocks missing `setWarningSink` in bot-engine tests
**Date:** 2026-08-14
**Source:** test-engineer (tests-gold-removal.json) — full-suite run surfaced pre-existing failures
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
`bot-engine.test.ts` and `live-strategy-executor.test.ts` fail with `TypeError: this.strategyEngine.setWarningSink is not a function` at `execution-engine.ts:563` — 18 failures total. The mocks for `StrategyEngine` don't implement `setWarningSink`, which the real engine now calls. Triaged as **OUTDATED TEST**: add `setWarningSink: vi.fn()` to the mock, keep assertions otherwise unchanged.

## Rationale
Pre-existing and unrelated to the SSOT gold-pair change, but these 18 failures mask real regressions in the strategy-executor path — every future full-suite run will drown real failures in this noise.

## Evidence
- `backend/tests/bot-engine.test.ts`, `backend/tests/live-strategy-executor.test.ts` — 18 failing tests
- `backend/src/execution-engine.ts:563` — `this.strategyEngine.setWarningSink(...)` call
- Test Engineer triage: OUTDATED TEST (mocks missing method), not a production defect
