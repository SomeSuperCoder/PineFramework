## MODIFIED Requirements

### Requirement: Progressive Indicator Computation
The system SHALL compute indicators progressively — compute for visible range first, then background-compute remaining bars, with lookback-awareness.

#### Scenario: Visible Range First
- **WHEN** a chart loads
- **THEN** the visible bar range SHALL be computed first for immediate display

#### Scenario: Background Computation
- **WHEN** visible range computation completes
- **THEN** remaining bars SHALL be computed in background without blocking UI

#### Scenario: Progressive with Backtesting
- **WHEN** a strategy is being backtested
- **THEN** all bars SHALL be fully computed (not just visible range progressive)

#### Scenario: Lookback-Aware Progressive
- **WHEN** progressive computation processes a chunk
- **THEN** candles where `bar_index < max_bars_back` SHALL be skipped
- **AND** those candles SHALL be computed when subsequent chunks provide sufficient history

#### Scenario: Uncalculated Candle State
- **WHEN** a candle has unsatisfied lookback
- **THEN** the system SHALL maintain the candle in an uncalculated state
- **AND** the candle SHALL be computed when lookback is satisfied by additional loaded data
