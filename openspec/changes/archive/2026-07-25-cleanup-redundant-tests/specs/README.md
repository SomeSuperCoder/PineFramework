## No New Capabilities

This change is a test suite cleanup — it removes redundant tests, merges overlapping files, and renames misleading files. No new capabilities are introduced, so no requirement specs are needed.

### Affected files (removals):
- `tests/q-trend-frontend-full-debug.test.ts`
- `tests/integration/q-trend-ast-dump.test.ts`
- `tests/integration/q-trend-change-trace.test.ts`
- `tests/integration/q-trend-debug-trace.test.ts`
- `tests/integration/q-trend-solusdt-5m-dump.test.ts`
- `tests/integration/line-debug2.test.ts`
- `tests/integration/hhll-debug-labels.test.ts`
- `tests/integration/debug-res.test.ts`
- `tests/evil/backend-api.test.ts`
- `tests/integration/supertrend-debug.test.ts`
- `tests/integration/supertrend-debug3.test.ts`
- `tests/integration/supertrend-diagnostic.test.ts`

### Affected files (modifications):
- `tests/integration/fill-color-data.test.ts` — remove 11 tautological assertions
- `tests/integration/simple-ema-cross-strategy.test.ts` — absorb unique assertions from alignment test
- `tests/integration/backbone-rightmost-labels.test.ts` — add real assertions or remove

### Affected files (rename):
- `tests/integration/supertrend-debug2.test.ts` → `supertrend-kmeans.test.ts`

### Affected files (remove after merge):
- `tests/integration/ema-cross-strategy-alignment.test.ts`
