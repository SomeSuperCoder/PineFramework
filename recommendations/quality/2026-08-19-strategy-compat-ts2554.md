# Pre-existing TS2554 errors break global typecheck
**Date:** 2026-08-19
**Source:** Backend Engineer (reported during log-rename microtask)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Fix the TS2554 errors in tests/quality/strategy-compat.test.ts (lines 193, 218, 235, 263) — argument-count mismatches in the test's calls. They make global `pnpm typecheck` fail and mask genuine type errors in unrelated changes.

## Rationale
The errors are pre-existing (unrelated to the 2026-08-19 log-event rename — they're signature mismatches, not log strings). Any future change that needs `typecheck:all` as its gate sees a red wall that has nothing to do with the change, forcing engineers to either work around it or burn time triaging. Fixing the test file restores typecheck as a trustworthy gate.

## Evidence
- tests/quality/strategy-compat.test.ts:193, 218, 235, 263 — TS2554 (expected N arguments, got M)
- Reproduced during `pnpm typecheck:all` on commit 0072017's follow-up (2026-08-19)
