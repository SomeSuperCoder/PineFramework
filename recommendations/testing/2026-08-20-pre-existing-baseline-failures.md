# 18 pre-existing test failures + 12 typecheck errors on HEAD
**Date:** 2026-08-20
**Source:** Test Engineer (tests.json) — baseline verified 1:1 via git stash
**Priority:** medium
**Status:** pending
**Effort:** large (>4hr)

## Recommendation
Triage and fix the REMAINING pre-existing HEAD baseline failures (kalman-trend-levels is DONE — fixed by commit d55b1f6, "fix: restore ta.change bool overload", Aug 20):
- 2 failures: `disk-ohlcv-cache`
- 1 failure each: `forming-candle`, `realtime-execution`, `break-debug`
- 12 typecheck errors: `backtest-export` (5), `fee-root-cause` (1), `strategy-compat` (6)

## Rationale
These are NOT caused by the cancellation or kalman changes (verified 1:1 against a clean HEAD via git stash), but they make every future full-suite run report RED and obscure genuine regressions. The suite should be green on HEAD before it can gate releases.

## Evidence
- Test Engineer handoff: data/handoffs/team/quality/test-engineer/tests.json
- `git stash` baseline comparison: 18 failures identical on HEAD and after the change
