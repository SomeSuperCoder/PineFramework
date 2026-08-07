# REST link/unlink routes intentionally retained (bot surface scrapped)
**Date:** 2026-08-07
**Source:** QA Engineer (link/unlink scrap verification)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
The REST API still exposes `POST /settings/telegram/chats/:chatId/link|unlink` (`backend/src/routes/settings.ts:339-363`) and wires `store.linkChat/unlinkChat` (`backend/src/index.ts:231-233`). The bot-surface link/unlink feature was scrapped per directive, but this operator/HTTP surface was retained as out-of-scope.

Options for the Director:
1. **Remove** the REST routes + store `linkChat/unlinkChat` + their tests (full scrap, consistent with the directive).
2. **Document as legacy** operator surface (the web dashboard is display-only for subscriptions, so these routes have no current UI caller).

## Rationale
Keeps the codebase honest about which surfaces still support link/unlink. If the directive's intent covers the operator panel too, the routes are dead weight; if not, they are undocumented legacy that will confuse the next engineer.

## Evidence
- `backend/src/routes/settings.ts:339-363` — link/unlink route handlers (verified by QA, untouched by the scrap)
- `backend/src/index.ts:231-233` — route wiring for linkChat/unlinkChat
- `TelegramBotFeature.ts` — bot surface now has zero link/unlink emitters (committed 8913012)
