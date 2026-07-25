## Why

The test suite has accumulated 82 test files (~26,296 lines), but 8 of those files contain tests that **cannot detect any regression** — they either have zero assertions (`expect()` calls) or use `expect(true).toBe(true)`. These aren't tests; they're console-log dumps dressed as tests. Additionally, there's significant structural duplication: copy-paste boilerplate repeated across ~10 indicator integration tests, and overlapping test files that test the same strategy with ~70% redundancy.

Wasting CI cycles and developer attention on tests that can't fail is worse than having no tests — it trains everyone to ignore the test suite. Removing them tightens feedback, reduces maintenance burden, and makes test failures meaningful.

## What Changes

**Remove 9 test files entirely** that have zero regression value:

| File | Lines | Problem |
|------|-------|---------|
| `tests/q-trend-frontend-full-debug.test.ts` | 133 | `expect(true).toBe(true)` — can never fail |
| `tests/integration/q-trend-ast-dump.test.ts` | 64 | 0 expect calls, console.log dump |
| `tests/integration/q-trend-change-trace.test.ts` | 102 | 0 expect calls, console.log dump |
| `tests/integration/q-trend-debug-trace.test.ts` | 108 | 0 expect calls, console.log dump |
| `tests/integration/q-trend-solusdt-5m-dump.test.ts` | 106 | 0 expect calls, console.log dump |
| `tests/integration/line-debug2.test.ts` | 131 | 0 expect calls, console.log dump |
| `tests/integration/hhll-debug-labels.test.ts` | 173 | 0 expect calls, console.log dump |
| `tests/integration/debug-res.test.ts` | 148 | 0 expect calls, console.log dump |
| `tests/evil/backend-api.test.ts` | 101 | Tests inline regex, not real backend code |

**Remove 11 tautological assertions** from `tests/integration/fill-color-data.test.ts` — the Level 2–7 tests that were replaced with `expect(true).toBe(true)` and a comment.

**Remove 3 supertrend debug/diagnostic files** that are either fully covered by the main test or have only 1 assertion:

| File | Lines | Assertions | Verdict |
|------|-------|-----------|---------|
| `tests/integration/supertrend-debug.test.ts` | 144 | 2 (both `result.success`) | Remove |
| `tests/integration/supertrend-debug3.test.ts` | 189 | 1 (`result.success`) | Remove |
| `tests/integration/supertrend-diagnostic.test.ts` | 102 | 2 | Remove (covered by main test) |

**Rename** `tests/integration/supertrend-debug2.test.ts` → `supertrend-kmeans.test.ts` — it has real assertions but a misleading "debug" name.

**Merge** `simple-ema-cross-strategy.test.ts` and `ema-cross-strategy-alignment.test.ts` — ~70% overlap, same EMA cross strategy. Keep the more thorough one (simple-ema-cross) and fold unique assertions from alignment into it.

**Add or remove** `tests/integration/backbone-rightmost-labels.test.ts` — 389 lines with 1 assertion. Either add real assertions or remove it.

**Non-goals:** This change does NOT refactor the formulaic indicator test boilerplate into shared helpers (that's a separate improvement). Does NOT rewrite any production code. Does NOT change test framework or runner config.

## Capabilities

This is a cleanup change — it removes and consolidates existing tests without introducing new capabilities. No new specs needed.

## Impact

- **Removed**: ~2,000 lines of test code (net, after merge adds)
- **Test suite size reduction**: ~7.5%
- **Faster CI**: ~180 seconds saved per run (these files load real data from Bybit API with 120s timeouts)
- **Developer trust**: Every remaining test has at least one meaningful assertion
- No production code affected

## Non-goals

- Extracting shared test helpers for indicator boilerplate (separate task)
- Changing test runner, config, or CI pipeline
- Refactoring tests that have real assertions but ugly code
- Adding new tests to fill gaps
