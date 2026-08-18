# LinefillRenderer has no unit tests
**Date:** 2026-08-18
**Source:** QA Engineer (fills-merge-acceptance)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Add unit tests for frontend/src/chart/renderers/LinefillRenderer.ts (codegraph reports zero covering tests).

## Rationale
LinefillRenderer is the sole render consumer of ScriptResult.linefills (PineChart.ts). Visual coverage exists via the e2e supertrend-3d-pane spec, but the renderer's fill/region math has no fast unit-level protection. The fills-vanish regression was caught at merge level; renderer-level coverage would harden the full pipeline.

## Evidence
codegraph blast-radius: LinefillRenderer (LinefillRenderer.ts:26) — 3 callers in PineChart.ts; ⚠️ no covering tests found
