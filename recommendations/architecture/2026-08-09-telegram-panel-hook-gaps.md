# Telegram panel hook gaps found during Microtask B
**Date:** 2026-08-09
**Source:** frontend-engineer (Microtask B handoff)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
1. **Admin status slot missing:** `TelegramStatus` has only saveToken/test/proxy; `runAction` swallows errors → AccessControlCard shows optimistic local "Admin saved" callout that can't reflect API failure. Add `admin: SaveStatus` to the hook + `setAdmin` error propagation.
2. **No member-subscription action:** `memberSubscriptions` is read-only in the hook; member Switches render as honest read-only indicators. Add a `setMemberSubscriptions(chatId, userId, types)` action when backend supports it, then flip the Switch to interactive.
3. **linkChat not surfaced** anywhere in the cards — unlinked chats can only re-link via the bot. Consider a future "unlinked chats" subsection.

## Rationale
These are functionality gaps, not styling issues — the panel can't fully express its own state (admin save errors are swallowed, member subscriptions aren't actionable, re-linking requires the bot).

## Evidence
- Microtask B handoff: "Hook gap — no admin status slot", "Hook gap — no member-subscription action", "linkChat is not surfaced".
- useTelegramSettings.ts runAction error-swallowing behavior.
