# Design: Fix Chunk Border Underrendering

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    LOOKBACK TRACKING                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  getMaxLookback() currently checks:                             │
│    ✅ smaBuffers    → key format: sma_<len>_<siteId>            │
│    ✅ emaState      → key format: ema_<len>_<siteId>            │
│    ✅ rsiState      → key format: rsi_<len>_<siteId>            │
│    ✅ atrState      → key format: atr_<len>_<siteId>            │
│    ✅ hmaBuffers    → key format: hma_<len>_<siteId>            │
│    ✅ sarState      → key format: sar_<len>_<siteId>            │
│    ✅ pivotLookback → scalar                                    │
│    ✅ valuewhenLookback → scalar                                │
│    ❌ highestBuffers → key format: highest_<len>_<siteId>       │
│    ❌ lowestBuffers  → key format: lowest_<len>_<siteId>        │
│    ❌ runtimeSeriesLookback → max i in series[i] access         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Details

### Change 1: Add highest/lowest to getMaxLookback()

```typescript
// In getMaxLookback(), add after the existing buffer checks:
for (const key of this.highestBuffers.keys()) {
  max = Math.max(max, this.parseMapLength(key.split('_')));
}
for (const key of this.lowestBuffers.keys()) {
  max = Math.max(max, this.parseMapLength(key.split('_')));
}
```

The key format is `highest_<len>_<callSiteId>`, and `parseMapLength` already handles splitting on `_` and parsing the second segment. However, `currentCallSiteId` may add a suffix — need to verify the key format matches `parseMapLength`'s expectations.

Looking at `parseMapLength`:
```typescript
private parseMapLength(parts: string[]): number {
  if (parts.length < 2) return 0;
  const len = parseInt(parts[1], 10);
  return Number.isFinite(len) && len > 0 ? len : 0;
}
```

For key `highest_150_abc123`, `parts = ['highest', '150', 'abc123']`, `parts[1] = '150'` → parses correctly. ✅

### Change 2: Track runtime series lookback

Add a field to `ExecutionEngine`:
```typescript
/** @internal */ runtimeSeriesLookback: number = 0;
```

In the expression executor, when evaluating `series[i]` (member access with numeric index), update:
```typescript
// In expression-executor.ts, where MemberExpression on a Series is evaluated:
if (typeof indexValue === 'number' && Number.isInteger(indexValue) && indexValue > 0) {
  eng.runtimeSeriesLookback = Math.max(eng.runtimeSeriesLookback, indexValue);
}
```

Then in `getMaxLookback()`:
```typescript
max = Math.max(max, this.runtimeSeriesLookback);
```

### Change 3: Verify maxLookback propagation

The chain is:
1. `ExecutionEngine.executeBars()` → `ExecutionResult.maxLookback`
2. `FormingCandleManager.toOutputs()` → `ScriptOutputs` (currently does NOT include maxLookback)
3. REST `/api/execute` → includes `maxLookback: result.maxLookback ?? 0`
4. Frontend `fetchOlderOHLCV` → `indicatorSourcesRef.current.set(id, { maxLookback })`

Need to verify that `maxLookback` is set on `ExecutionResult` after `executeBars()`. Looking at the interpreter:

```typescript
// In interpreter.ts, after executeBars:
result.maxLookback = this.engine.getMaxLookback();
```

This should already be in place. Need to verify.

## Testing Strategy

1. **Unit test:** Verify `getMaxLookback()` returns correct value for a script using `ta.highest()`
2. **Unit test:** Verify `getMaxLookback()` includes runtime series lookback from for-loop indexing
3. **Integration test:** Execute `zero-lag-signals-for-loop.pine` on 250 bars (200 new + 50 context) and verify the output matches execution on 400 bars (200 new + 200 context)
4. **Visual test:** Load the indicator, scroll left through multiple chunks, verify no persistent NA gaps at chunk borders

## Files to Modify

| File | Change |
|------|--------|
| `src/language/runtime/execution-engine.ts` | Add `runtimeSeriesLookback` field, update `getMaxLookback()` to include `highestBuffers`, `lowestBuffers`, and `runtimeSeriesLookback` |
| `src/language/runtime/expression-executor.ts` | Track `series[i]` lookback when evaluating member expressions |
| `src/language/runtime/interpreter.ts` | Verify `maxLookback` is set on result after execution |
