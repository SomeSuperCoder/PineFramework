## 1. Signature-carrying failure path (enabler for no-double-sell)

- [ ] 1.1 Modify `src/trading/solana-wallet.ts` `sendAndConfirmTransactionWithTimeout` so a confirm-timeout still returns the send signature in the error/failure result (capture `signature` before confirm; include in `TransactionResult` failure shape)
- [ ] 1.2 Update `src/trading/dex/dex-adapter.ts` `SwapResult` to document/allow optional `signature` on failure (additive, non-breaking)
- [ ] 1.3 Update `src/trading/dex/jupiter-swap-adapter.ts` swap() failure paths (non-ok response, catch, confirm-failure) to include the signature when one was obtained

## 2. CloseManager module

- [ ] 2.1 Create `src/trading/close-manager.ts` with `CloseManager` class: constructor DI (dex adapter, wallet keypair source, executor/engine accessor, logger, telegram optional)
- [ ] 2.2 Implement `closeAllPositions(reason, mode): Promise<CloseSummary>` — snapshot `engine.getPositions()`, `Promise.allSettled` closes, `MAX_PARALLEL_CLOSES = 4`, per-close `withTimeout(20_000)`, global deadline (30s emergency / 60s graceful via `Promise.race`)
- [ ] 2.3 Implement single-position close: full snapshot quantity → reverse swap (base → USDC) via the proven Jupiter path → confirm → only on confirmed signature return `{status:'closed', txSignature}`; failure/timed-out per contract
- [ ] 2.4 Implement retry policy: retryable-error classification (timeout/network/5xx/429/blockhash-expired), emergency max 1 / graceful max 3 with 1s/2s/4s + jitter backoff; ambiguous confirm → single `getTransactionStatus(signature)` check; never retry if position no longer in getPositions
- [ ] 2.5 Implement state-consistency side effects: on `'closed'` remove position from engine positions + emit `position_closed` + persist; on `'failed'`/`'timed_out'` leave position in place + emit `close_failed`; aggregate `stop_completed` with `closeRunId`
- [ ] 2.6 Wire observability: events `stop_started`, `close_started`, `close_failed` (Telegram `notifyWarning` guarded + `recordError(Warning)`), `stop_completed`; every event/log tagged `closeRunId`

## 3. BotEngine stop integration

- [ ] 3.1 DI `CloseManager` into `BotEngine` (constructor option, mirroring RiskManager wiring)
- [ ] 3.2 Update `stop()` and `emergencyStop()` to: set `Stopping` → drain in-flight processing via scheduler mutex → call `closeManager.closeAllPositions(reason, mode)` → emit aggregate → proceed to `Stopped` (bounded by close deadline; state always reaches Stopped)
- [ ] 3.3 Ensure the entry path double-checks state (`!== Running`) immediately before sending (in-flight race guard)
- [ ] 3.4 Preserve existing `shutdown()` persistence behavior; ensure close happens before the executor reference is nulled

## 4. Process signal integration

- [ ] 4.1 Update `backend/src/index.ts` SIGINT/SIGTERM `shutdown(signal)` to trigger the engine's graceful stop sequence (with close-all) before closing the server; keep the existing forced-exit fallback timer

## 5. Tests

- [ ] 5.1 Unit tests: `CloseManager` — snapshot→close→aggregate happy path; failed close leaves position; timed-out on deadline; ambiguous-confirm → getTransactionStatus check, no auto-retry; retry policy limits; allSettled isolation
- [ ] 5.2 Unit tests: stop paths call close manager (mock CloseManager) — stop() and emergencyStop() both invoke closeAllPositions with correct mode; double-press rejected (state machine, 400)
- [ ] 5.3 Unit tests: signature-carrying failure path — confirm-timeout failure result includes signature; adapter swap() failure returns signature
- [ ] 5.4 Integration/regression: process-signal handler triggers engine stop (mock engine, assert graceful stop called)

## 6. Verification & quality gates

- [ ] 6.1 Typecheck + lint on all changed files (Engineer)
- [ ] 6.2 Code review (Code Reviewer) — diff against spec `stop-close-all` + design decisions
- [ ] 6.3 Security review (Security Engineer) — real-money close path: no double-sell, key handling, no secrets leaked, failure surfaces
- [ ] 6.4 QA acceptance — every spec scenario verified (close on all stop paths, chain-truth gating, deadline boundedness, observability), GO/NO-GO
