# Telegram Settings Panel — remaining test coverage gaps
**Date:** 2026-08-09
**Source:** Test Engineer
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Cover the two TelegramConfigPanel cards built in parallel with this redesign
(AccessControlCard, RecipientsCard) once delivered, plus two thin hook paths
that unit coverage did not exercise: `loadConfig` error state (fetch rejects →
`error` string set) and the `runAction`-driven actions (`approveRequest`,
`denyRequest`, `removeController`, `updateChatLanguage`, `linkChat`,
`unlinkChat`) which currently have zero direct tests.

## Rationale
AccessControlCard/RecipientsCard contain the admin/controller/chat management
UI — the panel's second-largest behavior surface — and shipped with no tests,
same as the rest of the panel before this change. The hook's `runAction` path
wraps every non-token mutation; an untested wrapper is a silent regression risk
for the busy-key lifecycle (`busy.approve:1` etc.).

## Evidence
- New coverage: `frontend/src/__tests__/telegram-api.test.tsx` (19),
  `use-telegram-settings.test.tsx` (10), `connection-card.test.tsx` (9),
  `diagnostics-card.test.tsx` (6), `telegram-shared.test.tsx` (8) — 52 tests.
- Untested (delivered in parallel / out of scope): AccessControlCard.tsx,
  RecipientsCard.tsx, hook `runAction` actions, `loadConfig` reject branch.
