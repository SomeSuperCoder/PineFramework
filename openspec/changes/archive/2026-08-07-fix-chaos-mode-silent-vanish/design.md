## Context

See proposal.md - Why for motivation. Current state (verified): the chaos wiring is intact on HEAD; the generator always returns a random decision when called (chaos-signal-generator.ts:50-72). The silent-zeros come from five concrete paths: (1) chaos engine seeded with real wallet balance (`initialCapital: Number(realBalance)`, live-strategy-executor.ts:193-197) → zero/unreachable balance → zero-qty entries → no markers → no signals; (2) scheduler try/catch swallows per-candle throws (scheduler.ts:214-223); (3) `POST /api/bot/configure` drops `chaosMode` (bot.ts:302-312); (4) `toggleChaosMode(false)` leaves per-pair runtime null → silent `[]` forever (live-strategy-executor.ts:717-719, 264-270); (5) jupiter-swap-adapter returns `'0'` on transport error, conflating "no funds" with "RPC down".

## Goals / Non-Goals

**Goals:**
- Chaos always drives the real strategy machinery (StrategyEngine → markers → scheduler → executor → DEX) even when the wallet is empty/unreachable, using a simulated equity floor.
- Every candle produces an observable outcome (signal / explicit no-op reason / error); per-candle errors are surfaced over WS instead of swallowed.
- `chaosMode` survives `POST /configure`; toggling persists to disk; the frontend badge reflects the engine's actual mode.
- Toggling chaos off resumes normal strategy execution (runtime rebuilt).
- Each fix lands as its own commit with a regression test.

**Non-Goals:**
- Chaos-as-driver refactor (single shared `processCandle` path) — deferred, scheduled before the next strategy feature.
- Result-type error taxonomy across the scheduler; RPC retry/backoff; `loadState()`/`strategy-state.json` cleanup.
- Changing the 10%-of-equity sizing contract or introducing paper execution.

## Decisions

### D1: Simulated equity floor, never zero equity
When `realBalance <= 0`, seed the chaos engine with `CHAOS_FALLBACK_EQUITY` (reintroduce the previous documented 10,000 USDC floor) and log loudly with the failure mode (`wallet-empty` vs `rpc-unreachable`) plus "execution layer NOT live-tested". Never pass `qty <= 0` to `engine.entry` — guard at the caller in `processCandleChaos`.
- Alternative considered: hard-require a funded wallet → rejected, turns the test harness into a deployment blocker and re-creates the silent-zero.
- Alternative considered: silent simulated fallback → rejected, lets the execution layer silently stop being tested.
- Trade-off: simulated floor means DEX execution isn't genuinely exercised when the wallet is empty — that is reported loudly rather than hidden.

### D2: Adapter honesty — distinguish empty wallet from RPC down
`jupiter-swap-adapter.getBalance` throws (or returns a Result) on transport errors instead of returning `'0'`. A genuine empty wallet returns `0`; an unreachable provider throws. `fetchUsdcBalance` maps this to the `wallet-empty` / `rpc-unreachable` failure modes.
- Rationale: every downstream decision (equity floor, logging, execution-mode flag) depends on knowing *why* the balance is zero.

### D3: Per-candle heartbeat + candle-error event
- `processCandleChaos` emits a per-candle outcome: `chaos.signal: <action>` / `chaos.noop: <reason>` / error. This is the "never silently vanishes" guarantee — the existing ~2/3 intentional no-op candles become explicit, not ambiguous.
- The scheduler's catch (scheduler.ts:214-223) stays (a tick must not die), but emits a `candle-error` event on the BotEngine emitter (same emitter as `configUpdate`, bot-engine.ts:613) → WS → frontend, plus a `totalCandleErrors` counter alongside the signals counter.
- Execution blocks (risk gate / dust guard / insufficient balance) remain real-strategy-faithful but are reported through the existing `chaosSignal` failure records — blocked-by-risk is a *correct and interesting* outcome, not a hidden one.
- Rationale: the seam for resilience is the catch itself; the seam for observability is the existing emitter.

### D4: SSOT = engine config; configure merges; toggle persists; badge reads engine
- `POST /api/bot/configure` (bot.ts:302-312) switches from rebuild-config-from-validated-fields to merge-into-current-engine-config: read current `engine.config`, apply the validated fields, save. `chaosMode` persists unless the payload explicitly changes it.
- `toggleChaosMode` (bot-engine.ts:595-614) persists via config store (it currently only emits configUpdate).
- Frontend badge (useChaosMode.ts:39-48) reads the engine's mode from `bot:snapshot` (engine truth) instead of `GET /api/bot/config` (disk view).
- Rationale: engine `_config` is the truth; disk is persistence; frontend is a view. All three must agree, engine wins.

### D5: Toggle-off restores the compiled runtime
`clearChaosGenerator` (live-strategy-executor.ts:717-719) rebuilds each pair's state through the non-chaos branch of `initializeStrategy` (compile runtime + engine) instead of only clearing the generator. Symmetry with `setChaosGenerator` prevents drift — both are "rebuild state for mode".
- Rationale: currently toggling chaos off silently disables ALL trading (runtime null → `[]`). This is a correctness bug, not polish.

## Risks / Trade-offs

- [Risk gate `maxDailyLoss=0.4526` blocks all buys after one loss] → Execution blocks are reported as observable `chaosSignal` failure records with reasons; the heartbeat keeps showing signals were generated. No silent position starvation.
- [Sim-vs-real equity drift: engine equity is simulated PnL, wallet moves independently] → Loud logging; chaosSignal records carry success/failure per order. Acceptable for a test harness.
- [Toggle storms racing in-flight candles] → Known limitation: the scheduler mutex (scheduler.ts:233) wraps only submitOrders (Phase 2); processCandle (Phase 1) runs outside it, so one in-flight candle can emit chaos signals after a toggle-off. Benign single-candle lag, accepted; toggles are not held for tick completion.
- [Restart silently reverts mode] → Toggle persists (D4); startup loads persisted value.
- [Chaos burns real fees on random swaps] → 10% sizing limits exposure; UI already warns "CHAOS MODE ACTIVE"; heartbeats make every trade visible.
- [Adapter throwing changes call sites] → `fetchUsdcBalance` is the only balance caller in the chaos path (live-strategy-executor.ts:766-774); contain the throw handling there, add unit tests for both failure modes.

## Migration Plan

- No schema/migration: `chaosMode` field already exists in `BotConfig`; the fallback equity constant is additive.
- Rollback: each fix is one commit; revert in reverse order. Toggle persistence and configure-merge are isolated to their endpoints.
- Config files: no changes needed; an existing `bot-config.json` without `chaosMode` defaults to `false` (existing behavior preserved).

## Open Questions

None blocking. The exact runtime trigger of the user's run (balance log line) is diagnostic only — the fix set is identical regardless of which silent-zero path fired.
