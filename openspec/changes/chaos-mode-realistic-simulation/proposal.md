## Why

Chaos mode generates random signals but is invisible on the chart: the dashboard mini chart keeps executing the configured strategy and renders its own plots and labels, so chaos mode "does nothing" visually. Chaos mode exists to emulate a real strategy for stress-testing the trading pipeline, so its chart output must be indistinguishable from a real strategy — and it must show the truth (the signals the bot actually generated and executed), not a synthetic preview.

## What Changes

- **Stateful chaos simulation**: chaos mode now drives the real `StrategyEngine` with random `long`/`short`/`exit` actions, so every marker is produced by the genuine strategy engine (real labels like `Long` / `Exit Short`, real colors, real position-state semantics — no marker when a transition is impossible, just like a real strategy).
- **10% capital per entry**: any `long` entry during chaos mode is sized at exactly 10% of current equity (retained from existing chaos-mode requirements, reinforced as the only sizing mode).
- **Chaos markers broadcast over WebSocket**: new `bot:chaosSignal` channel broadcasts each chaos marker with its execution result (success/failure, tx signature). A bounded in-memory ring buffer is replayed in the `bot:snapshot` payload on connect so a page reload preserves recent history.
- **Mini chart shows the truth**: when chaos mode is active, the mini chart SHALL NOT execute the configured strategy (`/api/execute`); it renders the broadcast chaos markers on the candles instead, so the dashboard reflects exactly what the bot did.
- **Failed orders are visible**: a chaos order that fails on the DEX (e.g., insufficient balance) is still shown on the chart but flagged as failed.

## Capabilities

### New Capabilities

- *(none — extends the existing `chaos-test-mode` capability)*

### Modified Capabilities

- `chaos-test-mode`: Random signal generation becomes a stateful, engine-driven simulation whose markers are indistinguishable from a real strategy; markers and execution results are broadcast over a new `bot:chaosSignal` channel with ring-buffer replay; 10% entry sizing is retained.
- `mini-chart`: In chaos mode the mini chart renders the broadcast chaos markers and does NOT execute the configured strategy, so it shows the bot's actual behavior instead of the config strategy's output.

## Impact

- **Backend**: `src/trading/bot-engine.ts` (new `chaosSignal` event + ring buffer), `src/trading/live-strategy-executor.ts` (`processCandleChaos` drives the real `StrategyEngine`, 10% sizing, emits markers), `backend/src/ws/bot-gateway.ts` (replay chaos history in snapshot), `backend/src/index.ts` (broadcast wiring).
- **Frontend**: `frontend/src/components/TradingBotPanel.tsx` (`useBotWebSocket` collects `bot:chaosSignal`, prop-drill into `LiveBotView`), `frontend/src/hooks/useMiniChartData.ts` (chaos marker path, skip `/api/execute`), `frontend/src/components/MiniChart.tsx` (no change — reuses existing `setStrategyMarkers`).
- **Types**: new chaos marker/signal record type, new `BotEventMap` entry, `BotWSBroadcaster` channel.

## Non-goals

- No changes to the non-chaos strategy execution path.
- No changes to the main strategy editor chart.
- No persistence of chaos history across server restarts (in-memory ring buffer only).
- No changes to chaos activation UX, dashboard warning banner, or signal distribution (uniform 1/3 retained).
