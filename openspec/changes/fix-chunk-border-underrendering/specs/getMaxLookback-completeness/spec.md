# Spec: getMaxLookback() Completeness

## Requirement

`ExecutionEngine.getMaxLookback()` must return the maximum number of historical bars required by ANY lookback source in the executed script. This value is used by the frontend to determine how many context bars to include when re-executing indicators at chunk boundaries.

## Lookback Sources

All of the following must be reflected in `getMaxLookback()`:

| Source | State Field | Key Format | Currently Tracked |
|--------|-------------|------------|-------------------|
| `ta.sma()` | `smaBuffers` | `sma_<len>_<siteId>` | ✅ |
| `ta.ema()` | `emaState` | `ema_<len>_<siteId>` | ✅ |
| `ta.rsi()` | `rsiState` | `rsi_<len>_<siteId>` | ✅ |
| `ta.atr()` | `atrState` | `atr_<len>_<siteId>` | ✅ |
| `ta.hma()` | `hmaBuffers` | `hma_<len>_<siteId>` | ✅ |
| `ta.sar()` | `sarState` | `sar_<len>_<siteId>` | ✅ |
| `ta.pivothigh()` | `pivotLookback` | scalar | ✅ |
| `ta.valuewhen()` | `valuewhenLookback` | scalar | ✅ |
| `ta.highest()` | `highestBuffers` | `highest_<len>_<siteId>` | ❌ |
| `ta.lowest()` | `lowestBuffers` | `lowest_<len>_<siteId>` | ❌ |
| `series[i]` | `runtimeSeriesLookback` | scalar | ❌ |

## Acceptance Criteria

1. For a script using `ta.highest(source, 150)`, `getMaxLookback()` returns ≥ 150
2. For a script using `ta.highest(ta.atr(50), 150)`, `getMaxLookback()` returns ≥ 200 (atr 50 + highest 150)
3. For a script with `for i = 1 to 70` accessing `series[i]`, `getMaxLookback()` returns ≥ 70
4. For a script combining all of the above, `getMaxLookback()` returns the maximum of all individual lookbacks
5. Existing behavior for scripts without highest/lowest/series-indexing is unchanged
