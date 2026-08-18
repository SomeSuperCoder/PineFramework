# REST wire error is an EngineError OBJECT vs contract error?: string
**Date:** 2026-08-18
**Source:** QA (contract-refactor-acceptance)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Document the REST error shape in the contract (error is an EngineError object on the wire, while the contract types error?: string). Best: type the error field to the real wire shape (EngineError | string | undefined) or document the deviation in src/contracts/index.ts.

## Rationale
Wire invariance was preserved during the refactor, but the type lie remains — a future consumer could trust error as string and break on an object.

## Evidence
B3 handoff: "engine error is an EngineError OBJECT on the wire while the contract types error?: string — kept (wire invariance) and documented in-code."
