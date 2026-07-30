## Why

The trading bot has a daily loss limit feature, but it's broken in three ways: (1) the "close all on loss" behavior is a toggle that defaults to off — disabling a critical safety mechanism, (2) it tracks loss by calendar day (timezone-aware) instead of a rolling 24h window, meaning a burst of losses at 11pm resets at midnight and the bot can lose double before triggering, and (3) even when the limit is breached, nothing actually closes positions or sends alerts — the flag is stored but never checked. This is a security gap that can lead to catastrophic losses.

## What Changes

- **BREAKING**: Remove `closeOnLoss` toggle from the config UI — the safety feature is always enabled, not optional
- **BREAKING**: Replace calendar-day loss tracking with a rolling 24h window — PnL from the last 24 hours triggers the guard, regardless of timezone or time of day
- **BREAKING**: Remove `closeOnDailyLoss` from `RiskConfig` — it's always `true`
- Wire `RiskManager` events to `BotEngine` — when daily loss is breached, automatically trigger emergency stop (close all positions, cancel pending orders)
- Send Telegram alert when daily loss triggers emergency stop
- Add `RollingLossGuard` module — pure rolling 24h window, no timezone dependency, tracks realized PnL from trade history

## Capabilities

### New Capabilities
- `rolling-loss-guard`: Rolling 24h loss tracking with mandatory emergency stop and Telegram alert on breach

### Modified Capabilities
- `risk-management` (existing spec if present, otherwise inline): Remove `closeOnLoss` toggle, add mandatory safety behavior
- `bot-engine-lifecycle` (existing spec if present, otherwise inline): Wire RiskManager events to emergency stop and Telegram notifications

## Impact

- **Frontend**: Remove "Close all on loss" checkbox from `BotConfigPanel`, remove `closeOnLoss` from `ConfigValues`
- **Backend**: Remove `closeOnDailyLoss` from route validation and config construction
- **Core**: New `RollingLossGuard` class in `src/trading/risk/`, modify `RiskManager` to use rolling window, add event wiring in `BotEngine`
- **Telegram**: `notifyDailyLossTriggered` message updated, `notifyEmergencyStop` called on daily loss breach
- **Config types**: `RiskConfig.closeOnDailyLoss` removed, `RiskConfig.timezone` may be removed or repurposed
