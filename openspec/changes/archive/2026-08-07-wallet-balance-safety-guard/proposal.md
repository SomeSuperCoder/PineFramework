## Why

The bot's daily-loss protection is PnL-calculation-based and, worse, not actually wired into the live trading path: `RiskManager` is never instantiated in production, `recordTrade()` is never called by the live executor, and the `daily_loss_breached` event is unhandled by `BotEngine`. If PnL math is wrong (unit bugs, precision loss, missed trades), the safety net silently does nothing. We need a second, independent safety guard that measures the *actual wallet USDC balance* so an emergency stop still fires when real losses occur — even if PnL accounting is broken. We also need to make the existing PnL daily-loss guard actually live.

## What Changes

- **Add `WalletBalanceGuard`** (new capability): a max-daily-loss guard whose source of truth is the real on-chain USDC balance, not PnL. It captures a reference balance (day start, rising monotonically via high-water mark) and triggers a breach when the wallet drops below the reference by the configured amount. Assumes the user does not touch the wallet while the bot runs.
- **Add config** `risk.maxDailyWalletLossUsdc` (whole USDC, `0` = unlimited) to `RiskConfig` with validation in `config-store.ts`, defaulting sensibly.
- **Wire `RiskManager` into the live path** (closes existing gap): instantiate it in the bot bootstrap, thread it into `BotEngine`/executor, feed it realized PnL after each closed trade, feed it USDC balance snapshots on a schedule (per candle + after trades), and subscribe breach events (`daily_loss_breached`, new `wallet_balance_breached`) → `BotEngine.emergencyStop()` with Telegram notification, mirroring the existing rolling-loss wiring.
- **Fail-safe semantics**: balance fetch failure (RPC error, zero-balance stub adapters) SHALL log and skip evaluation — it must never trigger or mask an emergency stop.
- **Reconcile stale test config drift** (`closeOnLoss`, `dailyLossTimezone`) discovered in existing tests vs. source types.

## Capabilities

### New Capabilities
- `wallet-balance-safety-guard`: The balance-based max daily loss guard — config, day baseline capture, high-water-mark reference, breach detection, fail-safe on fetch errors.
- `risk-guard-live-wiring`: The live trading path risk enforcement — RiskManager instantiated in production, realized PnL and balance snapshots fed in, breach events triggering emergency stop.

### Modified Capabilities
<!-- None: no existing spec covers the live risk path; both behaviors are new capabilities. -->

## Impact

- **Files**: `src/trading/risk/wallet-balance-guard.ts` (new), `src/trading/risk/risk-manager.ts`, `src/trading/risk/index.ts`, `src/trading/types.ts`, `src/trading/config-store.ts`, `src/trading/bot-engine.ts`, `src/trading/live-strategy-executor.ts`, `backend/src/index.ts`, `backend/src/routes/bot.ts` (config passthrough), Telegram bot notification path, plus unit tests in `tests/unit/trading/`.
- **API**: `RiskConfig` gains `maxDailyWalletLossUsdc`; new `RiskEventType` value `wallet_balance_breached`; new `WalletBalanceGuard` public API.
- **Behavior**: Real wallet losses now halt the bot even when PnL accounting is wrong; existing PnL daily-loss guard becomes live.
- **Risk**: Any live-path wiring touches real trading; keep changes minimal, fail-safe, and fully tested.

## Non-goals

- Changing the rolling 24h loss guard behavior
- Changing position sizing or the dust-trade threshold
- Persisting balance history or a periodic balance poller service (guard is fed snapshots)
- Fixing the frontend balance display (`status.balance` hardcoded 0) or the `/api/bot/wallet/balance` unit mismatch
- Making `jupiter-ultra-adapter.getBalance()` return real balances
- Full close-position/order-cancellation actions on emergency stop (still stubbed `// Phase 2`)
