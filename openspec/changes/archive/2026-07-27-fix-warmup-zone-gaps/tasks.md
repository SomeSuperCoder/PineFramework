## 1. Null-safe plot data merge in prependIndicatorResult

- [x] 1.1 Modify the plot data merge in `prependIndicatorResult()` to use null-safe `map` in the overlap region — only overwrite prev entries where newResult has non-null values (Spec: `warmup-aware-merge`, Requirement: "Plot data merge preserves prev values on warmup nulls"; Design: Decision 1)
- [x] 1.2 Apply the same null-safe pattern to `plotColors` merge section (Spec: `warmup-aware-merge`, Requirement: "plotColors merge preserves prev colors on warmup nulls"; Design: Decision 2)
- [x] 1.3 Apply the same null-safe pattern to `fillColorData` merge section (Spec: `warmup-aware-merge`, Requirement: "fillColorData merge preserves prev colors on warmup nulls"; Design: Decision 2)

**Files:** `frontend/src/hooks/indicator-merge.ts`
**Verify:** Run existing `indicator-merge.test.ts` tests — confirm no regressions.

## 2. Unit tests for warmup-aware merge

- [x] 2.1 Add test case: warmup null in overlap keeps prev non-null value (Spec: `warmup-aware-merge`, Scenario: "Warmup null in overlap keeps prev value")
- [x] 2.2 Add test case: warmup null where prev also null keeps null (Spec: `warmup-aware-merge`, Scenario: "Warmup null where prev also null keeps null")
- [x] 2.3 Add test case: non-null new data replaces prev data unconditionally (Spec: `warmup-aware-merge`, Scenario: "Non-null new data replaces prev data")
- [x] 2.4 Add test case: healing — after multiple prepends, when context suffices, warmup holes are filled with computed values (Spec: `warmup-aware-merge`, Scenario: "Healing as context accumulates")
- [x] 2.5 Add test case: warmup null in plotColors keeps prev color (Spec: `warmup-aware-merge`, Scenario: "Warmup null in plotColors keeps prev color")
- [x] 2.6 Add test case: warmup null in fillColorData keeps prev color (Spec: `warmup-aware-merge`, Scenario: "Warmup null in fillColorData keeps prev color")

**Files:** `frontend/src/__tests__/indicator-merge.test.ts`

## 3. Integration test: chunk border warmup with insufficient context

- [x] 3.1 Create an integration test that simulates the scroll-back scenario: execute an indicator with `maxLookback=1000` on a small dataset (200 bars → 1000 needed), verify merged result preserves prev values across warmup nulls (Spec: `scroll-re-execution`, Scenario: "Insufficient context bars produce warmup nulls")

**File:** `tests/integration/warmup-zone-merge.test.ts` (new)

## 4. Visual verification

- [ ] 4.1 Load an indicator with high lookback (e.g., zero-lag-signals-for-loop, ta.highest-based), scroll left through multiple chunks, verify no persistent NA gaps at chunk borders
- [ ] 4.2 Verify plotColors don't have orphaned rendering at chunk borders
- [ ] 4.3 Verify that gaps heal after enough chunks have loaded (context accumulates past maxLookback)
