## 1. Enrich StrategyMarkerData type in frontend chart types

- [x] 1.1 Add optional `action`, `quantity`, `price` fields to `StrategyMarkerData` in `frontend/src/chart/types.ts` (matching the existing type in `frontend/src/types/index.ts`)
- [x] 1.2 Verify `frontend/src/types/index.ts` already has these fields (it does — confirm no change needed there)
- [x] 1.3 Run TypeScript check to confirm no existing code breaks from the added fields (`cd frontend && pnpm run typecheck` or `tsc --noEmit`)

## 2. Update CrosshairRenderer to render strategy marker details

- [x] 2.1 Add a `StrategyMarkerData[]` parameter to `CrosshairRenderer.render()` (with default `[]`) and thread it to `renderTooltip()`
- [x] 2.2 In `renderTooltip()`, filter markers by `barIndex` matching the hovered candle index
- [x] 2.3 Build marker display lines per marker type:
      - Entry: `"▲ <name>"` with direction, qty, price on second line
      - Exit: `"▼ <name>"` with qty, price, `fromEntry` info on second line
      - Close: `"✕ <name>"` with qty and price
      - Order: `"◇ <name>"` with direction, qty, price
      - Cancel: `"— <name>"` (canceled order)
- [x] 2.4 If marker has a `comment`, show it as an indented description line below the marker title
- [x] 2.5 Apply per-type color styling to marker lines:
      - Entry (long): `#4caf50` (green)
      - Entry (short): `#e91e63` (pink)
      - Exit: `#ff9800` (orange)
      - Close: `#f44336` (red)
      - Order: `#ffeb3b` (yellow)
      - Cancel: `#999999` (gray)
- [x] 2.6 Insert marker section between OHLC lines and alert lines (markers first, then alerts, then plots)
- [x] 2.7 Cap displayed markers at 5 and render `"+N more"` summary line if capped
- [x] 2.8 Ensure markers without the new optional fields still render cleanly (omit unavailable data silently)

## 3. Wire marker data from PineChart to render loop

- [x] 3.1 In `PineChart.ts`, pass `this.strategyMarkers` to `this.crosshairRenderer.render()` call in the render loop (the data is already stored via `setStrategyMarkers()` — just thread it through)
- [x] 3.2 Ensure `strategyMarkers` data flows through `ChartComponent` → `PineChart.setStrategyMarkers()` (verify existing data path — should already work)

## 4. Tests

- [x] 4.1 Write unit test for `CrosshairRenderer.renderTooltip()` with zero markers on bar — verify no marker section rendered
- [x] 4.2 Write unit test with one entry marker — verify name, direction, quantity, price appear
- [x] 4.3 Write unit test with one exit marker + comment — verify comment shown as description line
- [x] 4.4 Write unit test with entry and exit on same bar — verify both rendered in order
- [x] 4.5 Write unit test with markers exceeding the cap — verify "+N more" summary line
- [x] 4.6 Write unit test for backward compatibility: `StrategyMarkerData` without `action`/`quantity`/`price` fields — verify no crash, fields omitted gracefully

## 5. Integration verification

- [x] 5.1 Build the frontend and verify no TypeScript errors (`cd frontend && pnpm run build`)
- [x] 5.2 Run existing test suite to confirm no regressions (`pnpm test`)
- [ ] 5.3 Manual smoke test: load a strategy script with entries and exits (e.g., a simple SMA crossover), hover over bars with markers, confirm marker details appear in tooltip with correct styling
