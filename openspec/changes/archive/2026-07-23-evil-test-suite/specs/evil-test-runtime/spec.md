## ADDED Requirements

### Requirement: Runtime handles NaN/Infinity in arithmetic without crashing
The runtime SHALL execute arithmetic operations involving NaN or Infinity gracefully, returning NA rather than propagating unrecoverable values.

#### Scenario: Division by zero returns NA
- **WHEN** a Pine Script expression divides a number by zero
- **THEN** the result SHALL be `na` (not crash or return Infinity)

#### Scenario: Addition with NaN propagates NA
- **WHEN** a binary expression (`+`) has NaN as either operand
- **THEN** the result SHALL be `na`

#### Scenario: Multiplication by Infinity
- **WHEN** a binary expression (`*`) has Infinity as an operand
- **THEN** the result SHALL be `na` or handle gracefully

#### Scenario: Comparison with NaN
- **WHEN** `na > 0`, `na < 0`, or `na == 0` is evaluated
- **THEN** the result SHALL be `false` (PineScript behavior)

### Requirement: Runtime handles empty series without crashing
The runtime SHALL execute Pine Script referencing empty series without crashing, returning NA for any lookup.

#### Scenario: getRelative on empty series returns NA
- **WHEN** `getRelative(0)` is called on a Series with no values
- **THEN** the result SHALL be NA

#### Scenario: last() on empty series returns NA
- **WHEN** `last()` is called on a Series with no values
- **THEN** the result SHALL be NA

#### Scenario: Execution with empty bar context
- **WHEN** `executeBar()` is called with a context containing empty OHLCV series
- **THEN** the engine SHALL complete without crashing

### Requirement: Runtime handles extreme numeric values
The runtime SHALL execute Pine Script with extreme numeric inputs (Number.MAX_VALUE, Number.MIN_VALUE, very large/small floats) without crashing or producing silent corruption.

#### Scenario: Number.MAX_VALUE in arithmetic
- **WHEN** a script performs arithmetic on `Number.MAX_VALUE`
- **THEN** the engine SHALL complete without throwing

#### Scenario: Number.MIN_VALUE in division
- **WHEN** a script divides by `Number.MIN_VALUE` (very small positive)
- **THEN** the engine SHALL complete without crashing

#### Scenario: Negative zero (-0) propagation
- **WHEN** a script computes `0 * -1` or receives -0 as input
- **THEN** the result SHALL be 0 or -0 (not NaN), and not crash

### Requirement: Runtime handles out-of-bounds series access
The runtime SHALL return NA for historical references beyond available bar data rather than crashing or returning undefined.

#### Scenario: Lookback beyond available bars
- **WHEN** `close[100]` is accessed with only 10 bars of data
- **THEN** the result SHALL be `na`

#### Scenario: Negative index in get()
- **WHEN** `get(-1)` is called on a Series
- **THEN** the result SHALL be NA

#### Scenario: Index beyond length in get()
- **WHEN** `get(9999)` is called on a Series with 10 values
- **THEN** the result SHALL be NA
