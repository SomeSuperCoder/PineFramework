# WS diff boxes/tables structurally always []
**Date:** 2026-08-18
**Source:** QA (contract-refactor-acceptance)
**Priority:** low
**Status:** pending
**Effort:** large (>4hr)

## Recommendation
Build engine-level diffing for boxes and tables so WS forming-diff messages carry real box/table diffs instead of structurally-empty [].

## Rationale
toFormingCandleOutputs emits boxes/tables as [] because the engine has no diffBoxes/diffTables. The contract enforces their presence (good), but WS realtime boxes/tables can never update until the engine diffs them. Same limitation documented in FormingCandleManager.

## Evidence
backend/src/session/FormingCandleManager.ts toFormingCandleOutputs; QA criterion 3 consumed contract-parity.test.ts.
