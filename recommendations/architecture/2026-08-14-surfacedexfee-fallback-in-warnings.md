# Surface applyDexFee fallback in export warnings
**Date:** 2026-08-14
**Source:** QA Engineer (export-acceptance review)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Make `applyDexFee` return a `fallbackFired` flag (or otherwise signal when the DEX-fee fetch failed and it fell back to the flat 0.1% commission), and have the export sinks (CLI `onOutcome` + API job completion) append a warning like `'dex-fee fetch failed; fell back to 0.1% commission'` to the export's `warnings` array.

## Rationale
The feature's core purpose is diffing script-vs-frontend backtests to find divergences. The CLI path uses `applyDexFee(..., { onFailure: 'fallback', fallbackCommission: 0.1 })` while the API path uses `{ onFailure: 'throw' }` — so a DEX-fee outage produces *different results between the two producers by design*. Today that difference is only *inferable* from the export (the fallback export shows `commission: 0.1, commissionType: 'percent'` and no `dexFeeBps`, while the API one either fails or carries the live fee). Surfacing the fallback *event* in `warnings` makes the divergence immediately visible instead of requiring a config diff.

## Evidence
- `backend/src/backtest-config.ts:84-118` — `applyDexFee` swallows the failure on `'fallback'` and returns a flat-commission override with no signal of the fallback.
- Export `warnings` layer exists in the schema (`src/export/backtest-export.ts`) but stays empty for script exports (CLI sink cannot detect the fallback — only a code comment records it).
- QA acceptance criterion 8 (divergence intent) passed only "with flag" because of this gap.
