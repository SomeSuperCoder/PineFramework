## Why

Opening the Bot Dashboard to the Review step (with a saved config + wallet) causes the backend to execute the saved strategy and emit `[StrategyEngine]` logs — even though the bot is Idle and the user never clicked Start Bot. The `useBotMiniChartData` hook runs unconditionally inside `LiveDashboard`, so it fetches OHLCV, executes the strategy via `POST /api/execute`, and subscribes to the kline WebSocket even when the mini chart is not rendered (Idle/Review state). Each incoming kline re-executes the full 200-bar strategy, producing repeated identical `[StrategyEngine] entry CREATED` log blocks.

## What Changes

- Gate the mini chart data pipeline so it only runs when the mini chart is actually rendered (Running/Stopping/Error states), never in Idle/Stopped.
- Move `useBotMiniChartData` out of the always-mounted `LiveDashboard` body into a component that only mounts when the mini chart is visible, so the hook's side effects (OHLCV fetch, `/api/execute`, WebSocket subscription) cannot fire in the SetupWizard view.
- Ensure no backend strategy execution or kline subscription occurs while the bot is Idle and no chart is rendering the strategy.
- No backend/API changes required.

## Capabilities

### New Capabilities

- None

### Modified Capabilities

- `mini-chart`: Strengthen the "Mini chart integrates into LiveDashboard layout" requirement — currently it only states the mini chart SHALL NOT *appear* in Idle state, but the data pipeline (fetch, strategy execution, WebSocket subscription) still runs. The requirement must be extended so the mini chart data pipeline SHALL NOT execute while the mini chart is not rendered.

## Impact

- `frontend/src/components/TradingBotPanel.tsx` — `LiveDashboard` refactor: extract mini chart into a child component mounted only in running states.
- `frontend/src/hooks/useMiniChartData.ts` — unchanged behavior; execution is controlled by component mounting.
- Behavior only; no API contract changes.

## Non-goals

- No changes to `/api/execute`, the strategy engine, or backend execution semantics.
- No changes to mini chart behavior when the bot IS running.
- No suppression of legitimate strategy logs during actual trading.
