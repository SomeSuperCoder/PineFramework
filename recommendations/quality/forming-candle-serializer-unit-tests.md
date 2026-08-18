# FormingCandleManager serializers lack direct unit tests
**Date:** 2026-08-18
**Source:** QA (contract-refactor-acceptance)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Add direct unit tests for FormingCandleManager.toOutputs and toFormingCandleOutputs (currently covered only indirectly via contract-parity).

## Rationale
CodeGraph flagged no covering tests for these serializers. Parity tests prove the key-set contract; direct tests would harden the 7+1 gap fixes (barColors, plotColors, fillColorData, bgcolor, boxes, tables, alertConditions) against regressions.

## Evidence
QA criterion 3 note; CodeGraph blast-radius flagged ⚠️ no covering tests.
