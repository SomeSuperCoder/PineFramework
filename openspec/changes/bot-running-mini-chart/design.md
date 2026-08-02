## Context

The PineFramework frontend has a custom canvas-based charting engine (`PineChart`) that renders OHLCV candlesticks, indicator plots, shapes, fills, and strategy markers. The `ChartComponent` React wrapper manages the chart lifecycle and bridges React state to the canvas. The `LiveDashboard` (in `TradingBotPanel.tsx`) shows the bot's running state with a three-column layout: Status | Metrics+Positions | Logs. The bot receives real-time kline data via WebSocket and already executes Pine Script to produce `ScriptResult` data.

The goal is to add a compact, read-only mini chart to the LiveDashboard that reuses the existing chart engine with zero rendering code duplication.

## Goals / Non-Goals

**Goals:**
- Display the last 10–15 candles with indicator plot data in the bot dashboard
- Reuse existing PineChart renderers — no duplication of rendering logic
- Auto-scale price axis to visible candle range
- Update in real time with new candle data from the existing WebSocket stream
- Satisfy indicator lookback periods by providing sufficient historical data

**Non-Goals:**
- User interaction (pan, zoom, crosshair, tooltips) — explicitly disabled
- Independent data fetching — the mini chart consumes the same data channel as the bot
- Configurable candle count — fixed at 10–15 for now
- Full chart features (time axis labels, price axis labels, grid, volume pane) — stripped for compactness
- Support for multiple simultaneous mini charts

## Decisions

### Decision 1: Extend `ChartOptions` with display-mode flags

Add three new optional flags to `ChartOptions` in `types.ts`:
- `interactive: boolean` — when `false`, disables InteractionHandler (no mouse/touch events)
- `showGrid: boolean` — when `false`, skips GridRenderer
- `showAxisLabels: boolean` — when `false`, skips AxisRenderer for both price and time scales

**Rationale**: The existing `PineChart` already instantiates all renderers unconditionally. Adding config flags is the minimal change that lets the mini chart reuse the same `PineChart` class without subclassing or conditional imports. The flags are backward-compatible (default `true` preserves existing behavior).

**Alternative considered**: Create a `MiniPineChart` subclass. Rejected because it would duplicate constructor logic and break when PineChart internals change.

### Decision 2: New `MiniChart` React component (not a modification to `ChartComponent`)

Create `frontend/src/components/MiniChart.tsx` — a thin `forwardRef` component that:
1. Creates a `PineChart` instance with `{ interactive: false, showGrid: false, showAxisLabels: false }` plus compact sizing options
2. Accepts `data: CandlestickData[]` and `scriptResult: ScriptResult | null`
3. Calls `chart.setCandles()`, `chart.addPlotSeries()`, `chart.setPlotData()`, etc. on data changes
4. Auto-fits the viewport on every data update (always shows full visible range)

**Rationale**: `ChartComponent` has significant complexity for interaction handling, scroll-to-date, teleport lines, indicator overlay management, and multi-indicator support. The mini chart needs none of that. A separate component avoids coupling and keeps each focused.

**Alternative considered**: Add a `mini` prop to `ChartComponent`. Rejected because it would add conditional branches throughout a 659-line component, violating the single-responsibility principle.

### Decision 3: Slicing approach for the mini chart data

Rather than maintaining a separate candle buffer, the `useMiniChartData` hook:
1. Receives the full `candles` array and `scriptResult` from the parent (bot WebSocket data)
2. Takes the last `DISPLAY_COUNT` (12) candles for rendering
3. Passes the full candle array to the script execution API (to satisfy lookback), then slices the returned `ScriptResult` plots to only the display range
4. Returns `{ displayCandles, scriptResult, dataVersion }` for the MiniChart component

**Rationale**: Reuses the existing data pipeline. The bot already fetches and caches OHLCV data — the hook just slices and re-executes. The lookback requirement is met by executing against the full dataset, not just the visible slice.

**Alternative considered**: Have the mini chart maintain its own independent candle buffer. Rejected because it would duplicate data management and risk stale state.

### Decision 4: Layout placement in LiveDashboard

The mini chart goes in the center column of the three-column running-state layout, above the metrics grid, in a fixed-height container (~180px). The center column becomes: MiniChart | Metrics | Positions.

**Rationale**: The center column has the most horizontal space and is where users naturally look for "what's happening now." Placing it above metrics gives visual prominence without disrupting the existing information hierarchy.

**Alternative considered**: Full-width banner above the three columns. Rejected because it would compress the status and logs panels.

## Risks / Trade-offs

- **[Risk] Lookback re-execution cost**: Re-executing the Pine Script on every candle update for the mini chart adds CPU overhead. **Mitigation**: The bot already executes the script — the mini chart can reuse the same `ScriptResult` rather than re-executing. If the bot's script result is not available (e.g., during startup), fall back to a no-indicator mini chart.
- **[Risk] Canvas resize in compact mode**: Small canvas dimensions may cause rendering artifacts (text overlap, cramped candles). **Mitigation**: Hide axis labels and grid in mini mode, increase minimum candle width, test at 180px height.
- **[Trade-off] Separate component vs. extending ChartComponent**: Choosing a separate component means any future chart feature that should apply to both must be added to both. **Mitigation**: The mini chart intentionally has a narrower feature surface; shared logic lives in PineChart and renderers.

## Migration Plan

No migration needed — this is a purely additive change. The full chart and all existing functionality remain untouched. The new `MiniChart` component and `useMiniChartData` hook are new files. The only modification to existing code is adding config flags to `ChartOptions` (backward-compatible defaults).

## Open Questions

- Should the mini chart show volume bars? The current design omits them for compactness, but they provide additional trading context. **Recommendation**: Omit in v1, add later if users request it.
