## Why

The Higher-High Lower-Low indicator's support/resistance lines lose their ray behavior in the frontend: the latest S/R lines should extend to infinity (`extend.right`) and get capped when a new level forms, but all lines render as finite segments. The engine correctly computes the `extend` property — it's dropped in the frontend data pipeline between API response and canvas renderer.

## What Changes

- Add `extend` field to the `ExecuteResponse` line type in `useChartData.ts`
- Forward `line.extend` in `buildScriptResult()` when mapping API response lines to `ScriptResult` format
- Forward `line.extend` in `mergeDiffIntoResult()` when merging real-time diff lines
- No engine, API, or renderer changes needed — all three already handle `extend` correctly

## Capabilities

### New Capabilities

- `drawing-line-extend`: Support for line `extend` property (`none`, `left`, `right`, `both`) in the frontend data pipeline, enabling S/R rays and future diagonal extended lines.

### Modified Capabilities

*(none — this is a pipeline fix, not a requirement change)*

## Non-goals

- No changes to the Pine Script execution engine or builtins
- No changes to the API route serialization
- No changes to the canvas renderer's extend handling (it already works)
- No changes to diagonal line ray rendering (the current horizontal-only extend rendering is sufficient for the HHLL use case)

## Impact

- `frontend/src/hooks/useChartData.ts` — only file changed
- ~5 lines added across 3 locations (interface type + two mapping functions)
