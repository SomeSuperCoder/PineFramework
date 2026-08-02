## 1. Chart Engine Configuration Flags

- [x] 1.1 Add `interactive`, `showGrid`, and `showAxisLabels` optional boolean fields to `ChartOptions` interface in `frontend/src/chart/types.ts` (default `true` for backward compatibility)
- [x] 1.2 Update `DEFAULT_OPTIONS` in `types.ts` to include the new flags with `true` defaults
- [x] 1.3 In `PineChart.ts` constructor, gate `InteractionHandler` instantiation on `options.interactive` — skip mouse/touch/scroll event binding when `false`
- [x] 1.4 In `PineChart.render()`, skip `GridRenderer` calls when `options.showGrid` is `false`
- [x] 1.5 In `PineChart.render()`, skip `AxisRenderer` calls (both price and time) when `options.showAxisLabels` is `false`
- [x] 1.6 Verify full chart (`ChartComponent`) still works unchanged with default options — run existing tests

## 2. MiniChart Component

- [x] 2.1 Create `frontend/src/components/MiniChart.tsx` as a `forwardRef` React component accepting `data: CandlestickData[]`, `scriptResult: ScriptResult | null`, `dataVersion: number`, `height?: number` props
- [x] 2.2 In `MiniChart` useEffect, instantiate `PineChart` with `{ interactive: false, showGrid: false, showAxisLabels: false, barSpacing: 6, priceScaleWidth: 0, timeScaleHeight: 0 }` plus compact styling
- [x] 2.3 Implement data bridging in `MiniChart`: on `dataVersion` change, call `chart.beginUpdate()`, `chart.setCandles()`, iterate `scriptResult.plots` to call `chart.addPlotSeries()` + `chart.setPlotData()`, then `chart.endUpdate()` — reuse the same iteration logic from `ChartComponent` lines 259–520
- [x] 2.4 Auto-fit viewport on every data update — call `chart.fitContent()` or equivalent to always show full visible range without user interaction
- [x] 2.5 Handle canvas cleanup on unmount (`chart.remove()` or equivalent)
- [x] 2.6 Export `MiniChart` from component barrel if one exists

## 3. useMiniChartData Hook

- [x] 3.1 Create `frontend/src/hooks/useMiniChartData.ts` hook that accepts `candles: CandlestickData[]`, `scriptResult: ScriptResult | null`, `dataVersion: number`, `displayCount?: number` (default 12)
- [x] 3.2 Implement display-range slicing: take the last `displayCount` candles from the input array for rendering
- [x] 3.3 Slice `ScriptResult` plot data to match the display range — filter each plot's data points to only those within the visible candle time range
- [x] 3.4 Return `{ displayCandles, displayScriptResult, dataVersion }` for the MiniChart component
- [x] 3.5 Ensure the hook does NOT re-fetch or re-execute — it purely slices the already-computed data from the bot's WebSocket stream

## 4. LiveDashboard Integration

- [x] 4.1 In `TradingBotPanel.tsx` `LiveDashboard`, import `MiniChart` and `useMiniChartData`
- [x] 4.2 Add mini chart state: the hook needs the bot's candles and scriptResult — wire these from the existing bot WebSocket data (candles from `useChartData` or bot snapshot, scriptResult from bot execution)
- [x] 4.3 Insert `<MiniChart>` into the center column of the running-state layout, above the metrics grid, in a container with `height: 180px` and `borderBottom: '1px solid #1a1a2e'`
- [x] 4.4 Conditionally render the mini chart only when `isRunning` or `isError` or `transitioning` — not in Idle/Stopped state
- [x] 4.5 Style the mini chart container to match the dashboard's dark theme (background `#0d0d18`, no external border except bottom separator)

## 5. Visual Polish & Testing

- [x] 5.1 Test mini chart renders candles correctly at compact size (180px height, ~600px width) — verify no text overlap, proper candle spacing
- [x] 5.2 Test mini chart renders indicator lines, fills, and shapes with correct colors and styles
- [x] 5.3 Test real-time updates: verify forming candle updates and new confirmed candles shift the display window
- [x] 5.4 Test that interaction is disabled: hover, scroll, and drag produce no response on the mini chart
- [x] 5.5 Verify the full chart (`ChartComponent`) regression — no visual or behavioral changes
- [x] 5.6 Run `pnpm run lint` and `pnpm run typecheck` in the frontend package — fix any issues
