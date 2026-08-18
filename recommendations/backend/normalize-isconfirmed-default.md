# normalize() defaults missing isConfirmed to false
**Date:** 2026-08-18
**Source:** QA (contract-refactor-acceptance)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Keep the guardrail but consider making normalize() throw or log when isConfirmed is missing (producers must set it before normalizing — both do today). Prevents silent diff-misclassification if a future producer forgets.

## Rationale
The default-to-false behavior is safe today but silently misclassifies a full message as diff if a producer omits isConfirmed. A hard failure is more aligned with the "never drop data" directive.

## Evidence
src/contracts/index.ts normalize default; B1 handoff fact 5.
