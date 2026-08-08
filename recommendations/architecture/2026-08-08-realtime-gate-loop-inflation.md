# [While-loop + computed-counter looks still inflate realtime gate]
**Date:** 2026-08-08
**Source:** Code Reviewer (T4 review of runtime-lookback fix)
**Priority:** low
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
widen the loop-counter lookback exclusion beyond bare-Identifier for-loop counters: (a) while-loop backward searches (`while cond { arr[i] }`) are not exempt; (b) computed counter indexes (`arr[i * 2]`, `arr[i + 1]`) are not Identifier → still inflate runtimeSeriesLookback. The label-wipe path is now safe (filter is declared-only), so the residual effect is only a higher realtime history gate (`isLookbackSatisfied`) for such scripts.

## Rationale
- Matches the Wise Old Man mandate literally but leaves a known limitation. Document as known-limitation now, or widen the exception to pure-arithmetic counter expressions when needed.

## Evidence
expression-executor.ts:709-711 (exclusion is bare-Identifier only); execution-engine.ts loopCounterStack (ForStatement only).