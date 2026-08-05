## 1. Balance honesty + equity floor

- [ ] 1.1 Make `jupiter-swap-adapter.getBalance` throw on transport error instead of returning `'0'`; keep returning a genuine `0` only for a verified empty wallet (add unit tests for both paths).
- [ ] 1.2 Introduce `CHAOS_FALLBACK_EQUITY` (documented 10,000 USDC floor) and seed the chaos engine with it when `realBalance <= 0`, logging the failure mode (`wallet-empty` vs `rpc-unreachable`) and "execution layer NOT live-tested".
- [ ] 1.3 Guard `processCandleChaos` so `qty <= 0` is never passed to `engine.entry` (skip with explicit no-op reason when it would be).
- [ ] 1.4 Expose chaos execution mode (`live` | `simulated` + reason) on the executor/bot-engine so the snapshot can report it.

## 2. Chaos heartbeat + candle-error observability

- [ ] 2.1 `processCandleChaos` emits a per-candle outcome: signal action, explicit no-op reason (e.g. impossible transition), or error.
- [ ] 2.2 Scheduler per-candle catch (scheduler.ts:214-223) emits a `candle-error` event (pair, timeframe, candle timestamp, message) on the BotEngine emitter instead of silent swallow; maintain `totalCandleErrors` counter.
- [ ] 2.3 Backend broadcasts `candle-error` over WS and includes `totalCandleErrors` + chaos execution mode in `bot:snapshot`.
- [ ] 2.4 Frontend displays chaos heartbeat state (last action / no-op / error) and candle-error count.

## 3. SSOT config: configure merge, toggle persist, badge reads engine

- [ ] 3.1 `POST /api/bot/configure` merges validated fields into the current engine config instead of rebuilding from scratch, preserving `chaosMode`.
- [ ] 3.2 `toggleChaosMode` persists to the config store so a restart does not revert the mode.
- [ ] 3.3 Frontend chaos badge reads the engine's mode (via `bot:snapshot`) instead of disk config; reconcile persisted config to engine mode.

## 4. Toggle-off restores strategy runtime

- [ ] 4.1 `clearChaosGenerator` rebuilds each pair's runtime through the non-chaos initialization path (compile runtime + engine), so disabling chaos resumes normal strategy execution.

## 5. Regression tests

- [ ] 5.1 Unit: zero/unreachable balance → chaos engine uses floor equity, produces markers, execution-mode `simulated`; transport error → `rpc-unreachable` not `'0'`.
- [ ] 5.2 Unit: scheduler emits `candle-error` event on a throwing `processCandle` and continues with next candle.
- [ ] 5.3 Route regression: `POST /api/bot/configure` with `chaosMode` present preserves it in engine config and disk; configure without it does not silently drop it.
- [ ] 5.4 Unit: `toggleChaosMode(false)` restores non-chaos runtime; subsequent candle produces a real-strategy outcome, not `[]`.
- [ ] 5.5 Frontend: chaos heartbeat state and candle-error display render from WS payloads.
