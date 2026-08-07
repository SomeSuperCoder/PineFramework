# buildTypeKeyboard indentation + report-format.test.ts trailing newline
**Date:** 2026-08-07
**Source:** team/quality/code-reviewer (approved, minor)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Fix the cosmetic-only mis-indentation of `buildTypeKeyboard` (TelegramBotFeature.ts:1227, dedented out of class-body alignment — still inside class, typecheck passes) and add a trailing newline to report-format.test.ts.

## Rationale
Code hygiene; Prettier would flag both.

## Evidence
Code review findings, APPROVE verdict with these as the only MINOR nits.