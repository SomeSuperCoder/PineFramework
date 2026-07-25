## Why

Strategy entries and exits are currently displayed as static arrows on the chart with only a short label (the entry/exit name). Users who hover over a bar have no way to see the full details of a strategy action — direction, quantity, price, or the comment/description they wrote in their Pine Script `strategy.entry()` / `strategy.exit()` calls. This forces cross-referencing with the trade list or logs to understand what happened on a specific bar.

Alerts already have on-hover tooltip descriptions (from the `show-alert-in-tooltip` change). Strategy markers should have the same treatment — showing entry/exit details (name, direction, quantity, price, comment) in the bar tooltip on hover. This closes the same feedback loop for strategy actions that was already closed for alerts.

## What Changes

- **Crosshair tooltip enhancement**: The hover tooltip gains a new section that lists strategy markers (entries/exits/orders/closes) for the hovered bar — marker name, direction, quantity, price, and comment (the description).
- **StrategyMarkerData enrichment**: The frontend chart type `StrategyMarkerData` gains `action`, `quantity`, and `price` fields (already present in the backend `StrategyMarker` and the shared `frontend/src/types/index.ts` type, but missing from `frontend/src/chart/types.ts`).
- **Canvas rendering**: The `CrosshairRenderer.renderTooltip()` method appends strategy marker lines between the OHLC values and alert data (if any), or after alerts and before plot data.
- **Data plumbing**: `PineChart.render()` passes `this.strategyMarkers` to the crosshair renderer — no new backend or component data paths needed.

## Capabilities

### New Capabilities

- `strategy-marker-tooltip`: Visual display of strategy marker details (type, name, direction, quantity, price, comment) inside the chart's bar hover tooltip. Covers: how marker data reaches the renderer, how the tooltip formats and shows it, and how the user perceives it (non-interactive read-only display).

### Modified Capabilities

- `canvas-charting-library`: The "Grid and Crosshair" scenario gains a sub-scenario that bars with strategy actions show their marker details in the tooltip.
- `strategy-execution`: Adds a requirement that strategy markers carry display-relevant fields (action, quantity, price) alongside existing name and comment.

## Impact

- **`frontend/src/chart/types.ts`**: `StrategyMarkerData` interface gains optional `action`, `quantity`, `price` fields (mirroring `frontend/src/types/index.ts`).
- **`frontend/src/chart/renderers/CrosshairRenderer.ts`**: `render()` receives `strategyMarkers` parameter; `renderTooltip()` renders marker details in the tooltip.
- **`frontend/src/chart/PineChart.ts`**: Passes `this.strategyMarkers` to the crosshair renderer during the render loop (already stored, already set by `setStrategyMarkers()`).
- **No new backend endpoints** — all marker data already flows through `ScriptResult.strategyMarkers`.
