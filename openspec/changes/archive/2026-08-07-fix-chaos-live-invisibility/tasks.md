## 1. Backend engine layer: feed telemetry + truthful positions (DONE — Backend Engineer 1)

- [x] 1.1 Feed state tracking + `feedStatus` event in `bot-engine.ts` (connected, subscriptions sent, lastCandleAt, candleCount, silentSince) — DONE
- [x] 1.2 (engine half) `feedStatus` emit — DONE (server broadcast is task 2.5)
- [x] 1.3 Throttled persistence of feed state to `feed-state.json` — DONE; **REVISED: must be throttled so candle-count updates do not write every candle** (see task 1.4)
- [x] 2.3 Read-only `getPositions()` + `getRunningPairs()` on executor + engine delegating accessors — DONE
- [x] 2.4 (engine half) `bot:position` event at confirmed order results — DONE (server broadcast is task 2.6)
- [x] 1.4 **REVISION (Critique BLOCKER #2):** gate positions on CONFIRMED fills — a failed DEX order must NOT leave a phantom position. Track per-pair last swap confirmation; `getPositions()` omits the pair when the staged position was not confirmed; `bot:position` open event only on confirmed fill. Revert/stage-clear `state.position` on swap failure in `updatePositionState` (which already receives `swapResult` and currently ignores it). — DONE (Backend Engineer 2)

## 2. Backend server/WS layer: shared snapshot builder + broadcasts

- [x] 2.1 Build `buildSnapshotPayload(snapshot, engine)` producing the complete payload: status, `chaosSignals` (from `getChaosHistory()`), `chaosHeartbeat`, `totalCandleErrors`, `chaosMode`, running pairs, feed state, and **truthful positions written into `status.positions`** (Critique BLOCKER #3 — the frontend reads `msg.data.status.positions`, a hoisted field is ignored).
- [x] 2.2 Use the shared builder in BOTH snapshot broadcast sites: gateway connect handler (`bot-gateway.ts:104-110`) AND the null-engine branch (`bot-gateway.ts:66-97`) AND the state-change re-broadcast (`index.ts:315-329`) — every site shape-identical (fixes the verified `chaosSignals` omission + SSOT).
- [x] 2.5 Broadcast `bot:feedStatus` under `msg.data` mirroring `bot:chaosHeartbeat`; ALSO include current feed state in the connect-time snapshot so a fresh page load on a silent feed is not blind (Critique SHOULD-FIX #7).
- [x] 2.6 Broadcast `bot:position` under `msg.data`.

## 3. Frontend: WS hook consumes new channels

- [x] 3.1 Extend `useBotWebSocket` (TradingBotPanel.tsx) to handle `bot:feedStatus` and `bot:position`; surface feed state (connected/last candle/silent) and positions in the dashboard panel. Keep snapshot replace semantics (backend always sends full `chaosSignals` + `status.positions`).
- [x] 3.2 Surface the running pairs list (from snapshot) so the mini-chart can prefer engine truth over disk `pairs[0]` (Critique NICE #10).

## 4. Frontend: mini-chart renders chaos across full window + heartbeats

- [x] 4.1 **REVISION (Critique BLOCKER #1):** resolve markers against the FULL loaded candle array, THEN reindex `barIndex` by `-sliceStart` when building the display script result (markers with `fullIdx < sliceStart` are dropped, the rest map into the 12-candle display slice). This is what makes full-window resolution actually visible; without it the renderer drops every marker beyond the first 12 bars.
- [x] 4.2 Prefer the engine's running pair (from snapshot) over disk `pairs[0]`; filter markers by symbol AND timeframe (Critique NICE #11).
- [x] 4.3 Heartbeat outcomes: accumulate `bot:chaosHeartbeat` history in the hook (bounded, like `chaosSignals`), pass into `useBotMiniChartData`, render `noop`/`error` heartbeats as distinct small glyphs (new heartbeat marker type in `MarkerRenderer`); skip `signal` heartbeats where the order marker already covers the bar (Critique SHOULD-FIX #6).

## 5. Tests + verification

- [x] 5.1 Unit tests: snapshot builder contract (connect + null-engine + state-change payloads identical, `chaosSignals` + `status.positions` always present), feed-telemetry emit/persist + throttling, `getPositions()` truth incl. failed-swap phantom case, `bot:position` open/close only on confirmed fills. — DONE (Test Engineer): `backend/tests/snapshot-payload.test.ts` (8), `tests/unit/trading/engine-telemetry.test.ts` (6), `live-strategy-executor.test.ts` +4 — 535/535 root suite green.
- [ ] 5.2 Frontend tests: WS hook new channels, display-slice reindex (marker at full-array index 150 renders at display index 2 once window slides), heartbeat markers, pair-source preference, timeframe filter. — ⚠️ PARTIAL (Test Engineer): WS new-channels (3) + MarkerRenderer (3) + pair-source (2) GREEN; mini-chart reindex/heartbeat/filter describes WRITTEN but BLOCKED by PROJECT ISSUE (hook render-loop hang, see handoff) — re-run after Frontend Engineer fixes `useBotMiniChartData` default-`chaosHeartbeats` deps.
- [x] 5.3 Run affected suites (trading, backend routes/WS, frontend chaos) — one run, full capture. — DONE (Test Engineer): root suite 39 files/535 tests green (one run); frontend partial: MarkerRenderer + pair-source + WS-channels green, chaos-frontend mini-chart describes hang on the hook bug (evidence in handoff).
- [ ] 5.4 QA Engineer: verify all acceptance criteria from the delta specs; regression check on the snapshot contract.
