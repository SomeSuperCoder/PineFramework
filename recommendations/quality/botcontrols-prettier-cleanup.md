# BotControls.tsx — 143 pre-existing prettier violations
**Date:** 2026-08-13
**Source:** frontend-engineer (native-selects-shadcn wave)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Run `eslint --fix` (or prettier --write) on `frontend/src/components/bot/BotControls.tsx` as a dedicated formatting microtask. The select swap netted −13 violations; the remainder are pre-existing (TIMEZONE_GROUPS arrays, wallet panel, auto-select regions) and untouched by this change.

## Rationale
Untouched-by-task lint debt makes every future diff to this file noisy and makes the eslint-gap recommendation (frontend-eslint-gap) harder to land cleanly.

## Evidence
`eslint BotControls.tsx` at HEAD reported 143 prettier/prettier errors before this change; after the swap 130 remain, with the 4 modified regions byte-identical to prettier's output.
