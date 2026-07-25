## Context

The chart already has a `debugMode` boolean (PineChart.ts:82) toggled from the app toolbar. When active, it renders chunk-border markers (vertical orange dashed lines). There is no visual indicator for which candle is the current real-time (forming) candle — the last bar in `candles[]` that receives WS updates.

The `candleColors: Map<number, CandleColorData>` system already exists at PineChart.ts:75 and is consumed by `CandlestickRenderer.render()` to override per-bar body/wick/border colors. No new rendering primitives are needed.

## Goals / Non-Goals

**Goals:**
- When `debugMode` is true, render the last candle in `candles[]` with a blue color override (body, wick, border)
- The highlight updates automatically on every render cycle as `candles[]` grows

**Non-Goals:**
- No new UI controls (reuses existing debug toggle)
- No backend changes
- No changes to the candlestick renderer
- No changes to the `CandleColorData` type

## Decisions

- **Reuse `candleColors` Map rather than a new field**: The candlestick renderer already reads `candleColors.get(i)` and falls back to bull/bear defaults. Setting one entry per render is simpler and zero-risk vs. threading a new parameter.

- **Index-based, not time-based**: The forming candle is always `candles[candles.length - 1]`. Using the array index avoids time-matching edge cases and is O(1).

- **Blue color `#2196f3`**: Material blue 500 — distinct from bull (green) and bear (red), high contrast against the dark background, and visually different from chunk-border orange.

## Risks / Trade-offs

- **Highlight on every bar if candles becomes length-1**: When there's only 1 candle, the blue highlight makes it look like the sole bar is "forming". Acceptable — it's a debug feature.
- **No distinction between forming-candle tick and confirmed bar**: The last candle is always highlighted regardless of whether it's still being ticked or just confirmed. Acceptable — debug mode is for visibility, not accuracy.
