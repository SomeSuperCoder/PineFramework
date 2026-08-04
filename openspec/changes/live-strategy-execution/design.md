## Context

See proposal.md — Why. The live (non-chaos) path in `LiveStrategyExecutor` is a stub: it creates a bare `StrategyEngine` (`src/trading/live-strategy-executor.ts:118`) but never compiles `strategySource`, never feeds candles into the engine, and `shouldEnterLong`/`shouldExitLong` hard-code `return false` (lines 508–516). Only chaos mode actually drives the engine.

Meanwhile the chart (`backend/src/routes/execute.ts` → `api.ts:execute`) runs the full Pine path: `parse` → `compile` → `new ExecutionEngine(compileResult)` → `executeBars(contexts)`. That batch path is what produces the "signal the bot ignored."

Key discovery: `ExecutionEngine`/`Interpreter` is already **incremental-safe**:
- `Interpreter.executeBar(context)` (`src/language/runtime/interpreter.ts:113`) advances the internal `StrategyEngine` via `updateBar` (lines 141–157), executes the script body, and returns that bar's markers via `getStrategyMarkers()` (line 184), which **consumes** the marker cursor (`getNewMarkers()`).
- `executeBars` is just a loop over `executeBar` (lines 267–283). Batch-only finalization (`sanitizeOutputs`, `applyLookbackFilter`) runs in `executeBars`, not `executeBar`.

So a single long-lived `ExecutionEngine` can be seeded with history then driven one candle at a time, giving real Pine semantics and chart parity.

## Goals / Non-Goals

**Goals**
- Real Pine strategy execution in the live (non-chaos) path — signals come from the configured strategy source, not placeholders.
- Warm start so live candles are evaluated with populated indicator/`var` state.
- Deterministic parity: same source + same bars → identical markers live vs batch vs chart.
- Fix the broken live wiring so real DEX orders can actually execute and position state is tracked correctly.

**Non-Goals** (see proposal — Non-goals)
- No changes to chaos mode, the batch chart path, or the main strategy editor.
- No new strategy features beyond what the engine supports.
- No bar-history persistence across restarts (live re-warms each start).

## Decisions

### D1 — Reuse the interpreter's incremental `ExecutionEngine` for live evaluation

Replace the bare `new StrategyEngine(...)` in `LiveStrategyExecutor.initializeStrategy` with a compiled `ExecutionEngine` derived from the configured `strategySource`.

- Compile once at strategy initialization: `parse(source)` → `compile(ast)` → `new ExecutionEngine(compileResult)` (mirrors `api.ts:execute`).
- Keep one `ExecutionEngine` instance per pair in `StrategyState` (change `state.engine` type from `StrategyEngine` to the live runtime; expose the underlying `StrategyEngine` via `engine.strategyEngine` when needed for markers/position).
- Add a small helper (e.g. in `src/api.ts`) to build a single-bar `ExecutionContext` from a `ClosedCandle` + `barIndex`, reusing the `createSeries` pattern already in `barsToContexts`.

*Specs:* `strategy-execution` "Live Trading Mode", "Strategy State in Live Mode".

*Alternatives considered:* (a) Keeping the programmatic `StrategyEngine` and translating Pine `strategy.*` calls to imperative `engine.entry()` calls ourselves — rejected: we'd re-implement a compiler bridge and lose chart parity for free. (b) Re-executing the full history on every bar — simple and obviously consistent, but O(n) per candle and wasteful; the interpreter is already built to grow incrementally, so (a) is not needed.

### D2 — Warm start, then incremental live candles

On pair subscription: fetch recent historical candles (Bybit bar feed history / `ohlcv` cache), build contexts, and run `engine.executeBars(seedContexts)` to populate series history, `var` state, and `ohlcvHistory`. Because `executeBar` consumes markers per bar, the warm-up markers are consumed silently — suppress order generation during warm-up with a per-pair `warmUpComplete` flag on `StrategyState`.

Thereafter, each live closed candle → `singleBarContext` → `engine.executeBar(ctx)` → read `result.strategyMarkers` (this bar's new markers only).

*Seed size:* fetch `max(300, maxLookback + 1)` bars, where `maxLookback` is read from the compiled engine. Configurable.

*Specs:* `strategy-execution` "Live mode warm start"; `mock-trading-test` "Live path ignores signals during warm-up".

*Alternatives considered:* Feeding only the warm buffer and discarding it (ring buffer) vs keeping full growth. Keep full growth in-memory for correctness currently; a bounded history ring buffer is a deferred optimization (see Risks).

### D3 — Marker→signal order bridge (mirrors chaos, for real markers)

Translate each live bar's markers to `TradeSignal`s exactly as `processCandleChaos` already does, but for genuine engine markers:
- `entry` + `direction: 'long'` → `action: 'buy'`, `quantity: marker.quantity`, `expectedPrice: currentPrice`.
- `close`/`exit` → `action: 'sell'`, `quantity: marker.quantity`.
- `entry` + `direction: 'short'` → reuse the existing spot-DEX short interpretation contract (close-if-long, warn-if-flat/short — already specced in `strategy-execution` "Live trading short signal interpretation").
- Attach the `marker` to the `TradeSignal` (scheduler already threads `marker` through `BotEventMap`).

*Specs:* `strategy-execution` "Signal-to-order bridge", "Exit-to-order bridge"; existing short-signal requirements unchanged.

### D4 — Fix live execution wiring and position-state keying

Two concrete defects in the real path must be fixed for it to be "truly ready":

1. **Wrong state key in `updatePositionState`** (`live-strategy-executor.ts:519`): it looks up `this.strategyStates.get(\`${symbol}:${timestamp}\`)`, but states are keyed `symbol:timeframe`. Thread `timeframe` onto `TradeSignal` so post-fill position updates land on the correct pair state. Without this, a filled position is never recorded.
2. **Stubbed bot config** (`bot-engine.ts:466–468`): replace `walletManager: null as any`, `initialCapital: 0n`, and hardcoded `positionSizePercent: 100` with real values from bot config. Balance-checked sizing already exists in `executeSignal`.

*Specs:* `strategy-execution` "Real-Time Position Tracking".

### D5 — Determinism by construction + a parity test

Because both the chart and the live path run the same `ExecutionEngine` over the same `strategySource`, identical bars yield identical markers by construction. Lock this in with a parity test (live incremental vs batch over the same synthetic bar sequence), and an end-to-end harness test driven through the real live path into the mock DEX.

*Specs:* `strategy-execution` "Deterministic live vs backtest execution"; `mock-trading-test` "Live-mode strategy execution harness", "Determinism across harness and batch execution".

### D6 — Surface compile/start failures instead of silently running a stub

Compile `strategySource` during bot start. If parse/compile fails, fail the start with a descriptive error (HTTP 400 via `POST /api/bot/start`, consistent with `bot-start-lifecycle`), rather than starting a bot whose strategy can't produce signals.

*Specs:* `strategy-execution` "Live mode activation"; conflicts/guardrails from `bot-start-lifecycle`.

## Risks / Trade-offs

- **[Incremental `executeBar` never exercised standalone in production]** The engine is normally driven via the `executeBars` loop. Long-running per-bar mutation (snapshot/rollback, growing `ohlcHistory`) is untested for realtime. → Mitigation: a unit test feeding hundreds of bars through the live path and asserting markers equal the same bars run via batch.
- **[Determinism depends on identical seed bars]** If the chart's bar count or OHLC derivation differs from the live seed, indicator values (hence markers) can diverge. → Mitigation: parity test pins exact bars; document that live seed must mirror chart bars for the pair/timeframe.
- **[Duplicate/forming candles]** Refeeding a candle (same timestamp) would double-advance the engine. → Mitigation: rely on scheduler closed-candle handling and dedupe on the pair's last-fed `barIndex` in the live executor.
- **[Unbounded history growth]** `ohlcHistory` grows per bar for long sessions → memory pressure. → Trade-off accepted for correctness now; convert to a bounded ring buffer (mirroring `ring-buffer.ts`) as a follow-up, keeping warm-up length ≥ lookback.
- **[Short-dominant strategies on spot]** Long-only commission methods already suppress short entries at engine level; bridge adds no new behavior. Behavior preserved from existing spec.

## Migration Plan

- Implement entirely behind the existing non-chaos live path; chaos mode is untouched and remains as the safety/self-contained path.
- Rollback: revert to the previous stub (`shouldEnterLong`/`shouldExitLong` return `false`) and re-apply `null` wallet wiring — fully contained to `live-strategy-executor.ts` and `bot-engine.ts`.
- Ship with the parity + harness tests green; run existing live/chaos suites to confirm no regression.

## Open Questions

- Exact warm-up bar count (default 300 vs `maxLookback + 1`) — tunable, deferred.
- Whether to persist the warm-up seed / engine bar state across bot restarts to avoid re-warming each start — currently out of scope (re-warm per start); can be a follow-up change.
- Whether `default_qty_type=percent_of_equity` sizing (mock-trading-test) should override marker quantity in the live bridge — markers already carry engine-computed `quantity`; deferred until sizing semantics are confirmed against a live strategy.