# ExecutionEngine.setWarningSink call consistency
**Date:** 2026-08-15
**Source:** Test Engineer (vitest-mock-fix wave, green-gates-v1)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Make the `setWarningSink` call in `src/language/runtime/execution-engine.ts:563` consistent with the safe pattern at `:422` — i.e. use optional chaining (`this.strategyEngine?.setWarningSink(this.onWarning)`).

## Rationale
`initializeStrategy` (execution-engine.ts:560-563) calls `this.strategyEngine.setWarningSink(this.onWarning)` non-optionally, while the separate `setWarningSink` method at `:422` uses `this.strategyEngine?.setWarningSink(sink)`. The non-optional call is safe today because `initializeStrategy` always constructs a `StrategyEngine` first, but the inconsistency is a footgun: any future path that skips construction (or injects a mock without the method) throws a `TypeError` instead of degrading gracefully — exactly the failure that surfaced as 18 test failures (stale mocks lacking `setWarningSink`).

## Evidence
- `src/language/runtime/execution-engine.ts:563` — `this.strategyEngine.setWarningSink(this.onWarning)` (non-optional)
- `src/language/runtime/execution-engine.ts:422` — `this.strategyEngine?.setWarningSink(sink)` (optional)
- Root cause of green-gates-v1: `TypeError: this.strategyEngine.setWarningSink is not a function` at `:563:27`
