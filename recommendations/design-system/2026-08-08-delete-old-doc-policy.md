# Delete old design doc with grep-zero gate, don't archive as live
**Date:** 2026-08-08
**Source:** team/lead/frontend-lead (orchestration plan, W6)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
At the final gate, delete `frontend/src/CONTROL-PANEL-DESIGN.md` after a repository grep proves zero live references and zero legacy hex. Keep the legacy mapping table inside `DESIGN-MIRO-DARK.md` (nothing is lost); do not keep the old doc as a secondary source of truth.

## Rationale
"Remove all trace of the old design system" is the Director's law; a second design doc = divergence risk.

## Evidence
frontend/src/CONTROL-PANEL-DESIGN.md (907 lines) is the source of the old tokens.
