# Hardening: i18n asterisk-balance + shared mock-reset in telegram tests
**Date:** 2026-08-07
**Source:** QA (R2) + Test Engineer (Global PnL report)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr) each

## 1. Assert i18n '*' are balanced
The report i18n strings use literal `*bold*` pairs; `escapeMarkdownV2` preserves `*` so unbalanced bold would cause a Telegram 400. Add a unit assert scanning all 51 keys × 3 dicts that every `*` is balanced (a `*in task` count parity test). Prevents silent bold-injection breakage if an operator edits i18n later.

## 2. Shared resetAllMocks pattern in telegram tests
`telegram-feature.test.ts` relies on a module-level mock of `renderGlobalPnlCard` whose call-history must be manually cleared (`beforeEach(vi.clearAllMocks)`). A shared harness that owns reset-on-create would prevent future call-history accumulation bugs across telegram test files.

## Evidence
QA R2; Test Engineer recovery handoff (module-mock reset fix + recommendation).