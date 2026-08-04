## 1. Backend: chaos drives the real StrategyEngine

- [x] 1.1 In `processCandleChaos` (`src/trading/live-strategy-executor.ts:363`), after the random draw, drive the pair's `state.engine` per D1: `long` while flat → `engine.entry('Long', 'long', qty10)`, `short` while long → `engine.close('Short')`, `exit` while long → `engine.close('Exit')`, else no-op
- [x] 1.2 Compute the entry quantity as exactly 10% of current equity (`equity * 0.1 / price`) and pass it explicitly to `engine.entry` (spec `chaos-test-mode` "Chaos entries are sized at 10% of equity")
- [x] 1.3 Map `engine.getNewMarkers()` to `TradeSignal`s and attach the marker to each via `signal.marker` (entry/long → buy, close → sell, using marker quantity)
- [x] 1.4 Sync the executor `state.position` from the emitted markers each candle so downstream execution stays coherent with the engine (design D1)

## 2. Backend: thread marker through scheduler + emit chaos events

- [x] 2.1 Add optional `marker?: StrategyMarker` to `Scheduler.TradeSignal` (`src/trading/scheduler.ts:50`) — additive, no behavior change for existing producers
- [x] 2.2 Carry `s.marker` through the `processCandle` mapping in `bot-engine.ts:444`
- [x] 2.3 Add `chaosSignal` to `BotEventMap` (`bot-engine.ts:42`) with a `ChaosSignalRecord` payload (marker fields + symbol/timeframe + success/txSignature/error)
- [x] 2.4 In the `submitOrders` callback (`bot-engine.ts:456`), after each `executeSignal`, build the record and `this.emit('chaosSignal', record)` (spec `chaos-test-mode` "Chaos markers broadcast in real time")
- [x] 2.5 Add an in-memory ring buffer (`chaosHistory`, cap ~200) appended on each emit, and expose `getChaosHistory()` (spec "Chaos history replayed on connect")

## 3. Backend: WS broadcast + snapshot replay

- [x] 3.1 Wire `botEngine.on('chaosSignal', ...)` → `botWS.broadcast({ channel: 'bot:chaosSignal', data: record })` in `backend/src/index.ts:240` (mirrors existing stateChange/error wiring)
- [x] 3.2 Include `chaosSignals: engine.getChaosHistory()` in `sendSnapshot` in `backend/src/ws/bot-gateway.ts:64`

## 4. Frontend: collect chaos signals and render them on the mini chart

- [x] 4.1 In `useBotWebSocket` (`frontend/src/components/TradingBotPanel.tsx:187`), add `chaosSignals` state, seed from `bot:snapshot` data, append on `bot:chaosSignal`, and return it
- [x] 4.2 Pass `chaosSignals` (and `chaosMode`) from App → `LiveDashboard` → `LiveBotView` (spec `mini-chart` "Mini chart renders chaos markers instead of the config strategy")
- [x] 4.3 In `useBotMiniChartData` (`frontend/src/hooks/useMiniChartData.ts:22`), add `chaosMode` + `chaosSignals` params; when `chaosMode` is true, skip `executeScript` for the strategy and build a `ScriptResult` with empty plots/labels and `strategyMarkers` resolved from chaos signals for the active symbol (match ms timestamp to candle by `Math.floor(ts/1000)`)
- [x] 4.4 Flag failed chaos markers visually (e.g., distinct color) so failed DEX orders remain visible as truth (spec `chaos-test-mode` "Chaos markers broadcast in real time" failure scenario)
- [x] 4.5 Verify the mini chart renders chaos markers via the existing `setStrategyMarkers` path (`MiniChart.tsx:178`) with no chart code changes

## 5. Tests & Quality

- [x] 5.1 Unit test: chaos path drives the engine and produces genuine markers with labels `Long` / `Exit Short` / `Exit Exit` and the standard colors
- [x] 5.2 Unit test: no-op transitions (long while long, short/exit while flat) emit no marker
- [x] 5.3 Unit test: every chaos entry quantity equals 10% of equity at entry time
- [x] 5.4 Unit test: `bot-engine` emits `chaosSignal` records on submit with success/failure and pushes to `chaosHistory`; snapshot includes recent history
- [x] 5.5 Frontend test: `useMiniChartData` in chaos mode does not call `/api/execute` and renders chaos markers; in non-chaos mode behavior is unchanged
- [x] 5.6 Frontend test: `useBotWebSocket` seeds from snapshot and appends on `bot:chaosSignal`
- [x] 5.7 Run `just check` (typecheck, lint, build) and `just test` — all gates were already red pre-change; this change adds **zero** new errors (build-config errors 10→9, lint 32→31 on touched files, no new test failures). Pre-existing blockers: `state-machine.ts`/`wallet-manager.ts` build errors (blocks backend `pine-framework` resolution), prettier formatting across the repo, `ChartComponent.tsx` typecheck, and wallet/auto-select test failures. All new chaos tests pass (10 core + 4 frontend)
