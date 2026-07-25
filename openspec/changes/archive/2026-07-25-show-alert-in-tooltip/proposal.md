## Why

The alert system fires alerts on specific bars, but there is no visual feedback on the chart when hovering over a bar that has an alert attached. Users must cross-reference external alert logs to know which bars triggered alerts. Showing alert details (title, message) directly in the bar tooltip closes this feedback loop and brings the experience in line with TradingView's alert-on-chart behavior.

## What Changes

- **Crosshair tooltip enhancement**: The hover tooltip (OHLC, volume, plot values) gains a new section that lists alert details for the hovered bar — alert title, message, and destination.
- **Alert data plumbing**: `AlertTriggerData` is enriched with optional `title`, `message`, and `destination` fields so the tooltip renderer can display them without needing a separate lookup.
- **Canvas rendering**: The `CrosshairRenderer.renderTooltip()` method appends alert lines below the plot values when the bar has one or more alerts.
- **No new backend endpoints** — all alert data already exists in `ScriptResult.alertTriggers`; only the frontend rendering layer changes.

## Capabilities

### New Capabilities

- `alert-tooltip-display`: Visual display of alert trigger details (title, message, destination) inside the chart's bar hover tooltip. Covers: how alert data reaches the renderer, how the tooltip formats and shows it, and how the user perceives it (non-interactive read-only display).

### Modified Capabilities

- `canvas-charting-library`: The existing "Grid and Crosshair" requirement gains a scenario that alert-triggered bars show their alert details in the tooltip.
- `alert-system`: Adds a requirement that `AlertTriggerData` must carry display-relevant fields (title, message) alongside existing bar index / timestamp.

## Impact

- **`frontend/src/chart/types.ts`**: `AlertTriggerData` interface gains optional `title`, `message`, `destination` fields.
- **`frontend/src/types/index.ts`**: Mirror the same `AlertTriggerData` type enrichment (shared type).
- **`frontend/src/chart/renderers/CrosshairRenderer.ts`**: `renderTooltip()` receives alert data and renders it.
- **`frontend/src/chart/PineChart.ts`**: Passes `alertTriggers` to the crosshair renderer during the render loop.
- **`frontend/src/components/ChartComponent.tsx`**: No change needed — `alertTriggers` are already passed via `ScriptResult`.
- **`src/strategy/alert-system.ts`**: `AlertTriggerData` construction includes the optional display fields from `AlertCondition`.
