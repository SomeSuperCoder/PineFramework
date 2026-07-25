## Requirement: runtime-lookback-filter

### MODIFIED: `applyLookbackFilter()` uses effective lookback

The filter now uses `getEffectiveMaxBarsBack()` (which combines declared and runtime values) instead of only `declared` (compile-time value).

**Before:**
```typescript
const declared = this.eng.compiledScript.maxBarsBack;
if (declared <= 0) return;
// ... uses declared for warmupCount
```

**After:**
```typescript
const effective = this.eng.getEffectiveMaxBarsBack();
if (effective <= 0) return;
// ... uses effective for warmupCount
```

### ADDED: `runtimeMaxBarsBack` updated after each bar

After each bar execution in `executeBars()`, update `runtimeMaxBarsBack` from `getMaxLookback()`:

```typescript
this.runtimeMaxBarsBack = Math.max(this.runtimeMaxBarsBack, this.getMaxLookback());
```

**Behavior:**
- `runtimeMaxBarsBack` accumulates the maximum lookback across all bars
- Uses `Math.max` to prevent decreasing if later bars report smaller lookback
- Works for all TA functions: pivots, SMA, EMA, ATR, RSI, etc.
- Works for variable args (e.g., `ta.pivothigh(lb, rb)` where `lb` comes from `input.int()`)

**Integration:**
- `getEffectiveMaxBarsBack()` already returns `Math.max(declared, runtimeMaxBarsBack)` — no changes needed there
- `isLookbackSatisfied()` already uses `getEffectiveMaxBarsBack()` — script execution skipping works correctly
- `applyLookbackFilter()` now uses effective value — output filtering works correctly
