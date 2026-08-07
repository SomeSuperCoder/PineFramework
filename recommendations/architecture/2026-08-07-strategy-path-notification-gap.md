# Strategy (live) path lacks Telegram position-close notification
**Date:** 2026-08-07
**Source:** Bug Hunter (force-close notification investigation) + Scout
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
The LIVE (non-chaos) strategy close path never sends a Telegram `position_close` notification. `LiveStrategyExecutor.persistClosedTradeRecord` (backend/src/trading/live-strategy-executor.ts:1498-1584) builds a truthful TradeRecord then calls `onTradeClosed` (:1577), which in backend/src/index.ts:472-486 only WS-broadcasts. The ONLY `notifyPositionResult` call site is the chaos order-success handler (bot-engine.ts:1190).

## Rationale
Same user-visible gap as the force-close bug just fixed: a trader's position closes naturally from a strategy signal but no Telegram "position closed" message arrives. The fix for force-close built the TradeRecord-from-PositionInfo pattern — the strategy path should reuse it.

## Evidence
- bot-engine.ts:1190 — sole `notifyPositionResult` call (chaos only)
- live-strategy-executor.ts:1577 → index.ts:472 — WS-only broadcast
- Scope decision from force-close bug: deliberately deferred to a follow-up

## Suggested approach
Add the notify call in `persistClosedTradeRecord` (or a `onTradeClosed` handler) reusing `notifyPositionClosed`, with the same never-guess-PnL guards.
