## Purpose
Implement the runtime lookback filter that uses effective lookback (combining declared and runtime values) to determine script warmup requirements.

## Requirements

### Requirement: Runtime Lookback Filter
The filter SHALL use `getEffectiveMaxBarsBack()` (which combines declared and runtime values) instead of only the compile-time declared value when filtering output bars.

#### Scenario: Effective lookback used for warmup
- **WHEN** `applyLookbackFilter` is called during script execution
- **THEN** it SHALL use the effective max bars back (max of declared and runtime) for warmup count filtering

### Requirement: Runtime Lookback Accumulation
The system SHALL accumulate runtime lookback after each bar execution.

#### Scenario: Runtime lookback updated after each bar
- **WHEN** a bar finishes execution in `executeBars()`
- **THEN** `runtimeMaxBarsBack` SHALL be updated from the maximum lookback across all TA functions
- **AND** it SHALL never decrease (uses Math.max)

#### Scenario: Works for all TA functions
- **WHEN** TA functions like pivots, SMA, EMA, ATR, RSI are used
- **THEN** their lookback SHALL be accumulated in `runtimeMaxBarsBack`

#### Scenario: Works for variable arguments
- **WHEN** a TA function is called with variable arguments (e.g., `ta.pivothigh(lb, rb)` where `lb` comes from `input.int()`)
- **THEN** the runtime lookback SHALL still capture the actual lookback used
