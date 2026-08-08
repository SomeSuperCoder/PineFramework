# OpenSpec strict-validation pre-existing failures
**Date:** 2026-08-08
**Source:** Documentation Writer (spec-sync during bulk archive)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Fix the 3 pre-existing `openspec validate --strict` failures in specs untouched by the archive: `getMaxLookback-completeness`, `manual-select-dropdowns`, `token-type-system`.

## Rationale
They block a fully-green `openspec validate --all --strict` gate. Not regressions from the archive — they pre-date it.

## Evidence
`openspec validate --all --strict` → 109 passed, 3 failed (the three specs above).
