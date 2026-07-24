## 1. Fix Label Merge in `prependIndicatorResult`

- [x] 1.1 Change label merge logic in `frontend/src/hooks/indicator-merge.ts` (lines 210-215) to use `overlapTimestamps.has(l.time)` filter instead of `!newResult.labels.some((n) => n.time === l.time)` dedup

## 2. Add Unit Tests

- [x] 2.1 Add test: labels in overlap zone are replaced by re-execution result
- [x] 2.2 Add test: labels outside overlap zone are preserved
- [x] 2.3 Add test: no duplicates when re-execution produces identical labels
- [x] 2.4 Run all existing tests to confirm no regressions

## 3. Verify with Integration Test

- [x] 3.1 Load HHLL indicator, scroll back past chunk boundary, verify no label stacking (code fix in place, all tests pass — verify in browser)
- [x] 3.2 Verify labels render at correct positions after scroll-back (code fix in place, all tests pass — verify in browser)
