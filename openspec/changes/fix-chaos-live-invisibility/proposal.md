## Why

A live chaos-mode run still shows "literally nothing" — no random signals on the mini-chart, no positions opened or closed — even after `fix-chaos-mode-silent-vanish`. That change fixed the code-level silent-zero paths and passed QA on unit/integration tests, but the live system remains blind: a dead candle feed produces zero heartbeats with no dashboard telemetry, the Running-transition snapshot broadcast omits `chaosSignals` (wiping collected markers), the snapshot `positions` field is a never-populated stub, and the mini-chart drops markers outside the last 12 visible candles or when the chart pair differs from the traded pair. The system cannot tell the operator whether the pipeline is dead, invisible, or blocked — so it must become self-diagnosing.

## What Changes

- **Feed/state telemetry**: the bot broadcasts feed-connectivity state (connected/disconnected/subscription results), last-confirmed-candle timestamp, and candle count over WS; the backend persists the last run's feed state to disk so a dead bot is diagnosable without being watched live. A Running bot with no candles now shows a "feed silent" indicator instead of looking healthy.
- **Complete snapshots (SSOT)**: every `bot:snapshot` broadcast — connect-time AND Running re-broadcast — includes `chaosSignals` via one shared snapshot-payload builder, so the frontend's replace-on-snapshot no longer wipes collected markers.
- **Truthful positions**: snapshot `positions` is populated from the executor's per-pair position state (not a stub), and the backend emits `bot:position` events on open/close so the "positions opened/closed" half of the complaint becomes observable and accurate.
- **Chaos signals visible on the mini-chart**: the frontend renders chaos heartbeats as chart-visible markers and resolves markers across the full candle window, independent of the 12-candle display slice and of the disk `pairs[0]` vs running-pair divergence.

## Capabilities

### New Capabilities

- `bot-feed-telemetry`: The bot exposes feed connectivity, last-candle timestamp, and candle count to the dashboard over WS and persists last-run feed state to disk, so a silent/dead feed is visible and diagnosable.

### Modified Capabilities

- `chaos-test-mode`: "Chaos mode execution result tracking" changes so every `bot:snapshot` (including Running re-broadcast) carries the full `chaosSignals` history, and chaos heartbeats render as chart markers so signals are visible on the mini-chart.
- `mini-chart`: Marker resolution changes so strategy/chaos markers are shown across the full loaded candle window rather than only the last 12 visible candles, and are not silently dropped when the chart pair differs from the traded pair.
- `dashboard-positions-panel`: Positions displayed are populated from the executor's real per-pair position state and updated via `bot:position` events, instead of the never-populated snapshot stub.

## Impact

- `src/trading/bot-engine.ts` — feed-state tracking + emit, snapshot builder includes `chaosSignals` + truthful `positions`, `bot:position` event on open/close.
- `src/trading/live-strategy-executor.ts` — expose per-pair position state to the snapshot; no execution-path mutation to do so.
- `backend/src/ws/bot-gateway.ts` / `backend/src/index.ts` — shared snapshot-payload builder; broadcast `bot:feedStatus` / `bot:position`; persist last-run feed state.
- `frontend/src/hooks/useBotWebSocket` (TradingBotPanel.tsx) — handle `bot:feedStatus` / `bot:position`; snapshot replace semantics unchanged (backend now always sends the full array).
- `frontend/src/hooks/useMiniChartData.ts` / `frontend/src/components/MiniChart.tsx` / `TradingBotPanel.tsx` — heartbeat markers, full-window marker resolution, pair-source fix.
- Tests: bot-engine snapshot completeness, feed-telemetry, positions truth, frontend chaos-rendering.

## Non-goals

- **BREAKING**: none. Snapshot/WS payloads are additive; existing fields keep their shape.
- Timeframe/pair format validation at configure (rejects "1h"/"1m" silently misconfigs) — deferred to a hardening change.
- PATCH `/bot/config/chaos-mode` disk-only trap — deferred hardening.
- Risk-gate reason surfacing in marker tooltips — deferred hardening.
- Result-type error taxonomy, RPC retry/backoff, `loadState()` cleanup — out of scope.
