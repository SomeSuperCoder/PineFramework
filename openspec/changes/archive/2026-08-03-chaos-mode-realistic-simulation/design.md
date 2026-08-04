## Context

See proposal.md — Why. Chaos mode currently bypasses the strategy engine entirely: `LiveStrategyExecutor.processCandleChaos` draws a random action and emits a raw `TradeSignal` (`live-strategy-executor.ts:363`), and the dashboard mini chart keeps executing the configured strategy via `POST /api/execute`, so chaos is invisible on screen. The execution pipeline (signal → DEX order) and the `bot:snapshot`/`bot:log` WS channels already exist and work; what's missing is (a) markers produced by the real strategy engine, (b) a channel to broadcast them, and (c) the mini chart rendering them instead of the config strategy.

Key existing facts:
- `LiveStrategyExecutor` already holds a `StrategyEngine` per pair in `strategyStates` (`live-strategy-executor.ts:97`) and its `TradeSignal` already carries an optional `marker?: StrategyMarker` field (`:69`).
- `Scheduler.TradeSignal` (`scheduler.ts:50`) has no marker field; the `processCandle` mapping in `bot-engine.ts:444` drops `s.marker`.
- `BotEngine` emits events via `BotEventMap` (`bot-engine.ts:42`); the backend wires them to WS in `backend/src/index.ts:240`. The `bot-gateway.ts` `sendSnapshot` sends full state on connect (`:64`).
- The mini chart already renders `strategyMarkers` from `ScriptResult` (`MiniChart.tsx:178-190`), and `MarkerRenderer.renderStrategyMarkers` resolves bars by `barIndex ?? findBarIndexByTimestamp(timestamp)` (`MarkerRenderer.ts:71`).
- `TradeSignal.marker` and the executor `state.position` are the executor's own mirror of the engine; the chaos path must keep them consistent.

## Goals / Non-Goals

**Goals:**
- Chaos markers are produced by the real `StrategyEngine` (labels, colors, types indistinguishable from a real strategy).
- Every chaos entry is sized at 10% of current equity.
- The mini chart shows the actual chaos markers (truth), never the config strategy, when chaos mode is on.
- Broadcast + replay follow the existing `bot:snapshot` / event→WS pattern (no new infra).

**Non-Goals:**
- No changes to non-chaos strategy execution.
- No changes to the main editor chart or to chaos activation UX / warning banner.
- No persistence of chaos history across server restarts.

## Decisions

### D1: Chaos mode drives the real StrategyEngine per pair
In `processCandleChaos`, keep the `ChaosSignalGenerator` for the random draw (uniform long/short/exit, 10% sizing, logging), then drive the pair's existing `state.engine` the same way the Pine builtins do (`strategy-builtins.ts`):

```
random action
  ├─ long while flat   → engine.entry('Long', 'long', qty10)
  ├─ short while long  → engine.close('Short')
  ├─ exit  while long  → engine.close('Exit')
  └─ otherwise         → no-op (engine emits no marker)
```

Markers come from `engine.getNewMarkers()` — genuine `StrategyMarker`s with real names (`Long`, `Exit Short`, `Exit Exit`) and colors (`#00FF00` entry, `#FF0000` close). The chaos path then maps each marker to a `TradeSignal` and attaches the marker (`signal.marker = marker`):
- `entry` (direction long) → `buy` with `quantity = engineMarker.quantity`
- `close` (long) → `sell` with `quantity = engineMarker.quantity`

**Rationale:** SSOT — the engine is the single place that knows how a real strategy's markers look. Hand-fabricating markers in the frontend (alternative) duplicates the label/color conventions and drifts when the engine changes.

**Alternatives considered:**
- *Frontend fabrication of lookalike markers* — simpler backend, but hard-codes engine conventions in a second place. Rejected for maintainability.
- *A dedicated throwaway engine per candle* — stateless and cheap, but loses position continuity (would allow entries on consecutive bars, which no real strategy does). Rejected; the stateful per-pair engine is the "real feeling".

Position-state consistency: after driving the engine, sync the executor's `state.position` from the emitted markers (entry→long, close→flat, using marker quantity/price) so `executeSignal`'s downstream position handling stays coherent with the engine.

### D2: Thread the marker through the scheduler and emit from submitOrders
The marker must reach the point where the execution result is known, so:
- Add `marker?: StrategyMarker` to `Scheduler.TradeSignal` (`scheduler.ts:50`) and carry `s.marker` through the `processCandle` mapping (`bot-engine.ts:444`).
- In the `submitOrders` callback (`bot-engine.ts:456`), after each `executeSignal` call, build a `ChaosSignalRecord` (marker fields + symbol/timeframe + `success`/`txSignature`/`error`) and `this.emit('chaosSignal', record)`.

**Rationale:** execution truth (success/failure, tx signature) only exists at `submitOrders`, and the emit→WS wiring already lives in `backend/src/index.ts`. This reuses the established `BotEventMap` pattern rather than giving the executor a broadcast callback (which would couple the shared `pine-framework` executor to backend WS).

### D3: Ring buffer + snapshot replay
`BotEngine` keeps `chaosHistory: ChaosSignalRecord[]` (cap ~200, FIFO), appends on every emit, exposes `getChaosHistory()`. `bot-gateway.ts` `sendSnapshot` adds `data.chaosSignals = engine.getChaosHistory()`. `useBotWebSocket` seeds its state from the snapshot and appends on `bot:chaosSignal`.

**Rationale:** mirrors the existing "send full snapshot on connect" pattern (`bot-gateway.ts:64`), so a page reload mid-run preserves the recent trace without new endpoints.

### D4: Mini chart switches to chaos markers in chaos mode
`useBotMiniChartData` gains `chaosMode` and `chaosSignals` params. When `chaosMode` is true it SHALL NOT call `executeScript` for the strategy; it builds a `ScriptResult` with empty plots/labels and `strategyMarkers` resolved from chaos signals for the active symbol, matching each record's timestamp to a visible candle index (the broadcast timestamp is ms, candles are seconds — match via `Math.floor(ts/1000)`). When false, behavior is unchanged.

**Rationale:** the `MiniChart` and `MarkerRenderer` already render `strategyMarkers`; no chart code changes. Resolving `barIndex` at the hook avoids trusting backend-batch-relative indices.

### D5: 10% entry sizing
`processCandleChaos` computes `equity` (current equity, today approximated from executor state) and passes `quantity = equity * 0.1 / price` explicitly to `engine.entry('Long', 'long', quantity)`, so the engine's marker quantity and the DEX order both reflect exactly 10%. The `ChaosSignalGenerator` keeps emitting `sizeFraction: 0.1` for logging.

## Risks / Trade-offs

- [Engine and executor position state could diverge] → D1 syncs `state.position` from emitted markers each candle; tests assert the chaos path never references a stale position.
- [Failed orders still show an entry marker (engine doesn't know fills)] → the broadcast carries `success`, and the mini chart flags failed markers visually; spec `chaos-test-mode` "Chaos markers broadcast in real time" pins this.
- [Chaos history is lost on server restart] → accepted; in-memory ring buffer only (non-goal).
- [Marker timestamps are backend-batch-relative `barIndex`] → broadcasts send `timestamp` (ms); the frontend resolves the bar, never the backend `barIndex`.
- [`Scheduler.TradeSignal` gains a field] → additive and optional; existing producers/tests unaffected.

## Migration Plan

Single coordinated change across the `pine-framework` executor/scheduler and the backend/frontend packages. Rollback: revert `processCandleChaos` to the stateless generator and remove the WS channel wiring; the mini chart falls back to config-strategy rendering when `chaosMode` is absent from its props. No data migration.

## Open Questions

None — the stateful vs stateless and failure-visibility decisions were resolved with the user before proposal creation.
