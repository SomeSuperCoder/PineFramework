# BacktestResults.tsx: 17 pre-existing lint errors (prettier debt + no-explicit-any)
**Date:** 2026-08-10
**Source:** Frontend Engineer (chart swap handoff)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
`frontend/src/components/BacktestResults.tsx` has 17 pre-existing lint errors (proven identical on HEAD — prettier formatting debt + 2× `no-explicit-any` in the pre-existing sort code in StatCard/exportCSV/stat grid/trade table). The repo's lint baseline is RED on this file. A cleanup pass with `--fix` + explicit types would restore it.

## Rationale
RED lint baseline makes it impossible to distinguish new lint debt from old in future changes on this file, and the `any`s hide type unsafety in the sort/trade code.

## Evidence
- eslint on BacktestResults.tsx after swap: 0 errors in new code, 17 pre-existing (same errors on `git show HEAD` version)
- Locations: StatCard, sort, exportCSV, stat grid, trade table (off-limits during the chart swap)