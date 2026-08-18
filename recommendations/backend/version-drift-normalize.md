# Version drift: WS ?? undefined vs REST ?? null
**Date:** 2026-08-18
**Source:** QA (contract-refactor-acceptance)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Reconcile the version field emission: WS emits `?? undefined` while REST emits `?? null`. Normalize in a future wave so both transports emit the same missing-value convention.

## Rationale
The shared contract exists precisely so WS and REST never drift. The version field is a documented residual drift that was intentionally preserved (wire invariance) during the refactor but should be unified.

## Evidence
B3 handoff (b3-rest-mapper) + B2 handoff (b2-ws-serializers); documented in-code.
