# Route notification PnL through the SSOT net (display-only gap)
**Date:** 2026-08-09
**Source:** qa-engineer (M9 re-gate), code-reviewer (M9 re-gate)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Route the `bot-engine.ts` notification path (`buildPositionNotificationTrade` ~1530, `buildClosedTradeFromPositionInfo` ~1586) through the module's `RealizedPnl` (or drop PnL from notification payloads). It still computes inline `(exit − entry) × qty` gross with `fees: 0` for WS/Telegram close notifications.

## Rationale
Not persisted (the store is written only via `persistClosedTradeRecord`), so it doesn't corrupt trade history — but it is a user-visible "PnL shows the truth" gap: a trader's Telegram notification shows gross PnL with zero fees while the dashboard shows net. That's exactly the inconsistency the SSOT change exists to eliminate.

## Evidence
- QA re-gate handoff: "notification path still computes inline (exit − entry) × qty with fees: 0 — user-facing gap vs the SSOT net."
- `bot-engine.ts` `buildPositionNotificationTrade` (~1530-1532), `buildClosedTradeFromPositionInfo` (~1586).
- Store path (`persistClosedTradeRecord`) is the only persistence — notifications are display-only.
