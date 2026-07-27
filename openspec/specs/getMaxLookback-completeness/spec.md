## Purpose
Ensure `ExecutionEngine.getMaxLookback()` returns the maximum number of historical bars required by ANY lookback source in the executed script.

## Requirements

### Requirement: getMaxLookback() Completeness
`ExecutionEngine.getMaxLookback()` must return the maximum number of historical bars required by ANY lookback source in the executed script. This value is used by the frontend to determine how many context bars to include when re-executing indicators at chunk boundaries.

#### Scenario: ta.highest() lookback is tracked
- **WHEN** a script uses `ta.highest(source, 150)`
- **THEN** `getMaxLookback()` returns ≥ 150

#### Scenario: Nested lookback sources sum correctly
- **WHEN** a script uses `ta.highest(ta.atr(50), 150)`
- **THEN** `getMaxLookback()` returns ≥ 200 (atr 50 + highest 150)

#### Scenario: for-loop series indexing lookback is tracked
- **WHEN** a script uses `for i = 1 to 70` accessing `series[i]`
- **THEN** `getMaxLookback()` returns ≥ 70

#### Scenario: Combined lookback sources return maximum
- **WHEN** a script combines all of the above lookback sources
- **THEN** `getMaxLookback()` returns the maximum of all individual lookbacks

#### Scenario: Existing behavior preserved
- **WHEN** a script uses only lookback sources that were already tracked (sma, ema, rsi, atr, hma, sar, pivothigh, valuewhen)
- **THEN** `getMaxLookback()` behavior is unchanged
