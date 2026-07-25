## Problem

The existing `detectLookbackFromAST()` function recurses into for-loop bodies to detect lookback from TA calls and `[]` indexing inside loops. However, the for-loop's own bound expressions are never examined.

**Key insight:** A for-loop's upper bound represents **search depth**, not **warmup**. The `maxBarsBack` property is used as a warmup filter — it nulls ALL outputs for the first N bars. Setting it to the for-loop bound would incorrectly filter out valid outputs that form before the loop completes its search.

For example, `for x=1 to 1000` searches up to 1000 bars back, but labels can form as soon as pivots are detected (~bar 10). Setting `maxBarsBack = 1000` would filter out all labels.

## Solution

Keep the existing behavior: recurse into for-loop bodies to detect TA calls and `[]` indexing inside loops, but do NOT treat the for-loop bound as lookback.

The for-loop body recursion is already implemented in the existing code:

```typescript
case 'ForStatement':
  // ... (existing code recurses into stmt.body)
  maxLookback = Math.max(maxLookback, detectLookbackInStatements(stmt.body));
  break;
```

No changes needed to the detection logic — the existing behavior is correct.

## Design Decisions

### Why not treat for-loop bounds as lookback?

1. **`maxBarsBack` is warmup, not search depth**: It nulls outputs for the first N bars. A loop searching 1000 bars back doesn't mean the script needs 1000 bars of warmup.

2. **Labels form before loop completion**: In HHLL, labels form as soon as pivots are detected (~bar 10), but `findprevious()` searches 1000 bars back. Setting `maxBarsBack = 1000` would filter out all labels.

3. **The user can always declare `max_bars_back` explicitly**: If a script genuinely needs deep warmup, the user should declare it explicitly.

### Why recurse into for-loop bodies?

- TA calls inside loops (e.g., `ta.sma(close, 20)` inside `for x=0 to 50`) still need their lookback detected
- `[]` indexing inside loops (e.g., `close[100]` inside `for x=0 to 50`) still needs its offset detected
- The loop body is where the actual lookback requirements are, not the loop bounds

## Integration

No changes to the `Compiler.compile()` method — `detectLookbackFromAST()` is already called there. The existing ForStatement handling correctly recurses into loop bodies without treating bounds as lookback.
