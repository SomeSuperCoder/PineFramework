## 1. Config Schema & Validation

- [x] 1.1 Add `maxDailyWalletLossUsdc: number` (default `0`, whole USDC, comment: 0 = unlimited) to `RiskConfig` in `src/trading/types.ts`
- [x] 1.2 Extend `RiskConfig` validation in `src/trading/config-store.ts` to require `maxDailyWalletLossUsdc >= 0` (reject negative)
- [x] 1.3 Reconcile stale test config keys (`closeOnLoss`, `dailyLossTimezone`) in `tests/unit/trading/*` with source types (`DailyStopLossConfig`/`RiskConfig`)
- [x] 1.4 Add/update `config-store.test.ts` cases: valid positive, `0` = unlimited, negative rejected

## 2. WalletBalanceGuard Implementation

- [x] 2.1 Create `src/trading/risk/wallet-balance-guard.ts` with class `WalletBalanceGuard` (pure logic, bigint micro-USDC): config `{ maxDailyWalletLossUsdc: number, timezone: string }`, `updateBalance(balance: bigint, now?)`, lazy day-start capture, monotonic high-water reference (D3), `loss`, `isBreached`, `canEnterPosition`, `resetDay`, `getConfig`/`updateConfig` — reuse `getTradingDayStart()` from `daily-stop-loss.ts` (D4); `maxDailyWalletLossUsdc <= 0` means unlimited
- [x] 2.2 Add `wallet_balance_breached` to `RiskEventType` in `src/trading/risk/risk-manager.ts` and thread the new guard through `RiskManager` config + `canEnterPosition()` + `recordBalance(balance: bigint, now?)` method that evaluates and emits the event
- [x] 2.3 Export `WalletBalanceGuard` and new types from `src/trading/risk/index.ts`
- [x] 2.4 Write unit tests `tests/unit/trading/wallet-balance-guard.test.ts`: day capture, new-day reset, high-water reference, breach at threshold, below threshold, unlimited (0), fail-safe skip semantics (fetch failures are caller-side)

## 3. Live Path Wiring

- [x] 3.1 Construct `RiskManager` in production bootstrap (`backend/src/index.ts`) from loaded `BotConfig.risk` (dailyLoss timezone + maxDailyLoss + new maxDailyWalletLossUsdc) and pass via `BotEngineOptions` (degrade gracefully when absent)
- [x] 3.2 Feed realized PnL: in `LiveStrategyExecutor` (or engine post-trade hook), call `riskManager.recordTrade(realizedPnl)` after each completed trade
- [x] 3.3 Feed balance snapshots: after each completed trade and once per candle, call `fetchUsdcBalance()` (reuse existing, D6) and `riskManager.recordBalance(balance)`; wrap in try/catch — on failure log + skip, never block trading (spec: fail-safe)
- [x] 3.4 Subscribe in `BotEngine` constructor to `daily_loss_breached` and `wallet_balance_breached` → Telegram notify (distinct source label) + `emergencyStop()`, mirroring `handleRollingLossBreached`; ensure already-breached state stays stopped across fetch failures
- [x] 3.5 Export any new config/type surface needed by backend from `src/trading/index.ts`

## 4. Tests & Verification

- [x] 4.1 Extend `tests/unit/trading/risk-manager.test.ts`: recordBalance evaluation, wallet_balance_breached emission, canEnterPosition blocked after breach, new-day reset via recordBalance
- [x] 4.2 Extend `tests/unit/trading/bot-engine.test.ts`: daily_loss_breached and wallet_balance_breached events trigger emergencyStop + telegram
- [x] 4.3 Extend `tests/unit/trading/live-strategy-executor.test.ts`: recordTrade called after close, balance snapshot fed after trade + per candle, fetch failure logs + skips without blocking
- [x] 4.4 Run lint, typecheck, and affected unit tests (`pnpm` via Justfile); fix failures; run full trading test suite before final commit
