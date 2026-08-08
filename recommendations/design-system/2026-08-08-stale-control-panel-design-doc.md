# Refresh CONTROL-PANEL-DESIGN.md to Miro-dark tokens
**Date:** 2026-08-08
**Source:** qa-engineer (adoption QA gate)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
`frontend/src/CONTROL-PANEL-DESIGN.md` still documents the legacy palette (`#0d0d18`, `#0f1520`, `#e94560`). Refresh it to the Miro-dark token palette or delete it in favor of `frontend/src/DESIGN-MIRO-DARK.md` (the LAW doc).

## Rationale
A stale design doc keeps the old palette alive as a "law" for any future frontend work. The acceptance grep flagged it as the ONLY non-token source of legacy hex in the repo. A developer reading the wrong doc could reintroduce legacy values.

## Evidence
- QA criterion-4 grep: matches only `theme/tokens.ts` (SSOT) + `CONTROL-PANEL-DESIGN.md` (doc).
