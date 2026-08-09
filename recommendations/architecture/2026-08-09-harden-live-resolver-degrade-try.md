# Harden live resolver: whole body in degrade-try (B1 regression guard)
**Date:** 2026-08-09
**Source:** backend-engineer (B1 triage — PROJECT ISSUE, fixed)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Wrap the entire `resolveClosedTradeRealizedPnl` body (after the entry-unknown early-return) in the degrade-try, so ANY future pre-try read (like the `feesComplete` read of `swapResult.feeComponents` that caused B1) cannot throw and misclassify a CONFIRMED close as UNKNOWN OUTCOME.

## Rationale
The resolver's "NEVER throws" contract is currently only as strong as the one guarded line. B1 proved a missing field on the swap result threw outside the try → `executeSignal`'s outer catch marked a confirmed close `status: 'unknown'` and killed the `recordTrade` risk feed. The unknown-outcome catch path also calls the resolver without `swapResult` — unprotected today, safe only by short-circuit.

## Evidence
- B1: `bot-engine.test.ts:549` — `recordTrade` got 0 calls; root cause = `TypeError: Cannot read properties of undefined (reading 'length')` at `live-strategy-executor.ts:1574` (outside try), pre-M4 swap shape.
- Fix landed (defensive guard `(swapResult.feeComponents?.length ?? 0) > 0`), but structural hardening remains.
