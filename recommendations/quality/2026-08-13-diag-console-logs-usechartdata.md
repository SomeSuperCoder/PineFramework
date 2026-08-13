# Pre-existing [DIAG] console.logs in useChartData.ts
**Date:** 2026-08-13
**Source:** QA Engineer (error-console-crash-v1)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Remove the pre-existing `[DIAG]` console.logs at `frontend/src/hooks/useChartData.ts:160-162` (debug leftovers, not part of the error-console fix diff).

## Rationale
Debug console.logs in production code are noise and can leak execution detail to the browser console. They predate this fix.

## Evidence
QA Engineer noted during acceptance review of the error-console crash fix: "pre-existing `[DIAG]` console.logs at useChartData.ts:160-162 (not in diff)".
