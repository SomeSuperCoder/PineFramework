# Equity formula correction — Code Reviewer MINOR notes
**Date:** 2026-08-19
**Source:** team/quality/code-reviewer (equity-formula-review.json)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
1. `tests/unit/trading/chaos-equity-floor.test.ts:250-258` — stale comments describe the pre-fix RED state (claim `getEquity()/1e6` read + lamports seeding still exist). Assertions are correct; comments contradict the code. Update the comments.
2. 7 out-of-diff test files still mock `getEquity` at old lamports magnitude (10_000_000_000) — behaviorally inert today, latent 1e6 trap. Normalize mocks to the decimal-USDC convention.

## Rationale
Doc/code drift misleads future readers; latent unit-magnitude mocks will break when the mocked path is exercised with the USDC convention.

## Evidence
- commit 8c73f6c (equity formula fix)
- data/handoffs/team/quality/code-reviewer/equity-formula-review.json
