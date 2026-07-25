## ADDED Requirements

### Requirement: Lookback-Aware Script Execution
The system SHALL NOT execute scripts on candles where the lookback period is unsatisfied.

#### Scenario: Lookback Unsatisfied
- **WHEN** a candle's `bar_index` is less than the script's `max_bars_back`
- **THEN** the system SHALL skip script execution for that candle
- **AND** series values SHALL remain as their initial state (NaN for floats)

#### Scenario: Lookback Satisfied
- **WHEN** a candle's `bar_index` is greater than or equal to the script's `max_bars_back`
- **THEN** the system SHALL execute the script normally

#### Scenario: Progressive Computation with Lookback
- **WHEN** progressive computation processes a chunk of candles
- **THEN** candles with unsatisfied lookback SHALL be marked as uncalculated
- **AND** subsequent chunks SHALL calculate previously uncalculated candles

### Requirement: Lookback Length Detection
The system SHALL determine the script's lookback requirement from `max_bars_back` metadata.

#### Scenario: Script with Fixed Lookback
- **WHEN** a script uses `ta.sma(src, 50)`
- **THEN** the lookback requirement SHALL be at least 50 bars

#### Scenario: Script with Multiple Lookbacks
- **WHEN** a script uses multiple series operations with different lookback periods
- **THEN** the lookback requirement SHALL be the maximum of all lookback periods

### Requirement: No Regression on Chunk Boundaries
The system SHALL preserve existing chunk-boundary rendering behavior.

#### Scenario: End of Chunk Rendering
- **WHEN** a chunk ends before the visible range
- **THEN** the system SHALL render labels and plots correctly at the chunk boundary

#### Scenario: Chunk Loading Sequence
- **WHEN** multiple chunks load progressively
- **THEN** previously calculated candles SHALL NOT be recalculated
