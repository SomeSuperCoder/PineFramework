# Engine-fix minor follow-ups (Code Reviewer)
**Date:** 2026-08-19
**Source:** code-reviewer (engine-fix review, B4)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr) each

## 1. parseInt leniency in --max-bars parse
**Recommendation:** consider stricter validation than bare parseInt for `--max-bars` (e.g., reject "12abc" style input) in `backend/src/cli/backtest-cli.ts`.

## 2. Property-read of function members
**Recommendation:** consider whether reading `timeframe.in_seconds` as a property (without calling) should return NA or the function — currently it returns NA via the thunk path; confirm the desired Pine-compatible behavior.
