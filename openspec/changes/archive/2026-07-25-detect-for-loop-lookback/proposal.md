## Why

The previous change (`compile-time-lookback-detection`) added AST-based detection of lookback periods from TA function arguments and `[]` indexing. However, many scripts — particularly complex ones like `higher-high-lower-low.pine` — use `for` loops to search deep into history (e.g., `for x=1 to 1000`).

**Key insight:** A for-loop's upper bound represents **search depth**, not **warmup**. The script can produce valid output (labels, plots) well before the loop's upper bound — the loop just hasn't found what it's looking for yet.

The `maxBarsBack` property is used as a **warmup filter** — it nulls ALL outputs for the first N bars. Setting it to the for-loop bound would incorrectly filter out valid outputs that form before the loop completes its search.

## What Changes

- **NEW**: For-loop body recursion in `detectLookbackFromAST()`: the detector recurses into for-loop bodies to find TA calls and `[]` indexing inside loops
- **NOT treating for-loop bounds as lookback**: the loop's upper bound is search depth, not warmup
- Combined with existing TA and `[]` detection, the MAX of all sources is used

## Capabilities

### Modified Capabilities
- `compile-time-lookback`: Now also examines for-loop bodies (not bounds) for TA calls and `[]` indexing

## Impact

- **Code**: `src/language/compiler/compiler.ts` — ForStatement handling recurses into body but does NOT evaluate loop bounds
- **Behavior**: Scripts with `for x=1 to N` loops that contain TA calls inside will detect the TA lookback, but the loop bound itself is not used
- **No breaking changes**: Detection only applies when `maxBarsBack === 0` (no explicit declaration)

## Example

```
// higher-high-lower-low.pine
findprevious() =>
    for x=1 to 1000          // bound NOT used as lookback (search depth)
        if hlFlag[x] == ehl
            ...

ph = ta.pivothigh(lb, rb)   // TA lookback detected (but lb, rb are variables → 0)
pl = ta.pivotlow(lb, rb)

// maxBarsBack = 0 (no constant TA args detected)
// The script works correctly without explicit max_bars_back
```
