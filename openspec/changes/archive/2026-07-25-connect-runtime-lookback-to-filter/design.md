## Problem

The runtime already tracks lookback requirements from TA functions, but this information is never used for output filtering. Two systems exist in parallel:

1. **Runtime tracking** (`getMaxLookback()`): Combines `pivotLookback`, `valuewhenLookback`, and state map lengths into a single number
2. **Output filtering** (`applyLookbackFilter()`): Only uses `declared` (compile-time `maxBarsBack`)

When `declared = 0` (no explicit `max_bars_back`), filtering is skipped entirely — even though the runtime knows the script needs N bars of warmup.

## Solution

Connect the two systems with minimal changes:

### Change 1: Update `runtimeMaxBarsBack` after each bar

In `executeBars()`, after each bar execution, update `runtimeMaxBarsBack` from `getMaxLookback()`:

```typescript
// After executing each bar
this.runtimeMaxBarsBack = Math.max(this.runtimeMaxBarsBack, this.getMaxLookback());
```

This accumulates the maximum lookback across all bars. Using `Math.max` ensures we don't decrease the value if a later bar reports a smaller lookback.

### Change 2: Use effective lookback in filtering

In `applyLookbackFilter()`, replace:
```typescript
const declared = this.eng.compiledScript.maxBarsBack;
if (declared <= 0) return;
```

With:
```typescript
const effective = this.eng.getEffectiveMaxBarsBack();
if (effective <= 0) return;
```

And use `effective` instead of `declared` for `warmupCount`.

## Design Decisions

### Why update after each bar (not once after all bars)?

`getMaxLookback()` returns a value that grows during execution as TA functions accumulate state. Updating after each bar ensures we capture the maximum across all bars. If we only called it once at the end, we'd get the final value, which is correct — but updating incrementally is simpler and handles edge cases where lookback changes mid-execution.

### Why Math.max (not direct assignment)?

If a later bar reports a smaller lookback (e.g., a conditional TA call), we don't want to decrease `runtimeMaxBarsBack`. The warmup period should be the MAXIMUM across all bars, not the last bar's value.

### Why not change compile-time detection?

Compile-time detection (`detectLookbackFromAST`) works for constant args but can't resolve variable args from `input.int()`. The runtime approach is universal — it works for ANY TA function regardless of how its arguments are provided.

### Impact on existing scripts

Scripts with `maxBarsBack = 0` that use TA functions will now get warmup filtering. This is correct behavior — it matches TradingView. Scripts that explicitly declare `max_bars_back` are unaffected (their declared value is already used).

## Integration

No changes to `getEffectiveMaxBarsBack()` — it already returns `Math.max(declared, runtimeMaxBarsBack)`. The only changes are:
1. `runtimeMaxBarsBack` is now actually updated (was always 0)
2. `applyLookbackFilter()` now uses the effective value (was using only declared)
