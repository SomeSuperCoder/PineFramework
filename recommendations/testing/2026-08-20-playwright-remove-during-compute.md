# Playwright E2E for remove-during-long-compute
**Date:** 2026-08-20
**Source:** QA Engineer (acceptance.json) + Tech Lead review
**Priority:** low
**Status:** pending
**Effort:** large (>4hr)

## Recommendation
Add a Playwright user-flow that adds a long-computing indicator (e.g. a synthetic indicator with a slow loop or a heavy lookback), clicks X while it computes, and asserts: (1) the label disappears promptly, (2) the UI stays clickable during the compute, (3) no error toast appears, (4) the backend stops the compute (cancelled:true).

## Rationale
The fix is verified by unit/integration tests + QA acceptance, but the user-visible behavior (removal while computing, app responsiveness) is exactly the kind of regression that unit tests can miss. The existing `curved-radius-supertrend-fill-crash.spec.ts` proves Playwright infra exists for this app. Needs a deterministic "long compute" fixture — a real 3d-supertrend on 1000 bars is slow but flaky as a test; a synthetic indicator with a controlled heavy loop is better.

## Evidence
- QA: "dist must be rebuilt for local runtime" note + all acceptance criteria pass via unit/integration
- No browser-level proof of the remove-during-compute UX exists yet
