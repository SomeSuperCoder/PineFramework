## 1. For-loop body recursion (already implemented)

- [x] 1.1 ForStatement handling already recurses into `stmt.body` — no changes needed
- [x] 1.2 For-loop bounds are NOT treated as lookback — correct behavior
- [x] 1.3 TA calls and `[]` indexing inside loops are detected via body recursion

## 2. Testing

- [x] 2.1 Unit test: for-loop bound is NOT used as lookback
- [x] 2.2 Unit test: TA calls inside for-loop bodies are detected
- [x] 2.3 Integration test: HHLL script compiles and executes correctly
- [x] 2.4 Run full test suite to verify no regressions
