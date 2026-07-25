## Why

The runtime already tracks lookback requirements from TA functions (`pivotLookback`, `valuewhenLookback`, state map lengths in `getMaxLookback()`), but this information is never connected to the output filtering mechanism. The result: scripts with TA functions that have variable arguments (like `ta.pivothigh(lb, rb)` where `lb` comes from `input.int()`) produce no warmup filtering, causing labels and shapes to stack on the oldest candle.

**The gap:**
- `runtimeMaxBarsBack` is initialized to 0 and never updated
- `applyLookbackFilter()` only uses `declared` (compile-time `maxBarsBack`), ignoring runtime detection
- TA functions already track their lookback in `pivotLookback`, `valuewhenLookback`, and state map keys

**The fix:** Connect these two systems — update `runtimeMaxBarsBack` from `getMaxLookback()` and use it in `applyLookbackFilter()`.

## What Changes

- **MODIFIED**: `applyLookbackFilter()` in `interpreter.ts` — uses `getEffectiveMaxBarsBack()` instead of just `declared`
- **NEW**: After each bar execution, update `runtimeMaxBarsBack` from `getMaxLookback()`
- No compile-time detection changes — the existing TA function tracking is sufficient

## Capabilities

### Modified Capabilities
- `applyLookbackFilter`: Now considers runtime-detected lookback from TA functions in addition to declared `maxBarsBack`

## Impact

- **Code**: `src/language/runtime/interpreter.ts` — update `applyLookbackFilter()` to use effective lookback
- **Code**: `src/language/runtime/execution-engine.ts` — update `runtimeMaxBarsBack` after each bar
- **Behavior**: Scripts with TA functions (even with variable args) now get automatic warmup filtering
- **Breaking**: Scripts that relied on `maxBarsBack = 0` producing no filtering will now be filtered based on their TA function usage
- **No changes to compile-time detection** — this is purely a runtime fix

## Example

```
// HHLL script (no explicit max_bars_back)
lb = input.int(5, "Left Bars")
rb = input.int(5, "Right Bars")
ph = ta.pivothigh(lb, rb)    // pivotLookback = 11
pl = ta.pivotlow(lb, rb)

// Before: maxBarsBack=0, runtimeMaxBarsBack=0 → no filtering → stacked labels
// After:  maxBarsBack=0, runtimeMaxBarsBack=11 → filters first 11 bars → clean output
```
