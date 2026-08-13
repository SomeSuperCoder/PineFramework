# chunk-boundary.spec.ts:174 — cold-loaded indicator-label delivery flake
**Date:** 2026-08-13
**Source:** qa-engineer (M6 acceptance gate)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Investigate the pre-existing `chunk-boundary.spec.ts:174` failure — cold-loaded indicator labels are not delivered/rendered deterministically on first load. Reproduces identically on baseline (without motion code); motion diff touches zero files in that path (commits `0e88586`/`d3080a0` area).

## Rationale
The e2e gate currently ships with a known flaky spec. It is NOT caused by the animations pass (QA proved via baseline reproduction), but it degrades the regression net and will keep tripping future gates.

## Evidence
- QA handoff: `data/handoffs/team/quality/qa-engineer/acceptance.json`
- Spec: `frontend/e2e/chunk-boundary.spec.ts:174` — indicator-label delivery on cold load
- Reproduces on baseline without motion code (verified by QA during triage)
