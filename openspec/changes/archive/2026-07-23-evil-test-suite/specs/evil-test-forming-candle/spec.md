## ADDED Requirements

### Requirement: Forming candle handles consecutive updates
The forming candle processor SHALL handle multiple consecutive forming candle updates on the same bar without state corruption.

#### Scenario: Multiple forming candle updates
- **WHEN** `computeFormingCandle()` is called 5 times with different close values on the same bar
- **THEN** each update SHALL return a valid result, and the engine state SHALL remain consistent with the last forming candle values, not accumulating intermediate states

#### Scenario: Forming candle then bar confirmation
- **WHEN** a forming candle is computed, then a regular bar execution follows for the same timestamp
- **THEN** the engine SHALL correctly transition from forming candle state to confirmed bar state

### Requirement: Forming candle handles stale bar detection
The forming candle processor SHALL correctly detect and handle stale bar inputs (bars whose timestamp matches the last processed bar).

#### Scenario: Stale bar returns isConfirmed=false
- **WHEN** `appendOrUpdateBar()` is called with a bar having the same timestamp as the last bar
- **THEN** the result SHALL have `isConfirmed === false` and `formingCandle === true`

#### Scenario: Stale bar does not mutate state
- **WHEN** a stale bar is processed
- **THEN** the engine's totalBars metric SHALL NOT increment, and output series SHALL NOT change

### Requirement: Forming candle handles edge case inputs
The forming candle processor SHALL handle degenerate bar values without crashing.

#### Scenario: Forming candle with zero volume
- **WHEN** `computeFormingCandle()` is called with a context where volume is 0
- **THEN** the processor SHALL not crash; the forming candle SHALL be computed normally

#### Scenario: Forming candle with extreme price values
- **WHEN** `computeFormingCandle()` is called with NaN, Infinity, or negative close
- **THEN** the processor SHALL not crash; result SHALL be valid

#### Scenario: Forming candle after all bars confirmed
- **WHEN** `computeFormingCandle()` is called after all bars have been fully executed
- **THEN** the processor SHALL return a result without crashing
