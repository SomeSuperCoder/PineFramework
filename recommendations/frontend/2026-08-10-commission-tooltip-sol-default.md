# Commission method descriptor tooltips advertise stale $150 SOL default
**Date:** 2026-08-10
**Source:** Test Engineer (commission-calculator rewrite handoff)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
The commission method `settingsFields` tooltips in `src/strategy/commission-calculator.ts` (lines ~179, ~213) still advertise the old `$150` SOL default, while the real default is `DEFAULT_SOL_USD_PRICE = 73` (src/strategy/commission-methods/config.ts:17). Align the UI copy with the actual default.

## Rationale
Stale tooltips mislead users configuring commission settings; the default changed from 150 → 73 in the PnL single-source-of-truth rework (commit 94f3e8c).

## Evidence
- commission-calculator.ts:179,213 — tooltip copy references $150
- config.ts:17 — DEFAULT_SOL_USD_PRICE = 73