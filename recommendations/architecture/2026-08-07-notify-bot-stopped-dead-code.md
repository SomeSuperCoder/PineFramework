# notifyBotStopped is dead code — "Bot Stopped" lifecycle notification never fires
**Date:** 2026-08-07
**Source:** Bug Hunter (force-close notification investigation)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
`TradingTelegramBot.notifyBotStopped` (backend/src/trading/telegram-bot.ts:114-130) has ZERO callers in production code. backend/src/index.ts already routes `kindToType('bot_stopped')` → `'bot_lifecycle'` (index.ts:432-436), so the routing seam exists. Consider calling it from `BotEngine.stop()`/`emergencyStop()` completion so users get a "Bot stopped" lifecycle message when they stop the bot.

## Rationale
Users who stop the bot currently get per-position close notifications (after the force-close fix) but no lifecycle "bot stopped" message. The function was clearly written for this purpose — it's just never wired.

## Evidence
- telegram-bot.ts:114-130 — definition, 0 callers (repo-wide grep)
- index.ts:432-436 — `bot_stopped` routing already wired

## Note
Do NOT add a "bot stopped" prefix/text to the position-close notification — the force-close bug explicitly decided identical format to natural close. This is a separate lifecycle message.
