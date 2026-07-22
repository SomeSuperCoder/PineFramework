## 1. Update ExecuteResponse interface

- [x] 1.1 Add `extend?: string` to the line type in the `ExecuteResponse` interface at `frontend/src/hooks/useChartData.ts`

## 2. Forward extend in buildScriptResult

- [x] 2.1 Add `extend: l.extend` to the line mapping in `buildScriptResult()` (~line 168 in `frontend/src/hooks/useChartData.ts`)

## 3. Forward extend in mergeDiffIntoResult

- [x] 3.1 Add `extend: l.extend` to the diff line mapping in `mergeDiffIntoResult()` (~line 594 in `frontend/src/hooks/useChartData.ts`)

## 4. Verify

- [x] 4.1 Run the HHLL integration tests to confirm no regressions
- [ ] 4.2 Manually verify that S/R lines render as rays in the chart (latest lines extend to the right edge, old lines stop at their capped bar) — requires running frontend
