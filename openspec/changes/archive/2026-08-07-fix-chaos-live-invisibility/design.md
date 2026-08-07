## Context

See proposal.md — Why. The code-level chaos path is verified working (markers CAN be produced; configure preserves chaosMode; hot-swap works). The live system is blind at four points: (1) no feed telemetry — a dead Bybit WS feed on a "Running" bot emits zero heartbeats/signals/errors with only a console log; (2) the state-change `bot:snapshot` re-broadcast omits `chaosSignals` while the frontend replaces the array on every snapshot (`TradingBotPanel.tsx:221`) — one Running transition wipes collected markers; (3) snapshot `positions` is an always-empty stub (`bot-engine.ts:145/499/594`); (4) the mini-chart resolves markers only against the last 12 visible candles and only for disk `pairs[0]` (`useMiniChartData.ts:267-279`), silently dropping everything else. The existing WS contract convention (payloads under `msg.data`, additive fields, `chaosHeartbeat`/`candleError` channels) is the established pattern to extend.

## Goals / Non-Goals

**Goals:**
- Make the next chaos run self-diagnosing: feed state, last candle, candle count, and positions all visible on the dashboard; no snapshot broadcast ever drops chaos history.
- Truthful positions from executor state without touching the trading hot path.
- Chaos markers visible on the mini-chart across the full loaded window and for the actually-traded pair.

**Non-Goals:**
- Timeframe/pair format validation, PATCH `/bot/config/chaos-mode` trap, risk-gate reason surfacing, result-type error taxonomy (deferred hardening).
- Changing the chaos execution model, sizing, or the paper-vs-real decision.
- Backend state machine / lifecycle refactors.

## Decisions

### D1: One `bot:feedStatus` channel + persisted run-state file
Mirror the existing `bot:chaosHeartbeat` convention: a single WS channel `bot:feedStatus` carrying `{ connected, subscriptions: [{pair, timeframe, ok, error?}], lastCandleAt?, candleCount, silentSince? }`. The engine already tracks bar-feed lifecycle (`bot-engine.ts:716-729` connect/subscribe callbacks) — extend those callbacks to record state and emit. Persist the same snapshot to a run-state JSON (alongside the existing `strategy-state.json`) so a silent run is diagnosable offline.
- **Why this over per-topic channels:** one channel matches the existing heartbeat pattern, keeps the frontend hook change small, and is additive to the WS contract.
- **Alternative considered:** a dedicated `/api/bot/feed-status` REST endpoint — rejected, WS push is needed for live "feed silent" detection and the dashboard already consumes WS.

### D2: Single shared snapshot-payload builder (SSOT)
Extract one `buildSnapshotPayload(snapshot, engine)` used by BOTH snapshot broadcast sites: the gateway connect handler (`bot-gateway.ts:104-110`) and the state-change re-broadcast (`index.ts:315-329`). The builder always includes `chaosSignals: engine.getChaosHistory()`, `chaosHeartbeat`, `totalCandleErrors`, `chaosMode`, and truthful `positions`.
- **Why:** fixes the verified Cause C wipe (D1 of the bug) at the root and prevents regression — any future broadcast site that uses the builder cannot omit `chaosSignals`.
- **Alternative considered:** patching only the re-broadcast site to add `chaosSignals` — rejected, duplicates the payload shape and the wipe can regress at the next site.

### D3: Truthful positions derived read-only from executor state
The executor already maintains per-pair `state.position` (`live-strategy-executor.ts:1063-1083`). Expose a read-only accessor on the executor (`getPositions(): PositionInfo[]`) and have the snapshot builder call it. The backend emits `bot:position` from the engine on open/close — wired at the existing order-result points in `submitOrders` (buy filled → position open, sell filled → flat) — without mutating execution logic.
- **Why:** "no positions" becomes truthful; the Director's complaint is permanently satisfiable. Read-only derivation means zero risk to the trading hot path.
- **Alternative considered:** tracking positions in `_positions` inside the engine — rejected, duplicates state that already exists in the executor and risks divergence.

### D4: Mini-chart renders across full window + traded pair + heartbeats
Change `useBotMiniChartData` chaos path (L263-305) to: (1) resolve markers against the full loaded candle array (compute `barIndex` from timestamp across all candles, not just the last `displayCount` slice); (2) filter by the chart's actual pair but resolve the chart pair from engine truth when available rather than only disk `pairs[0]`; (3) additionally render heartbeat outcomes as markers (signal/noop/error) so a no-op or error is visible.
- **Why:** addresses the headline symptom directly; the 12-candle window and pair[0] divergence are verified marker-dropping paths.
- **Trade-off:** rendering more markers is a display-only change; `MiniChart` already supports `strategyMarkers` with `barIndex` passthrough, so the rendering layer needs no new capability.

## Risks / Trade-offs

- **Telemetry shape churn** (new channel bakes wrong fields) → keep `bot:feedStatus` minimal and mirror the `chaosHeartbeat` convention; additive fields only.
- **Snapshot builder refactor regression** (moving payload assembly could break the connect snapshot) → the connect-time payload is the contract reference; QA verifies both sites produce identical shapes.
- **Positions exposure touches live execution** → strictly read-only derivation; `bot:position` emission sits at existing order-result points, no execution mutation.
- **Full-window marker rendering could clutter the chart** → heartbeats render as small distinct markers (signal/noop/error glyphs); order markers keep existing styling.
- **Frontend pair-source divergence persists if engine truth isn't in snapshot** → snapshot already carries `chaosMode`; extend the snapshot builder to carry the running pairs list so the frontend can prefer it over disk `pairs[0]`.

## Migration Plan

- Backend first (telemetry + snapshot builder + positions), then frontend (WS hook + mini-chart rendering) — the WS contract is additive, so backend can ship before frontend without breaking existing clients.
- Rollback: the new channels/fields are additive; reverting the change restores the old snapshot shape (with the known wipe bug) without breaking clients.
- QA gates: snapshot-builder contract tests (both sites identical), feed-telemetry tests, positions truth tests, frontend chaos-rendering tests; then a live run is the final acceptance (panel shows feed state + markers + positions).

## Open Questions

None — deferred hardening items (timeframe validation, PATCH trap, risk surfacing) are explicit non-goals and do not affect this design.
