# Pre-existing failures unrelated to localization (separate microtasks)
**Date:** 2026-08-07
**Source:** team/quality/test-engineer + team/quality/qa-engineer
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Two backend suites fail independently of this change and will trip any full `pnpm test` gate. Fix them as their own microtasks.
1. `backend/tests/stop-engine-shutdown.test.ts` — suite-load failure (0 tests): imports src/index.ts -> TelegramBotFeature.install() on a transport mock whose TelegramService lacks `registerBotCommand` -> `TypeError`. Not from the localization diff (code path byte-identical to HEAD; index.ts 0-diff; pristine-HEAD worktree fails too).
2. `backend/tests/bug-repro/notification-truthiness-repro.test.ts` — intentionally-RED repro for the separate user-reported bug "notifications menu lies" (fresh private chat shows all ⬜/✅ mismatch). Report-and-route, don't delete.

## Rationale
A green full-suite gate is impossible until these resolve; both are pre-existing/out-of-scope but will be mistaken for regressions by a future gate.

## Evidence
QA full-suite run: 543/544 green (2 files red, both above).