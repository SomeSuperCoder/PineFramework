## Context

The chart tooltip (`CrosshairRenderer.renderTooltip`) currently displays date/time, O/H/L/C, volume, and up to five plot series values. Alert triggers are already stored on `PineChart.alertTriggers` as `AlertTriggerData[]` with `alertId`, `barIndex`, `timestamp` — but the crosshair renderer has no access to them and no logic to render alert details.

The frontend already receives `alertTriggers` as part of `ScriptResult`. The data flows: backend strategy → `ScriptResult.alertTriggers` → `ChartComponent` → `PineChart.setAlertTriggers()`. The gap is at the render step: `CrosshairRenderer.render()` is not called with alert data, and `AlertTriggerData` lacks display-friendly fields (title, message).

## Goals / Non-Goals

**Goals:**
- Enrich `AlertTriggerData` with optional `title`, `message`, `destination` fields for display purposes
- Pass alert data from `PineChart` into `CrosshairRenderer` during the render loop
- Render alert details in the tooltip when the hovered bar has alerts
- Keep the tooltip readable and bounded (capped alert count, no overflow)
- Full backward compatibility with existing alert data that lacks display fields

**Non-Goals:**
- No interactive alert management (edit, dismiss, navigate from tooltip — that's follow-up scope)
- No new backend API or WebSocket messages — data already flows through `ScriptResult`
- No changes to alert marker rendering on the chart (existing markers stay as-is)
- No changes to the alert creation/triggering logic in the strategy engine

## Decisions

### Decision 1: Enrich AlertTriggerData in frontend types (both copies)
**Rationale**: `AlertTriggerData` is duplicated in `frontend/src/types/index.ts` and `frontend/src/chart/types.ts`. Both copies need the new optional fields to keep TypeScript strict-mode happy at each layer. The fields are optional so existing serialized data (e.g., from WebSocket) still works without changes to the backend.

**Alternatives considered**:
- **Separate lookup by alertId**: Would require a map from alertId → AlertConditionData in the renderer, adding complexity and a new parameter to `renderTooltip()`. Since the data is already in `ScriptResult.alertTriggers`, enriching it directly is simpler.
- **Add a new type `AlertTooltipData`**: More type-safe but introduces parallel structures. Not worth it for a small delta.

### Decision 2: Pass alerts as an array to CrosshairRenderer
**Rationale**: The `render()` method already takes `candles` and `allPlots`. Adding an `alerts` parameter (or merging into the render context) is the minimal change. The renderer filters by `barIndex` internally.

**Alternatives considered**:
- **Merge alert info into `CandlestickData`**: Wrong abstraction — alert data is not candle data. Cross-cutting concern.
- **Use a Map<number, AlertTriggerData[]> in PineChart and pass that**: Slightly more performant but adds a pre-computation step. The renderer can filter a flat array cheaply (typical bar count < 5000 visible).

### Decision 3: Alert section inserted between OHLC and plot data
**Rationale**: The natural reading order is: identification (date) → core data (OHLCV) → events (alerts) → derived values (plot lines). Alerts are events that happened on this bar, so they logically sit between the raw candle data and the indicator overlay.

### Decision 4: Cap alert display at 5 entries, show "+N more"
**Rationale**: A bar could theoretically have many alerts (e.g., every alert condition fires). The tooltip must remain readable. 5 lines of alert info is a reasonable cap — matching the existing 5-plot cap. Beyond 5, a summary line "⚠ +N more alerts" is shown.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| **Tooltip height grows unpredictably** | Cap at 5 alerts + "+N more" fallback. Tooltip position logic already adjusts for right-edge overflow. |
| **Backend sends AlertTriggerData without new fields** | Fields are optional (`title?`, `message?`, `destination?`). Renderer skips alert section when `title` is absent. |
| **Performance: filtering alerts per render frame** | `AlertTriggerData[]` is typically small (< 100 entries). Linear scan per frame is negligible. |
| **Type duplication between frontend/src/types and chart/types** | Both files get the same delta. A future refactor could deduplicate, but out of scope here. |

## Migration Plan

1. Update `AlertTriggerData` in both frontend type files (add optional fields).
2. Update `CrosshairRenderer.render()` signature to accept an `AlertTriggerData[]` parameter.
3. Update `PineChart` render loop to pass `this.alertTriggers` to the crosshair renderer.
4. Update `CrosshairRenderer.renderTooltip()` to build alert lines and render them.
5. Verify no regressions on bars without alerts (existing tooltip unchanged).
6. Write/run tests.

Rollback: revert the alert-related lines in `CrosshairRenderer.ts`. All other changes are backward-compatible type additions.

## Open Questions

- Do we want alert *colors* in the tooltip (e.g., matching the alert condition's assigned color)? Resolved: not for now — follow-up if users request it.
