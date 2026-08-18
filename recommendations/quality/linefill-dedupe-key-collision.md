# Linefill dedupe-by-(line1.x1,line2.x1) collision scenario untested
**Date:** 2026-08-18
**Source:** QA Engineer (fills-merge-acceptance)
**Priority:** low
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Add a unit test covering the case where two DISTINCT fills share the same (line1.x1, line2.x1) pair — confirm the intended behavior (dedupe keeps the newest, matching the fills/lines idiom).

## Rationale
The new dedupe key mirrors the established fills (from/to) and lines (points[0].time) idiom, so collision behavior is consistent with the codebase. But for supertrend-3d, line1.x1 === line2.x1 (both lines start at the fill's bar), so the key is effectively the bar timestamp. If a future indicator emits two genuinely distinct fills on the same x1 pair (e.g. multi-color fills on one segment), the second is silently dropped. The current test suite does not cover this scenario.

## Evidence
indicator-merge.ts:583-595 dedupe predicate; fills-vanish-linefills-merge.test.ts fixtures (makeLinefill sets line1.x1 === line2.x1 = seed)
