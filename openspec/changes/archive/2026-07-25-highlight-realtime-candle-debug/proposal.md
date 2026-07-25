## Why

Debug mode currently shows chunk-border markers on the chart, but it doesn't visually indicate which candle is the live real-time (forming) candle. Without this, it's hard to tell at a glance whether WS updates are reaching the right bar, or whether the last bar on screen is stale data or a live tick.

## What Changes

- When `debugMode` is enabled, the last candle in the dataset (the forming/real-time candle) is rendered with a blue highlight — blue body, blue wick, blue border
- The highlight updates on every re-render to always point at `candles[candles.length - 1]`
- Existing chunk-border overlay is unchanged; the blue candle highlight is an additional visual cue

## Capabilities

### New Capabilities
- `realtime-candle-highlight`: Highlight the forming real-time candle in blue when debug mode is active on the canvas chart

### Modified Capabilities
- *(none — no spec-level requirement changes)*

## Impact

- `frontend/src/chart/PineChart.ts` — add `realTimeCandleIndex` field and setter; modify `render()` to apply a blue `CandleColorData` override at that index when `debugMode` is true
- `frontend/src/chart/types.ts` — no changes needed (reuses existing `CandleColorData` interface)
- `frontend/src/components/ChartComponent.tsx` — pass `debugMode` into the chart's real-time candle highlight; remove the chunk-border reset that clears on `!debugMode`
- `frontend/src/hooks/useChartData.ts` — no changes needed (the chart already knows `candles.length - 1`)
