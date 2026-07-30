## Context

The trading bot's risk management system has a `DailyStopLoss` class that tracks realized PnL, but it's not wired to any action. The `BotEngine` has `emergencyStop()` but nothing calls it when loss is breached. The `RiskManager` emits events but nobody listens. The UI has a toggle for "Close all on loss" that does nothing.

The core problem: the safety mechanism exists in pieces but never fires.

## Goals / Non-Goals

**Goals:**
- Mandatory rolling 24h loss guard that always runs (no toggle)
- Emergency stop + close all positions when rolling 24h loss exceeds limit
- Telegram alert on breach
- Clean separation: safety guard vs calendar-day reporting

**Non-Goals:**
- Calendar-day loss tracking (can be added later for reporting dashboards)
- Partial position closing (all-or-nothing)
- Configurable window size (24h is fixed for v1)
- Recovery after trigger (user must manually restart bot)

## Decisions

### 1. New `RollingLossGuard` class, not modifying `DailyStopLoss`

**Choice:** Create a new `RollingLossGuard` in `src/trading/risk/rolling-loss-guard.ts`.

**Rationale:** `DailyStopLoss` serves a different purpose — calendar-day tracking for reporting. Mixing rolling-window safety logic into it would muddy responsibilities. A dedicated guard is simpler, testable in isolation, and doesn't break existing calendar-day code that might be used for dashboards.

**Alternatives considered:**
- Modify `DailyStopLoss` to support both modes: adds complexity, conflates reporting with safety
- Add rolling check directly in `RiskManager`: couples safety logic to the orchestrator

### 2. Rolling 24h window via trade history buffer

**Choice:** Maintain a circular buffer of `{ timestamp, pnl }` entries. On each trade, add entry, prune entries older than 24h, sum the PnL.

```
Trade history buffer (last 24h):
┌─────┬─────┬─────┬─────┬─────┐
│ +$5 │ -$3 │ -$4 │ +$2 │ -$1 │
└─────┴─────┴─────┴─────┴─────┘
                  ▲
                  │ 24h ago
                  
Sum: -$1 → if > maxLoss → BREACH
```

**Rationale:** Simple, no timezone dependency, no clock edge cases. The buffer naturally expires old entries. Memory is bounded (one entry per trade, pruned every 24h).

**Alternatives considered:**
- Track `now - 24h` cutoff and sum all trades: requires scanning full history each time
- Use `DailyStopLoss` with timezone at UTC and reset every 24h: still has midnight reset gap

### 3. Wire via RiskManager event emission

**Choice:** `RiskManager.recordTrade()` already calls `DailyStopLoss.recordTrade()` and emits `daily_loss_breached`. Add a parallel rolling check in `RiskManager` that emits a new event type `rolling_loss_breached`.

**Rationale:** `RiskManager` is the natural event source. `BotEngine` subscribes to risk events and triggers emergency stop + Telegram on `rolling_loss_breached`.

### 4. Remove `closeOnDailyLoss` from config entirely

**Choice:** Delete the field from `RiskConfig`, `DailyStopLossConfig`, frontend UI, and backend validation.

**Rationale:** The safety guard is mandatory. A toggle for a safety feature is a footgun. If someone wants to disable it, they should set `maxDailyLoss: 0` (unlimited) instead.

## Risks / Trade-offs

- **[Risk] Trade history buffer memory** → Mitigation: Buffer is pruned on every trade, max ~thousands of entries for active trading. Negligible.
- **[Risk] Missed trades if bot crashes between trade and guard check** → Mitigation: Guard checks on every `recordTrade()` call, which happens immediately after trade execution. The window is tight.
- **[Risk] Breaking change for existing configs** → Mitigation: `closeOnDailyLoss` is removed. Existing configs with it set to `true` will silently ignore it (no error). Configs with `false` will now have the guard active (safer, not breaking behavior).
- **[Trade-off] 24h window not configurable** → Acceptable for v1. Can add config later if needed.
