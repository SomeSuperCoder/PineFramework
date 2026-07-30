## 1. RollingLossGuard Module

- [x] 1.1 Create `src/trading/risk/rolling-loss-guard.ts` with `RollingLossGuard` class
- [x] 1.2 Implement rolling 24h buffer: `addTrade(timestamp, pnl)`, `prune()`, `totalLoss()`
- [x] 1.3 Implement `isBreached(maxLoss)` check
- [x] 1.4 Implement `canEnterPosition(maxLoss)` check
- [x] 1.5 Export from `src/trading/risk/index.ts`

## 2. RiskManager Integration

- [x] 2.1 Add `RollingLossGuard` instance to `RiskManager`
- [x] 2.2 Add `rolling_loss_breached` to `RiskEventType` union
- [x] 2.3 Update `RiskManager.recordTrade()` to check rolling guard after recording
- [x] 2.4 Emit `rolling_loss_breached` event when guard triggers
- [x] 2.5 Update `RiskManager.canEnterPosition()` to check rolling guard

## 3. BotEngine Wiring

- [x] 3.1 Subscribe to `RiskManager` events in `BotEngine`
- [x] 3.2 On `rolling_loss_breached`: call `emergencyStop()` (close positions, cancel orders)
- [x] 3.3 On `rolling_loss_breached`: call `TradingTelegramBot.notifyDailyLossTriggered()` with rolling loss details
- [x] 3.4 On `rolling_loss_breached`: call `TradingTelegramBot.notifyEmergencyStop('daily_loss')`

## 4. Config Cleanup

- [x] 4.1 Remove `closeOnDailyLoss` from `RiskConfig` in `src/trading/types.ts`
- [x] 4.2 Remove `closeOnDailyLoss` from `DailyStopLossConfig` in `daily-stop-loss.ts`
- [x] 4.3 Remove `closeOnLoss` checkbox from frontend `BotConfigPanel`
- [x] 4.4 Remove `closeOnLoss` from `ConfigValues` interface
- [x] 4.5 Update backend route to ignore `closeOnDailyLoss` (backward compatible)
- [x] 4.6 Remove `dailyLossTimezone` from `RiskConfig` (rolling 24h is timezone-independent)

## 5. Telegram Updates

- [x] 5.1 Update `notifyDailyLossTriggered()` to include rolling window details
- [x] 5.2 Add rolling loss info to emergency stop message

## 6. Testing

- [x] 6.1 Unit test `RollingLossGuard`: buffer management, 24h expiry, breach detection
- [x] 6.2 Unit test `RiskManager.recordTrade()` triggers rolling guard
- [x] 6.3 Integration test: bot stops and sends Telegram on rolling loss breach
- [x] 6.4 Verify `maxDailyLoss = 0` disables the guard
