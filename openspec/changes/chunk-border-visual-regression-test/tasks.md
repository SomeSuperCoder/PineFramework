## 1. Debug Data Exposure

- [x] 1.1 Add `plotNullCounts` and `boundaryNullDensities` fields to the indicator result data structure in `ChartComponent.tsx` (within the `allResults` loop that populates `__pineTestData`)

**Spec:** `chunk-border-visual-regression` — "Diagnostic data exposure for visual regression"

For each indicator result, compute:
- `plotNullCounts`: `Record<string, number>` — for each plot title, count entries where `value === null`
- `boundaryNullDensities`: for each chunk border, count nulls in the 50-bar window around it

- [x] 1.2 Verify `__pineTestData` exposes the new fields by checking in the existing `chunk-boundary.spec.ts` test (add a quick assertion that `plotNullCounts` is defined)

## 2. Visual Regression Test

- [x] 2.1 Create `frontend/e2e/chunk-border-visual-regression.spec.ts` with the test scaffold: seed data interception, route handlers, debug mode enablement (reuse patterns from `chunk-boundary.spec.ts`)

- [x] 2.2 Implement the zero-lag-signals-for-loop indicator test: load indicator via API, scroll back through 3+ chunks, assert that `boundaryNullDensities` for each border does not exceed 2x the baseline null density

**Spec:** `chunk-border-visual-regression` — "Zero-lag-signals indicator survives scroll-back"

- [x] 2.3 Implement the kalman-trend-levels indicator test: same scroll-back pattern, assert boundary null density

**Spec:** `chunk-border-visual-regression` — "Kalman-trend-levels indicator survives scroll-back"

- [x] 2.4 Add a general fill-gap assertion: for any indicator with fillColorData, verify no more than 2 consecutive null entries at any chunk border position

**Spec:** `chunk-border-visual-regression` — "Fill regions span chunk boundaries"

## 3. Verification

- [x] 3.1 Run the test locally with the dev server to confirm it passes with current fixes
- [x] 3.2 Verify the test fails when the warmup-null-overwrite fix is reverted (to confirm the test catches the regression)
