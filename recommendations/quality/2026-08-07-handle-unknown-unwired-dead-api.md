# handleUnknown is unwired dead API — document or delete
**Date:** 2026-08-07
**Source:** QA Engineer (command-removal sign-off)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
`handleUnknown` (backend/src/telegram/TelegramBotFeature.ts:417) remains as a public method but is deliberately NOT wired (button-only install — no text handler exists). Either (a) document in the class docblock that re-introducing a text seam would violate the button-only directive, or (b) delete it if no transport will ever need it.

## Rationale
Prevents a future silent foot-gun: someone re-adding a text handler and discovering `handleUnknown` already exists, without understanding the button-only decision.

## Evidence
- TelegramBotFeature.ts:417 — handleUnknown definition, no callers
- No `bot.on('text')` / registerBotText in TelegramService.ts (verified 0 hits post-change)
