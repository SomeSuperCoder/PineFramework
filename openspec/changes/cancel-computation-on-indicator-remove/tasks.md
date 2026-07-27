## 1. Client-side: Generation counter for late HTTP result rejection

- [x] 1.1 Add `indicatorGenerationRef` (a `Map<string, number>`) to `useChartData` alongside `indicatorSourcesRef`
- [x] 1.2 In `executeScript`, capture `capturedGen = indicatorGenerationRef.current.get(indicatorId)` at the start of the call (before any `await`)
- [x] 1.3 After each `await` point in `executeScript` (lines ~753, ~834), compare `capturedGen` against the current `indicatorGenerationRef.current.get(indicatorId)` — if mismatched or undefined, return early (discard result)
- [x] 1.4 In `removeIndicatorData`, increment the generation: `indicatorGenerationRef.current.set(indicatorId, (indicatorGenerationRef.current.get(indicatorId) ?? 0) + 1)`

## 2. Client-side: Reorder handleRemoveIndicator for synchronous cleanup

- [x] 2.1 In `App.tsx` `handleRemoveIndicator`, reorder operations: send `stop_indicator` (fire-and-forget), then call `removeIndicatorData(indicatorId)` synchronously, then update React state (`setIndicatorResults`, `setComputingIndicators`), THEN `await indicatorManager.removeIndicator(indicatorId)`
- [x] 2.2 After state cleanup, call the chart ref's `removeSeries` for all plot series of the removed indicator (or increment `dataVersion` to trigger a full chart re-render)

## 3. Client-side: Chart data version bump on removal

- [x] 3.1 In `App.tsx` `handleRemoveIndicator`, call `setDataVersion(v => v + 1)` after removing from state, to ensure ChartComponent re-renders and cleans up orphaned plot series
- [x] 3.2 Verify that `ChartComponent`'s existing series cleanup logic (lines 343-347) correctly removes series not in `currentTitles`

## 4. Tests

- [x] 4.1 Write a unit test for the generation counter: simulate calling `executeScript` with an indicator, then removing it mid-flight, and verify the late result is discarded
- [x] 4.2 Write an integration test: add an indicator, start its computation, remove it before computation completes, verify no plot data remains
- [x] 4.3 Verify existing `useChartData` tests still pass after changes (10/13 pass, 3 pre-existing failures unchanged)
