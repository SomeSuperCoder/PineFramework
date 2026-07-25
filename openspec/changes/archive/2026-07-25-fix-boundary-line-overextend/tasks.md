## 1. Unify extend:right fix logic in indicator-merge.ts

- [x] 1.1 Remove the `contextSize > 0` guard from the extend:right fix — unify into a single branch that handles both contextSize=0 and contextSize>0
- [x] 1.2 Add logic to find the earliest surviving prev line whose start time ≥ the newResult line's endpoint
- [x] 1.3 If contextSize=0 and a later prev line is found, modify the newResult line's last point timestamp to the prev line's start time and set extend:none
- [x] 1.4 If contextSize>0 and a later prev line is found, set extend:none without point modification (existing behavior)
- [x] 1.5 If no later prev line is found, keep extend:right unchanged for both contextSize=0 and contextSize>0

## 2. Update existing tests

- [x] 2.1 Update `should keep extend:right when contextSize is 0 (disjoint datasets)` test to expect the terminated behavior (extends to first prev line's start, not to infinity)
- [x] 2.2 Verify all existing extend:right fix tests still pass after the unified logic change

## 3. Add new tests for boundary line termination

- [x] 3.1 Add test: contextSize=0 with a later prev line — newResult line terminated at it (last point time updated)
- [x] 3.2 Add test: contextSize=0 with no later prev line — keep extend:right unchanged
- [x] 3.3 Add test: contextSize=0 with multiple later prev lines — terminates at earliest
- [x] 3.4 Add test: contextSize>0 with later prev line — existing behavior (extend:none, points unchanged)
- [x] 3.5 Add test: points array integrity — last point time updated, price preserved

## 4. Verify

- [x] 4.1 Run full test suite to confirm no regressions (114/114 pass)
- [x] 4.2 TypeScript compilation check (tsc --noEmit) — no new errors
