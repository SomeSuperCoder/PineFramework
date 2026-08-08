# [backend/tests not covered by any tsconfig typecheck gate]
**Date:** 2026-08-08
**Source:** Test Engineer (type-import fix wave)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
The root tsconfig (include src/** + tests/**) excludes backend/, and backend/tsconfig.json excludes **/*.test.ts — so backend/tests were never typechecked by any gate. The 3 stale type-imports were only caught by a scoped tsc pass. Add a backend test tsconfig (or include backend/tests in an existing project) so tsc covers backend/tests, closing the type-gap.

## Rationale
Stale type imports in backend tests can silently survive the regular gate and are only found when something else breaks.

## Evidence
Root tsconfig.json:23 (include), backend/tsconfig.json (excludes test), TE spawn handoff 2026-08-08.