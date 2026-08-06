## Context

The bot trades live on Solana via Jupiter (buy path fully proven: quote → /swap → v0 tx → sign → send → confirm). `BotEngine.shutdown()` (bot-engine.ts:1318) is the single teardown choke point for `stop()` and `emergencyStop()` and the three internal risk-breach handlers, but it only disconnects the feed and persists state — "close positions" is a `// Phase 2` comment. SIGINT/SIGTERM bypasses the engine entirely (backend/src/index.ts:485). The position truth accessor is `engine.getPositions()` (confirmed-fill gated). The executor already performs reverse swaps on sell signals (base → USDC), and the swap adapters are direction-agnostic.

The design follows the Wise Old Man's advisory contract (verified against the repo) and the spec at `specs/stop-close-all/spec.md`.

## Goals / Non-Goals

**Goals:**
- One close orchestration path used by EVERY stop path (normal, emergency, risk-breach, process signal).
- "Closed" exists only on a confirmed on-chain swap signature; retries can never double-sell.
- The stop always completes (bounded deadline) — a wedged Jupiter cannot trap the bot in Stopping.
- Per-position and aggregate observability tagged with a close-run id.

**Non-Goals:**
- Partial closes, limit/take-profit exits, background retry sweeper, order-cancellation machinery (Solana has no mempool), `finalized` accounting, wallet-balance reconciliation, multi-wallet support. (Full guardrail list in proposal Non-goals.)

## Decisions

1. **New `CloseManager` module (`src/trading/close-manager.ts`), DI'd into `BotEngine`.**
   Rationale: the emergency path must work even if the main loop is wedged; BotEngine carries Phase-2 stubs and shouldn't grow shutdown orchestration; the executor shouldn't own stop semantics. Alternative rejected: bolting it into `shutdown()` (untestable, engine already nulls the executor mid-shutdown).

2. **One `closeAllPositions(reason, mode)` called by both stop paths, where `mode` is a budget, not a mechanism.**
   Emergency = best-effort, per-attempt 20s timeout, global deadline 30s, max 1 retry. Graceful = same path, global deadline 60s, max 3 retries with backoff (1s/2s/4s + jitter). Both stop regardless of close outcome — the deadline guarantees `Stopped`. Rationale: an emergency stop that can't stop is a trap. Alternatives rejected: block-until-all-confirm (availability outage), background retry trader (fights process-exit, is the thing an emergency stop exists to prevent).

3. **Parallel closes via `Promise.allSettled` (not `all`), per-close `withTimeout(20_000)`, `MAX_PARALLEL_CLOSES = 4` guard constant.**
   Rationale: Solana has no nonce sequencing; serialized closes × 20s exceed the ~60s blockhash window with >3 positions; one failing close must not block siblings. Verified: single keypair, independent txs.

4. **Stop sequence: state → `Stopping` FIRST, drain in-flight entry via the scheduler mutex, snapshot `engine.getPositions()`, close, aggregate, state → `Stopped`.**
   The existing StateMachine `Running → Stopping → Stopped` is the single source of truth — no parallel `isStopping` boolean. Entry path re-checks state immediately before sending (double-checked guard). Concurrent close-runs are already rejected by the state machine (`Stopping → {Stopped, Error}` only) and entry guards — verified, no single-flight guard to build.

5. **Chain-truth contract: `CloseResult = { status: 'closed', txSignature } | { status: 'failed', error } | { status: 'timed_out' }`.**
   Only `'closed'` removes the position and mutates state (remove from getPositions → emit `position_closed` → persist). Failed/timed-out leave the position on-chain + in getPositions + emit `close_failed`. Quantity = full snapshot quantity from the position record, never re-derived from wallet balance. This is the anti-sim-divergence rule — sim state is never close evidence.

6. **No-double-sell retry rule.**
   Retry only provably-safe errors (timeout, network, 5xx, 429, blockhash/quote-expired). On ambiguous outcome (send returned a signature, confirm timed out): do a single read-only `getTransactionStatus(signature)` check — success = closed, failure/not-found = failed (no retry). Never retry if the position is no longer in `engine.getPositions()`. **Enabler:** the swap adapter's failure path will carry the send signature (additive optional `signature` on failed `SwapResult`) — currently dropped (verified blocker). `getTransactionStatus` exists on the adapter contract (real in jupiter-swap, stub in jupiter-ultra — the engine uses jupiter-swap).

7. **Observability: events `stop_started`, `close_started`, `position_closed`, `close_failed`, `stop_completed` (aggregate), all tagged `closeRunId`.**
   `close_failed` warning delivered via existing Telegram `notifyWarning()` (guarded `if (this.telegramBot)`, matching loss-breach pattern) + in-process `recordError(..., ErrorSeverity.Warning)` so `GET /api/bot/status` surfaces it. No new WS channel in v1 (verified: `error` event is not WS-wired; adding a channel is extra scope).

8. **SIGINT/SIGTERM joins the engine stop path.**
   backend/src/index.ts `shutdown(signal)` will call the engine's stop sequence (graceful close) before closing the server, with a forced-exit fallback timer (existing 10s forced exit preserved). Verified: today it never touches the engine.

## Risks / Trade-offs

- [Confirm race → double-sell] → Ambiguity rule: `getTransactionStatus` check before any retry; if RPC unavailable, degrade to "ambiguous = failed, no retry" (safe, less complete).
- [Orphaned entry confirmed after snapshot] → Mutex drain + double-checked guard; residual sliver (RPC lost response) is the pre-existing divergence-bug family — logged, not solved here.
- [Deadline hits while a swap later confirms] → Aggregate says failed but wallet shows closed; the warning channel + txSignature trail tells the operator to verify. Accepted.
- [Persistence throws mid-close] → Signature is truth; log loudly; never roll back a confirmed close.
- [`getTransactionStatus` returns `'unknown'` (ultra adapter stub)] → Engine hardcodes jupiter-swap (real status); close manager operates on the concrete adapter, not the generic stub.
- [SIGINT/SIGTERM close adds latency to process exit] → 10s forced-exit fallback already exists; closes are bounded by the graceful deadline and best-effort on signals.

## Migration Plan

- Pure additive: new `CloseManager` file + DI option; stop paths gain a call; adapter gains optional failure signature (non-breaking); backend signal handler gains an engine-stop call.
- Rollback: revert the commit(s); the old behavior (stop without closes) is restored with no data migration.
- Deploy note: real-money behavior change — verify on a test/small wallet first.

## Open Questions

None blocking. Deferrable: whether a future WS `bot:warning` channel should replace Telegram-only delivery (frontend scope), and whether `finalized` reconciliation should ever be added.
