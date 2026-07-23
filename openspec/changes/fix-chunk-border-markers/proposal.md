## Why

When scrolling back through historical data, the chart prepends new chunks of OHLCV data and re-executes indicators on a truncated dataset (new chunk + context/overlap bars). Elements (lines, shapes, labels, boxes, fills) that fall in the overlap zone between chunks can be silently dropped during merge — the re-execution on the partial dataset doesn't reproduce every element from the original full-dataset execution, and the merge logic filters out unreplaced overlap-zone elements. This causes visible artifacts: lines disappear from markers at chunk boundaries, shapes go missing, and filled areas break.

## What Changes

- Fix `prependIndicatorResult` in `indicator-merge.ts` so elements in the overlap zone that were NOT reproduced by the re-execution survive the merge instead of being dropped
- Adjust strategy marker `barIndex` values after prepend to account for the new bars added at the front
- Add overlapping-aware dedup that preserves unreplaced elements from the previous execution rather than discarding them
- Ensure lines, shapes, labels, boxes, fills, and bgcolor all behave consistently at chunk boundaries

## Capabilities

### New Capabilities

- `chunk-border-data-merge`: Rules for how each element type (lines, shapes, labels, boxes, fills, bgcolor, strategy markers) is merged at chunk boundaries during scroll-back prepend. Ensures unreplaced elements survive and bar indices are correctly adjusted.

## Impact

- `frontend/src/hooks/indicator-merge.ts` — core merge logic, the main file changed
- `frontend/src/hooks/chart-data-transform.ts` — may need to expose additional context (barIndex-to-time mapping)
- All indicators with draw at chunk boundaries will render correctly after fix
