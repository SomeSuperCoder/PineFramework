# TelegramConfigPanel badge backgrounds use legacy hex
**Date:** 2026-08-08
**Source:** Frontend Engineer F2b (out-of-scope observation)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
TelegramConfigPanel.tsx line ~588 badge backgrounds `#5c6bc0`/`#26a69a` → pf tokens (semantic.infoBg/success or Badge recipes).

## Rationale
§17 token law — repository-wide zero legacy hex end state.

## Evidence
- F2b handoff: "TelegramConfigPanel L588 #5c6bc0/#26a69a badge backgrounds (not in enumerated hex list)"
