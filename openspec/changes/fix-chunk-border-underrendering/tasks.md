# Tasks: Fix Chunk Border Underrendering

## Task 1: Add highestBuffers/lowestBuffers to getMaxLookback()

- [x] Add highestBuffers/lowestBuffers iteration to getMaxLookback()

**Files:** `src/language/runtime/execution-engine.ts`

Add iteration over `highestBuffers` and `lowestBuffers` keys in `getMaxLookback()`, using the existing `parseMapLength()` helper.

**Verify:** Run existing tests to confirm no regressions.

---

## Task 2: Track runtime series lookback

- [x] Add runtimeSeriesLookback field to ExecutionEngine
- [x] Record lookback on series[i] access in expression executor
- [x] Include runtimeSeriesLookback in getMaxLookback()

**Files:**
- `src/language/runtime/execution-engine.ts`
- `src/language/runtime/expression-executor.ts`

**Verify:** Write a test that executes a script with for-loop series indexing and confirm getMaxLookback() returns the correct value.

---

## Task 3: Verify maxLookback propagation chain

- [x] Confirm interpreter sets maxLookback on ExecutionResult

**Files:** `src/language/runtime/interpreter.ts`

**Verify:** Add a test that executes a script and checks result.maxLookback > 0.

---

## Task 4: Write integration test

- [x] Write chunk-border-lookback integration test

**File:** `tests/integration/chunk-border-lookback.test.ts` (new)

Test that executing with sufficient context matches full-dataset execution for the overlapping region.

---

## Task 5: Visual verification

- [x] Manual visual testing

Load the indicator, scroll left, verify no persistent NA gaps.
