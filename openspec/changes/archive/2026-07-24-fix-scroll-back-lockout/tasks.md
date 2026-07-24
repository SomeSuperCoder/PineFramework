## 1. Implementation

- [x] 1.1 Remove `hasMoreHistoryRef` declaration (line 27) from `useChartData`
- [x] 1.2 Remove `hasMoreHistoryRef` gate at line 78 and all 3 assignments at lines 82, 92, 96 — keep the early-returns but without setting the ref
- [x] 1.3 Verify `!oldest || !oldest.timestamp` returns 0 without setting any ref (no-op early return)
- [x] 1.4 Verify empty data block returns 0 without setting any ref (no-op early return) — this is the final guard
- [x] 1.5 Remove `hasMoreHistoryRef` from test file if referenced
- [x] 1.6 Run all unit tests (`pnpm -F pine-framework-frontend test`) and e2e test to confirm no regressions

## 2. Verification

- [x] 2.1 Confirm `isLoadingHistoryRef` is the sole rate-limiter remaining (prevents concurrent scroll-back requests)
- [x] 2.2 Confirm the final code has exactly 0 remaining references to `hasMoreHistoryRef`
- [x] 2.3 Commit the change
