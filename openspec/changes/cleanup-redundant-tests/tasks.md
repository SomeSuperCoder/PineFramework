## 1. Remove files with zero meaningful assertions

- [x] 1.1 `git rm tests/q-trend-frontend-full-debug.test.ts` — `expect(true).toBe(true)` tautology
- [x] 1.2 `git rm tests/integration/q-trend-ast-dump.test.ts` — 0 expect calls, console.log dump
- [x] 1.3 `git rm tests/integration/q-trend-change-trace.test.ts` — 0 expect calls
- [x] 1.4 `git rm tests/integration/q-trend-debug-trace.test.ts` — 0 expect calls
- [x] 1.5 `git rm tests/integration/q-trend-solusdt-5m-dump.test.ts` — 0 expect calls
- [x] 1.6 `git rm tests/integration/line-debug2.test.ts` — 0 expect calls
- [x] 1.7 `git rm tests/integration/hhll-debug-labels.test.ts` — 0 expect calls
- [x] 1.8 `git rm tests/integration/debug-res.test.ts` — 0 expect calls
- [x] 1.9 `git rm tests/evil/backend-api.test.ts` — tests inline regex, not real code

## 2. Remove tautological assertions from fill-color-data.test.ts

- [x] 2.1 Remove 11 `expect(true).toBe(true)` stubs (Levels 2–7 describe blocks) from `tests/integration/fill-color-data.test.ts` — keep Levels 1 tests which have real assertions
- [x] 2.2 Verify remaining tests pass with `pnpm test -- tests/integration/fill-color-data.test.ts`

## 3. Remove supertrend debug/diagnostic files

- [x] 3.1 `git rm tests/integration/supertrend-debug.test.ts` — only 2 assertions, both `result.success`
- [x] 3.2 `git rm tests/integration/supertrend-debug3.test.ts` — only 1 assertion (covered by main test)
- [x] 3.3 `git rm tests/integration/supertrend-diagnostic.test.ts` — covered by `supertrend-ai-clustering.test.ts`

## 4. Rename supertrend-debug2 to supertrend-kmeans

- [x] 4.1 `git mv tests/integration/supertrend-debug2.test.ts tests/integration/supertrend-kmeans.test.ts`
- [x] 4.2 Update any imports or references (search for `supertrend-debug2` in project)
- [x] 4.3 Verify `pnpm test -- tests/integration/supertrend-kmeans.test.ts` passes

## 5. Merge ema-cross-strategy-alignment into simple-ema-cross-strategy

- [x] 5.1 Identify unique assertions in `ema-cross-strategy-alignment.test.ts` (label/entry alignment) not already in `simple-ema-cross-strategy.test.ts`
- [x] 5.2 Fold those assertions into `simple-ema-cross-strategy.test.ts` as additional test cases
- [x] 5.3 `git rm tests/integration/ema-cross-strategy-alignment.test.ts`
- [x] 5.4 Verify `pnpm test -- tests/integration/simple-ema-cross-strategy.test.ts` passes

## 6. Fix backbone-rightmost-labels

- [x] 6.1 Audit `tests/integration/backbone-rightmost-labels.test.ts` and decide: add real assertions or remove
- [x] 6.2 If keeping: add assertions for line positions, label counts, and S/R backbone detection (minimum +3 assertions)
- [x] 6.3 If removing: `git rm tests/integration/backbone-rightmost-labels.test.ts`

## 7. Final verification

- [x] 7.1 Run full test suite: `pnpm test` — 88 files, 1609 tests, all pass
- [x] 7.2 Verify no remaining references to removed files (grep for filenames) — fixed one doc reference
- [x] 7.3 Commit all changes
