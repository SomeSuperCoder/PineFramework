# Fix Chunk Border Underrendering

## Problem

When scrolling left and older bar chunks are prepended, indicator plot data has persistent NA gaps at chunk borders. The gaps don't heal when subsequent chunks load because `getMaxLookback()` underreports the true lookback requirement, causing insufficient context during re-execution.

### Root Cause

`getMaxLookback()` in `ExecutionEngine` only inspects registered built-in state maps (`smaBuffers`, `emaState`, `atrState`, etc.) but misses two critical lookback sources:

1. **`ta.highest()` / `ta.lowest()`** — uses `highestBuffers` / `lowestBuffers` maps that are never checked by `getMaxLookback()`
2. **Runtime series indexing** — `series[i]` in for-loops creates implicit lookback that isn't tracked at all

### Example

The indicator `zero-lag-signals-for-loop.pine` computes:
```pine
volatility = ta.highest(ta.atr(length), length*3) * volatility_mult
```
With `length=50`: `ta.atr(50)` needs 50 bars, `ta.highest(..., 150)` needs 150 valid ATR values → true lookback = ~200 bars. But `getMaxLookback()` returns only 50 (from `atrState`), so the context window in `fetchOlderOHLCV` is 150 bars too small.

## Approach

### 1. Track `ta.highest` / `ta.lowest` lookback in `getMaxLookback()`

Add iteration over `highestBuffers` and `lowestBuffers` keys, parsing the length from keys formatted as `highest_<len>_<callSiteId>`.

**File:** `src/language/runtime/execution-engine.ts` — `getMaxLookback()` method

### 2. Track runtime series indexing lookback

When the interpreter evaluates `series[i]` (member access with numeric index on a Series), record `i` as a candidate lookback. Accumulate the maximum across all bar executions.

**Files:**
- `src/language/runtime/expression-executor.ts` — where `series[i]` is evaluated
- `src/language/runtime/execution-engine.ts` — new `runtimeSeriesLookback` field, included in `getMaxLookback()`

### 3. Persist lookback in execution result

Ensure `getMaxLookback()` is called after `executeBars()` and its value is stored in `ExecutionResult.maxLookback`. Currently this flows through `ScriptSession → FormingCandleManager → REST response → frontend indicatorSourcesRef`. Verify the chain is intact.

**File:** `src/language/runtime/execution-engine.ts` — ensure `maxLookback` is set on `ExecutionResult`

## Scope

- **In scope:** Fixing `getMaxLookback()` to correctly report all lookback sources
- **Out of scope:** Changing the chunk loading strategy, chunk size, or merge logic in `prependIndicatorResult`

## Risks

- **Over-reporting lookback:** Conservative tracking could request more context than needed, wasting bandwidth. Mitigate by only tracking actually-used lookback (already the pattern for `pivotLookback`, `valuewhenLookback`).
- **Performance:** Adding a field read per `series[i]` evaluation is negligible compared to the execution cost.
