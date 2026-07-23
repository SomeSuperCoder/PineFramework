## 1. Expose Chunk Border Data from useChartData

- [ ] 1.1 Add `chunkBorders` state to `useChartData` — an array of `{barIndex: number, addedCount: number, timestamp: number}` objects, pushed on each successful `fetchOlderOHLCV`
- [ ] 1.2 Return `chunkBorders` from `useChartData` alongside `candles`, `fetchOlderOHLCV`, etc.

## 2. Add Debug State to App

- [ ] 2.1 Add `debugMode` state variable (boolean) to `App` component
- [ ] 2.2 Pass `debugMode` and `onToggleDebugMode` to `AppToolbar` and `ChartComponent`
- [ ] 2.3 Thread `chunkBorders` through `App` → `ChartComponent`

## 3. Add Debug Toggle Button to Footer Bar

- [ ] 3.1 Add `onToggleDebugMode` and `debugMode` props to `AppToolbarProps`
- [ ] 3.2 Add "Debug" button to the footer bar following existing button patterns
- [ ] 3.3 When `debugMode` is true, highlight button with amber/orange border (`#ff9800`)

## 4. Render Chunk Borders on Chart

- [ ] 4.1 Add `chunkBorders` field and `setChunkBorders` method to `PineChart`
- [ ] 4.2 Add `debugMode` field and `setDebugMode` method to `PineChart`
- [ ] 4.3 Implement `renderChunkBorders` method in `PineChart` that draws vertical dashed lines at border bar indices from top to bottom of the chart area, using cyan color at 50% opacity
- [ ] 4.4 Implement metadata label rendering at top of chart area for each border: "Chunk N: +X bars @ T"
- [ ] 4.5 Call `renderChunkBorders` from the main `render()` method when `debugMode` is true
- [ ] 4.6 In `ChartComponent`, call `chart.setChunkBorders(data)` and `chart.setDebugMode(debugMode)` on each update

## 5. Verify

- [ ] 5.1 Manual test: load chart, toggle debug mode — no borders visible (initial load)
- [ ] 5.2 Manual test: scroll back to load a chunk, verify vertical dashed line + label appears at the boundary
- [ ] 5.3 Manual test: scroll back multiple times, verify each chunk boundary is marked
- [ ] 5.4 Manual test: toggle debug mode off, verify borders disappear and chart behavior is unchanged
- [ ] 5.5 Run full test suite to verify no regressions
