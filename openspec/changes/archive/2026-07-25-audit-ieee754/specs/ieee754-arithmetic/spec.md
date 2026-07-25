## ADDED Requirements

### Requirement: IEEE 754 NaN and Infinity Guards
The execution engine SHALL convert IEEE 754 NaN and Infinity values to Pine Script NA after every arithmetic operation.

#### Scenario: Addition Produces NaN
- **WHEN** an addition operation produces IEEE 754 NaN (e.g., `Infinity + -Infinity`)
- **THEN** the result SHALL be converted to Pine Script NA (`Symbol.for('pine.na')`)

#### Scenario: Division Produces Infinity
- **WHEN** a division operation produces IEEE 754 Infinity (e.g., `1 / 0`)
- **THEN** the result SHALL be converted to Pine Script NA

#### Scenario: NaN Propagates Through NA Guard
- **WHEN** the NA guard (`isNa`) precedes an arithmetic operation
- **THEN** NA SHALL take priority over JS NaN

### Requirement: Domain-Checked Math Builtins
Math builtins SHALL validate their input domains and return NA for invalid inputs.

#### Scenario: math.log Domain Check
- **WHEN** `math.log` is called with x ≤ 0
- **THEN** it SHALL return NA

#### Scenario: math.sqrt Domain Check
- **WHEN** `math.sqrt` is called with x < 0
- **THEN** it SHALL return NA

#### Scenario: math.asin Domain Check
- **WHEN** `math.asin` is called with |x| > 1 (including values slightly outside due to IEEE 754)
- **THEN** it SHALL clamp to [-1, 1] before computation, and SHALL return NA if NaN results

#### Scenario: math.acos Domain Check
- **WHEN** `math.acos` is called with |x| > 1
- **THEN** it SHALL clamp to [-1, 1] before computation, and SHALL return NA if NaN results

### Requirement: Numerically Stable math.round
`math.round(value, precision)` SHALL use a numerically stable algorithm that handles IEEE 754 binary rounding artifacts.

#### Scenario: Half-Unit Rounding
- **WHEN** `math.round(1.005, 2)` is called
- **THEN** it SHALL return 1.01 (not 1.00)

#### Scenario: Negative Half-Unit Rounding
- **WHEN** `math.round(-1.005, 2)` is called
- **THEN** it SHALL return -1.01

#### Scenario: Integer Rounding
- **WHEN** `math.round(2.5, 0)` is called
- **THEN** it SHALL return 3

### Requirement: Finite Number Validation
`isValidNumber` SHALL reject any IEEE 754 non-finite value.

#### Scenario: Infinity Rejection
- **WHEN** `isValidNumber` is called with `Infinity`
- **THEN** it SHALL return false

#### Scenario: NaN Rejection
- **WHEN** `isValidNumber` is called with `NaN`
- **THEN** it SHALL return false

#### Scenario: Normal Number Acceptance
- **WHEN** `isValidNumber` is called with `42.5`
- **THEN** it SHALL return true

### Requirement: RingBuffer Running Sum Recalibration
The RingBuffer running sum SHALL be periodically recalculated to prevent unbounded floating-point error accumulation.

#### Scenario: Periodic Recalculation
- **WHEN** the RingBuffer has processed 10× its capacity in pushes
- **THEN** the running sum SHALL be recalculated from scratch from the buffer contents

#### Scenario: Error Bounded
- **WHEN** SMA is computed over 10,000 bars with window 200
- **THEN** the difference from a full-recalculation SMA SHALL be less than 1e-10 relative

### Requirement: Numerically Stable Statistical Functions
`correlation()` and `linreg()` SHALL use the two-pass (centered) algorithm to avoid catastrophic cancellation.

#### Scenario: Correlation of Large Correlated Series
- **WHEN** two perfectly correlated series with large magnitudes (e.g., 10^9) are analyzed
- **THEN** the correlation coefficient SHALL be within 1e-10 of 1.0

#### Scenario: Linear Regression on Large Data
- **WHEN** linear regression is computed on price data with large magnitude
- **THEN** the slope and intercept SHALL be numerically accurate (no catastrophic cancellation)

### Requirement: Epsilon-Aware Float Comparisons
Indicator-internal float comparisons SHALL use epsilon tolerance.

#### Scenario: Near-Zero Range Detection
- **WHEN** the price range (high-low) is extremely small but not exactly zero (e.g., 1e-10)
- **THEN** stoch, CCI, and MFI SHALL treat it as zero range and return the neutral value

#### Scenario: RSI Loss Detection
- **WHEN** the RSI's average loss is extremely small (e.g., < 1e-10)
- **THEN** RSI SHALL return 100 if gain is non-zero, or 50 if gain is also near-zero

#### Scenario: Crossover Detection
- **WHEN** two lines cross within machine epsilon of each other
- **THEN** crossover/crossunder SHALL detect the crossing

### Requirement: Post-Execution Output Sanitization
After each bar execution, all output Series values SHALL be sanitized for NaN/Infinity.

#### Scenario: NaN in Outputs
- **WHEN** an output Series contains IEEE 754 NaN after execution
- **THEN** the NaN SHALL be replaced with Pine Script NA

#### Scenario: Infinity in Outputs
- **WHEN** an output Series contains IEEE 754 Infinity
- **THEN** the Infinity SHALL be replaced with Pine Script NA

### Requirement: Sharpe/Sortino Ratio Guard
Strategy metrics SHALL guard against division by near-zero standard deviation.

#### Scenario: Near-Zero Standard Deviation
- **WHEN** the standard deviation of returns is extremely small (< 1e-10) but not exactly zero
- **THEN** Sharpe and Sortino ratios SHALL return 0 instead of Infinity
