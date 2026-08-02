## Why

When the trading bot is running, users have no visual feedback that the bot is actively processing market data. The LiveDashboard shows numeric metrics and logs, but lacks the immediate "the bot is watching the chart" affordance that a mini candlestick chart provides. A small, auto-scaling chart showing the last 10–15 candles with the active indicator's plot data gives users instant visual confirmation that the bot is live and responding to price action — without leaving the dashboard.

## What Changes

- **New `MiniChart` React component**: A lightweight wrapper around the existing `PineChart` canvas engine, configured for read-only display (no pan, no zoom, no crosshair, no time/price axis labels). Renders only the last N candles with auto-scaled price range.
- **Shared renderer code**: Reuses `CandlestickRenderer`, `LineRenderer`, `AreaRenderer`, `MarkerRenderer`, and `HLineRenderer` from the existing chart — zero duplication of rendering logic.
- **Bot dashboard integration**: The `LiveDashboard` running-state view gains a mini chart panel in the center column (above metrics), showing real-time candle + indicator data fed from the same WebSocket stream the bot already consumes.
- **Data pipeline for mini chart**: A lightweight hook (`useMiniChartData`) that slices the last N candles from the bot's real-time feed and re-executes the bot's Pine Script against them to produce a `ScriptResult` for the mini chart. The hook fetches enough historical candles to satisfy the indicator's lookback period, even though only the last 10–15 are displayed.

## Capabilities

### New Capabilities
- `mini-chart`: A read-only, auto-scaling candlestick chart component for embedding in dashboards. Reuses the core PineChart renderers but strips all interaction, axis chrome, and grid to produce a compact "live thumbnail" of price + indicator data.

### Modified Capabilities

## Impact

- **Frontend components**: New `MiniChart.tsx` component and `useMiniChartData.ts` hook in `frontend/src/components/` and `frontend/src/hooks/`.
- **TradingBotPanel.tsx**: The `LiveDashboard` running-state layout changes from three-column to include the mini chart in the center column.
- **Chart engine**: No changes to `PineChart.ts` or renderers — the mini chart instantiates `PineChart` with stripped-down options and disables interaction via existing config. If needed, new `ChartOptions` flags (e.g., `interactive: false`, `showGrid: false`, `showAxisLabels: false`) may be added to `types.ts`.
- **WebSocket / bot gateway**: The bot's real-time kline data already flows to the frontend; no backend changes required. The mini chart hook subscribes to the same data channel.
- **No breaking changes**: The full chart component and all existing functionality remain untouched.
