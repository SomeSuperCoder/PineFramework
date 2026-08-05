## Why

Chaos mode silently does nothing on live runs: real-time candles close but no random signals are printed and no positions are opened or closed. The chaos wiring is intact — the generator always returns a random decision when called — but the path dies invisibly upstream or downstream: the chaos engine is seeded with the real wallet balance (`Number(realBalance)`, live-strategy-executor.ts:193), so a 0/unreachable wallet produces zero-qty entries and no markers; per-candle throws are swallowed by the scheduler try/catch (scheduler.ts:214-223); `POST /api/bot/configure` drops `chaosMode` from the config it saves (bot.ts:302-312); and toggling chaos off leaves the per-pair runtime null so ALL trading stops silently. Chaos mode exists to test whether a real strategy would work — it cannot do that while it is the quietest part of the system.

## What Changes

- **Chaos never silently dies on zero balance**: when the real wallet balance is 0 or unreachable, the chaos engine falls back to a documented simulated equity floor and logs loudly with the failure mode (`wallet-empty` vs `rpc-unreachable`). A `qty <= 0` is never passed to `engine.entry`.
- **Adapter honesty**: the Jupiter swap adapter throws (or returns a Result) on transport errors instead of returning `'0'`, so "no funds" and "RPC down" become distinguishable failure modes.
- **Chaos heartbeat + error surfacing**: every processed candle emits either a signal, an explicit no-op reason, or an error; the scheduler's per-candle catch emits a `candle-error` event (WS-broadcast) instead of silently swallowing it. "Never silently vanishes" becomes observable.
- **SSOT config**: `POST /api/bot/configure` merges and preserves `chaosMode` instead of dropping it; `toggleChaosMode` persists to disk; the frontend chaos badge reflects the engine's actual config, not just disk state.
- **Toggle-off restores strategy execution**: `clearChaosGenerator` rebuilds each pair's runtime through the non-chaos branch, so disabling chaos resumes normal strategy execution instead of silently disabling all trading.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `chaos-test-mode`: Requirements "Chaos mode signal execution", "Chaos mode simulates a real strategy", and "Chaos mode execution result tracking" change to guarantee chaos always drives the real strategy machinery (engine → markers → scheduler → executor → DEX) even when the wallet is empty/unreachable, and to make every candle outcome (signal / explicit no-op / error) observable.
- `chaos-mode-hot-swap`: Requirement "Hot-swap chaos mode on running engine" changes so disabling chaos restores normal strategy execution (runtime rebuilt), and the toggle persists so a restart does not silently revert the mode.

## Impact

- `src/trading/live-strategy-executor.ts` — chaos equity floor, heartbeat emission, toggle-off runtime restore, execution-mode flagging.
- `src/trading/scheduler.ts` — per-candle error event emission (no silent swallow).
- `src/trading/bot-engine.ts` — `candle-error` event on the existing emitter, toggle persistence, chaos execution-mode in snapshot.
- `src/trading/dex/jupiter-swap-adapter.ts` — throw on transport error instead of `'0'`.
- `backend/src/routes/bot.ts` — configure merge preserves `chaosMode`; toggle persists.
- `backend/src/ws/bot-gateway.ts` / `backend/src/index.ts` — broadcast `candle-error` / heartbeat.
- `frontend/src/hooks/useChaosMode.ts` / `TradingBotPanel.tsx` — badge reads engine truth; heartbeat/error display.
- Tests: chaos-realistic-engine, live-strategy-executor, execution-sizing, bot.ts route regression, frontend chaos tests.

## Non-goals

- **BREAKING**: none.
- Chaos-as-driver refactor (making chaos a driver plugin on the shared `processCandle` path) — deferred, to be scheduled before the next strategy feature lands.
- Result-type error taxonomy across the scheduler, RPC retry/backoff, and `loadState()`/`strategy-state.json` cleanup — out of scope.
- Changing the 10%-of-equity sizing contract or the paper-vs-real execution decision — chaos continues to execute real DEX swaps sized at 10% of equity, with loud reporting when it cannot.
