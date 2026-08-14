# Surface suppressed shorts in export warnings (long-only enforcement)
**Date:** 2026-08-14
**Source:** Bug Hunter (export-divergence analysis, SOLUSDT script vs frontend)
**Priority:** high
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
When `isLongOnlyEnforced` (triggered by `commissionMethod: 'jupiter_manual'` / `'jupiter_auto'` — `commission-calculator.ts:179-183`) suppresses short signals at `strategy-engine.ts:140-154`, append a warning to the export's `warnings` array, e.g. `'<N> short signal(s) suppressed: commission method jupiter_manual enforces long-only'`. Today both export producers write `warnings: []` while the frontend silently dropped 15 shorts (only `console.warn` exists at `strategy-engine.ts:147`).

## Rationale
The export feature exists to diff script-vs-frontend backtests. A user selecting "Jupiter (Basic Swap)" in the UI gets a longs-only backtest with no explanation — the export claims a complete run (`warnings: []`) while 29→14 trades vanished. That silent divergence is exactly what the export layer was built to surface. Sibling gap: the same "event not surfaced" issue exists for `applyDexFee` fallback (see 2026-08-14-surfacedexfee-fallback-in-warnings.md) — consider a general "suppression events → warnings" mechanism rather than two one-offs.

## Evidence
- SOLUSDT exports (same scriptHash ce9b28ac, same engineVersion): script 29 trades (15L/14S), frontend 14 trades (all long); the 14 matching longs are byte-identical (timestamps + fills).
- Frontend `params.effectiveConfig.commissionMethod = 'jupiter_manual'`; script run had no commission method (commission 0).
- `warnings: []` in BOTH exports despite the suppression.
