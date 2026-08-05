# Design: Wallet Balance Safety Guard + Live Risk Wiring

## Context

See proposal.md - Why. Current state (verified from source):

- Two PnL-based guards exist (`DailyStopLoss`, `RollingLossGuard`) composed in `RiskManager`, but **neither runs in production**: `RiskManager` is never instantiated in `backend/src/index.ts`, `recordTrade()` is never called from the live path, and `BotEngine` only subscribes to `rolling_loss_breached`.
- Wallet USDC balance is obtainable via `DexAdapter.getBalance(USDC_MINT, pubkey)` → `{ amount: string, decimals }` in smallest units (USDC = 6 decimals, 1 USDC = 1e6). `LiveStrategyExecutor.fetchUsdcBalance()` already exists (chaos mode only).
- There is **no baseline, no balance store, no polling**. `RiskManager` currently has no async/dex dependency — guards are push-fed via `recordTrade(pnl)`.
- Timezone-aware trading-day boundary logic exists in `DailyStopLoss.getTradingDayStart()` and is reusable.
- Unit traps: `jupiter-ultra-adapter.getBalance()` always returns `'0'`; `JupiterSwapAdapter` silently returns zero on RPC error; micro-USDC vs "lamports" naming confusion.

## Goals / Non-Goals

**Goals:**
- Add an independent balance-based max-daily-loss guard (config, day baseline, monotonic reference, breach detection, fail-safe fetch semantics).
- Make the existing PnL daily-loss guard actually live (instantiate `RiskManager`, feed realized PnL, handle `daily_loss_breached`).
- Ensure breaches (PnL daily loss and wallet balance) trigger `BotEngine.emergencyStop()` with Telegram notification, mirroring rolling-loss wiring.

**Non-Goals:**
- No balance persistence service / poller (guard is fed snapshots by callers).
- No changes to rolling guard behavior, position sizing, or dust threshold.
- No fix for `status.balance` hardcoded 0, `/api/bot/wallet/balance` unit mismatch, or ultra adapter stub.
- No real order-cancellation/position-close actions on emergency stop (still `// Phase 2` stubs).

## Decisions

### D1: `WalletBalanceGuard` is a pure logic class; callers feed snapshots
`WalletBalanceGuard` takes `updateBalance(balance: bigint, now?: number)` and internally manages day boundary + high-water reference. It never fetches — the executor/engine pulls balance and feeds it.

- **Why:** Keeps `RiskManager` free of async/dex dependencies (it is currently synchronous and heavily unit-tested). Makes the guard trivially testable with synthetic snapshots. Matches the existing push-fed pattern (`recordTrade(pnl)`).
- **Alternative rejected:** Injecting `DexAdapter` into `RiskManager` — couples risk to transport, complicates every existing `RiskManager` test, and breaks the synchronous contract.

### D2: Units — config in whole USDC, comparison in micro-USDC bigint
`risk.maxDailyWalletLossUsdc` is user-facing whole USDC (`number`); internally converted to `bigint` micro-USDC (`× 1_000_000n`) for comparison against `getBalance` output.

- **Why:** User-facing clarity (matches existing `maxDailyLoss` "quote currency" convention); avoids float precision issues (`Number(bigint)` is lossy above ~9e15 micro-units ≈ 9e9 USDC) by doing all guard math in `bigint`.
- **Alternative rejected:** Config in micro-USDC — error-prone, inconsistent with the rest of `RiskConfig`.

### D3: Monotonic high-water-mark reference
Reference starts at the first balance of the day and only rises. Loss = `max(0, reference − current)`. Breach when `loss ≥ maxDailyWalletLossUsdc`.

- **Why:** Given the user's assumption (wallet untouched during runtime), deposits are impossible, so any rise is trading gain — banking it is strictly safer (a gain-then-giveback is still stopped, whereas a fixed day-start baseline would not). This is the "super safe" semantics requested.
- **Alternative rejected:** Fixed day-start baseline — simpler but less conservative; a strategy that gains 10 USDC then loses it would not trigger while PnL math might also be wrong.

### D4: Reuse `getTradingDayStart()` for day boundary
Day reset reuses the timezone-aware trading-day computation from `daily-stop-loss.ts` so both guards agree on what "daily" means.

- **Why:** SSOT for day boundaries; consistent operator mental model.

### D5: Fail-safe on fetch failure
If balance fetch fails (or the adapter returns a known-unusable stub result), log + skip evaluation. Never trigger a breach on a failed fetch. An armed breach persists — the bot stays stopped.

- **Why:** A transient RPC error must not emergency-stop a healthy bot, and a stale/missing read must not resume a stopped one. ABC: `JupiterSwapAdapter` silently returns zero on error and `jupiter-ultra-adapter` always returns zero — treating zero as truth would be catastrophic.
- **Mitigation:** Callers distinguish "fetched successfully" from "failed" (throw/return null on failure rather than zero).

### D6: Wiring — minimal production changes
1. `backend/src/index.ts` constructs `RiskManager` from `BotConfig.risk` + new `maxDailyWalletLossUsdc`, passes it via `BotEngineOptions`.
2. `BotEngine` subscribes to `daily_loss_breached` and new `wallet_balance_breached` → Telegram + `emergencyStop()` (copy `handleRollingLossBreached` pattern).
3. `LiveStrategyExecutor` calls `riskManager.recordTrade(realizedPnl)` after each closed trade and feeds balance snapshots (`updateBalance`) after trades + once per candle via a new engine-level hook (executor already owns `dex`).
4. Optional risk config → degrade gracefully (no crash).

- **Why:** Smallest diff that makes the guard real; keeps the existing DI shape (`BotEngineOptions.riskManager?`).
- **Alternative rejected:** Rewiring the scheduler to call `canEnterPosition()` before every entry — larger blast radius in the live path; deferred.

### D7: New event type + config field
Add `wallet_balance_breached` to `RiskEventType`; add `maxDailyWalletLossUsdc: number` to `RiskConfig` (default 0) + `config-store.ts` validation (`>= 0`). Reconcile stale test config keys (`closeOnLoss`, `dailyLossTimezone`) with source types.

## Risks / Trade-offs

- **Per-candle balance fetch adds RPC load** → Only capture once per candle close + after trades (not per signal); reuse `fetchUsdcBalance()`; failures skip silently.
- **Zero-balance stub adapters (ultra) could false-trigger** → Fail-safe skip on fetch failure; guard is documented ineffective when the selected adapter cannot return real balances.
- **Live-path wiring risk (real money)** → Minimal, additive changes; every behavior unit-tested; no changes to order sizing/execution logic.
- **High-water mark can raise reference on gains, hiding a subsequent loss back to day-start** → Intentional (D3); the goal is stopping real drawdowns from peak, not matching PnL exactly. This is the conservative "super safe" choice and is documented in the spec.
- **Telegram on new breach event needs a message** → Reuse `notifyEmergencyStop`/`notifyDailyLossTriggered` with a distinct source label.

## Migration Plan

- Additive config: existing `bot-config.json` files without `maxDailyWalletLossUsdc` default to `0` (unlimited) — no migration required.
- Rollback: revert the wiring commit; risk manager becomes unused again (same as today).

## Open Questions

None — decisions above are sufficient to implement without changing specs or task breakdown.
