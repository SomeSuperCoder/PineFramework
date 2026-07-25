## Context

The chart tooltip (`CrosshairRenderer.renderTooltip`) currently displays date/time, O/H/L/C, volume, alert details (from the `show-alert-in-tooltip` change), and up to five plot series values. Strategy markers are already stored on `PineChart.strategyMarkers` as `StrategyMarkerData[]` and rendered on the chart as arrows by `MarkerRenderer.renderStrategyMarkers()` — but the crosshair renderer has no access to them and no logic to render marker details.

The frontend already receives `strategyMarkers` as part of `ScriptResult`. The data flows: backend strategy → `ScriptResult.strategyMarkers` → `ChartComponent` → `PineChart.setStrategyMarkers()`. The gap is at the render step: `CrosshairRenderer.render()` is not called with marker data, and the frontend chart type `StrategyMarkerData` lacks display-oriented fields (`action`, `quantity`, `price`).

## Goals / Non-Goals

**Goals:**
- Enrich `StrategyMarkerData` in `frontend/src/chart/types.ts` with optional `action`, `quantity`, `price` fields (matching the backend `StrategyMarker` and shared `frontend/src/types/index.ts`)
- Pass strategy markers from `PineChart` into `CrosshairRenderer` during the render loop
- Render strategy marker details in the tooltip when the hovered bar has markers
- Use distinct color styling per marker type (long entry=green, short entry=red, exit=orange, close=red, cancel=gray)
- Full backward compatibility (missing fields gracefully omitted)
- Keep the tooltip readable and bounded (capped marker display count)

**Non-Goals:**
- No interactive marker management (edit, dismiss, navigate from tooltip)
- No new backend API or WebSocket messages — data already flows through `ScriptResult`
- No changes to the existing arrow/label rendering on the chart (markers stay as-is)
- No changes to the strategy engine's marker creation logic

## Decisions

### Decision 1: Enrich StrategyMarkerData in frontend chart types
**Rationale**: `StrategyMarkerData` is duplicated in `frontend/src/types/index.ts` (full type with `action`, `quantity`, `price`) and `frontend/src/chart/types.ts` (stripped-down version without those fields). The chart renderer imports from `chart/types.ts`, so it needs the fields to render them. Adding them as optional ensures backward compatibility with any data that lacks them.

**Alternatives considered**:
- **Separate lookup by orderId/barIndex**: Would require a map from barIndex → markers in the renderer — unnecessary since `PineChart` already has a `strategyMarkers` array that can be passed directly.
- **Merge into a shared type**: A future refactor could deduplicate; out of scope here.

### Decision 2: Pass markers as an array to CrosshairRenderer
**Rationale**: Same pattern used for alerts. The `render()` method already takes `candles`, `allPlots`, and `alerts`. Adding `strategyMarkers` as a fourth optional parameter (defaulting to `[]`) is the minimal change. The renderer filters by `barIndex` internally.

### Decision 3: Marker section inserted after OHLC, before alerts (or after alerts if both present)
**Rationale**: The natural reading order is: identification (date) → core data (OHLCV) → strategy actions (entries/exits) → events (alerts) → derived values (plot lines). Strategy markers and alerts are both events, but strategy markers are the primary user intent of a strategy script, so they come first.

If only alerts exist on a bar, alert section stays in its existing position.
If only markers exist, marker section goes in place.
If both exist, marker section comes first, then alerts.

### Decision 4: Style strategy lines with distinct colors per marker type
**Rationale**: Markers have a type property (`entry`, `exit`, `close`, `order`, `cancel`) that conveys meaning. Color-coding the tooltip lines (green for entry, orange for exit, red for close, yellow for order, gray for cancel) makes the info scannable at a glance.

- `entry`: `#4caf50` (same as marker arrow)
- `exit`: `#ff9800` (same as marker arrow)
- `close`: `#f44336` (same as marker arrow)
- `order`: `#ffeb3b` (same as marker arrow)
- `cancel`: `#999999` (same as marker arrow)

### Decision 5: Cap displayed markers at 5, show "+N more" fallback
**Rationale**: Same reasoning as the alert cap. A reversal bar could have both an entry and exit marker. Capping at 5 keeps the tooltip readable.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| **Tooltip height grows** | Cap at 5 markers + "+N more" fallback. Existing tooltip position logic handles overflow. |
| **Old ScriptResult data lacks action/quantity/price** | Fields are optional. Renderer gracefully omits unavailable fields. |
| **Performance: filtering markers per frame** | `StrategyMarkerData[]` is typically small (< 100 entries). Linear scan per frame is negligible. |
| **Type misalignment between type files** | Both frontend type files get `action`, `quantity`, `price`. A future deduplication refactor would eliminate this risk. |

## Migration Plan

1. Add optional `action`, `quantity`, `price` fields to `StrategyMarkerData` in `frontend/src/chart/types.ts`.
2. Update `CrosshairRenderer.render()` signature to accept a `StrategyMarkerData[]` parameter.
3. Update `PineChart` render loop to pass `this.strategyMarkers` to the crosshair renderer.
4. Update `CrosshairRenderer.renderTooltip()` to build strategy marker lines and render them with per-type coloring.
5. Verify no regressions: bars without markers → existing tooltip unchanged; bars with markers → new section appears.
6. Write/run tests.

Rollback: revert the strategy-marker lines in `CrosshairRenderer.ts`. Type additions are backward-compatible.

## Open Questions

- Should we show the `comment` field as a "description" or as part of the marker details? **Resolved**: comment is shown as a secondary line below the marker title, styled like the alert message. The `comment` field IS the user's description from `strategy.entry(comment=)` / `strategy.exit(comment=)`.
