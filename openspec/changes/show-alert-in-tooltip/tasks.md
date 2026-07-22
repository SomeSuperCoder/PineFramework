## 1. Enrich AlertTriggerData type

- [x] 1.1 Add optional `title`, `message`, `destination` fields to `AlertTriggerData` in `frontend/src/chart/types.ts`
- [x] 1.2 Add the same optional fields to `AlertTriggerData` in `frontend/src/types/index.ts` (mirror type)

## 2. Update CrosshairRenderer to render alert details

- [x] 2.1 Add an `alerts: AlertTriggerData[]` parameter to `CrosshairRenderer.render()` and thread it to `renderTooltip()`
- [x] 2.2 In `renderTooltip()`, filter alerts by `barIndex` matching the hovered candle index
- [x] 2.3 Build alert display lines: `"⚠ <title>"` and `"  <message> [destination]"` per alert
- [x] 2.4 Insert alert lines between the OHLC lines and the plot series lines in the tooltip
- [x] 2.5 Cap displayed alerts at 5 entries and render `"⚠ +N more"` summary line if capped
- [x] 2.6 Apply muted styling (color `#ffaa44` or similar warm alert color) to alert lines

## 3. Wire alert data from PineChart to render loop

- [x] 3.1 In `PineChart.ts`, pass `this.alertTriggers` to `this.crosshairRenderer.render()` call in the render loop
- [x] 3.2 Ensure alert data flows through `ChartComponent` → `PineChart.setAlertTriggers()` (verify existing data path — should already work)

## 4. Tests

- [x] 4.1 Write unit test for `CrosshairRenderer.renderTooltip()` with zero alerts on bar — verify no alert section rendered
- [x] 4.2 Write unit test with one alert — verify title and message appear in tooltip lines
- [x] 4.3 Write unit test with multiple alerts — verify all are listed up to the cap
- [x] 4.4 Write unit test with alerts exceeding the cap — verify "+N more" summary line
- [x] 4.5 Write unit test for backward compatibility: `AlertTriggerData` without `title`/`message` fields — verify no crash, no alert section rendered

## 5. Integration verification

- [x] 5.1 Build the frontend and verify no TypeScript errors (`pnpm -F pine-framework-frontend build`) — build has pre-existing tsc errors (unrelated to this change); no new errors introduced
- [x] 5.2 Run existing test suite to confirm no regressions (`pnpm test`) — all 5 new tests pass; 5 pre-existing test failures in BacktestSettingsPopup remain unchanged
- [ ] 5.3 Manual smoke test: load a script with alerts, hover over an alert-triggered bar, confirm alert details appear in tooltip
