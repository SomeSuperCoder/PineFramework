# Unify dual DEFAULT fee constants + fix 0-bps step understatement
**Date:** 2026-08-14
**Source:** security-engineer (parity-security.json, note 3)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Reconcile the two DEFAULT fee constants in the shared library — the fee fetcher defaults to 25 bps while the fee-tiers module defaults to 10 bps — and fix the 0-bps step understatement (a 0-bps step in fee tiers is understated relative to the real fee schedule). Single source of truth for default fee values; one owner.

## Rationale
Dual defaults can produce different "no explicit fee" behavior depending on which module resolves the fee, which is exactly the class of silent divergence the parity change eliminated elsewhere.

## Evidence
- security-engineer parity-security.json note 3
- src/pnl/fee-tiers.ts (10 bps) vs jupiter-fee-fetcher default (25 bps)
