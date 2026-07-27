## Purpose
Implement and verify Progressive Indicator Computation functionality for the progressive-computation module.

## Requirements

### Requirement: Progressive Indicator Computation
The system SHALL compute indicators progressively — compute for visible range first, then background-compute remaining bars.

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

#### Scenario: Cancellation-Safe Progressive Computation
- **WHEN** an indicator is removed during progressive computation
- **THEN** the computation SHALL be interrupted
- **AND** no partial results SHALL be plotted for the removed indicator
- **AND** any plot series from that indicator SHALL be removed from the chart

### Requirement: Overlap Zone Label Merge
When merging labels from a re-executed indicator with previous results, the system SHALL replace ALL labels in the overlap zone with the re-execution result, instead of deduplicating by timestamp.

#### Scenario: Re-execution produces different labels at different timestamps
- **WHEN** the user scrolls back and new bars trigger re-execution with context
- **AND** the re-execution produces labels at different timestamps than the original execution (due to stateful functions like `ta.valuewhen()`)
- **THEN** the merged result SHALL contain ONLY the re-execution's labels in the overlap zone
- **AND** previous labels in the overlap zone SHALL be dropped, even if they have timestamps not present in the re-execution result

#### Scenario: Re-execution produces same labels
- **WHEN** the user scrolls back and re-execution produces identical labels to the original execution
- **THEN** the merged result SHALL contain only one copy of each label (no duplicates)

#### Scenario: Labels outside overlap zone
- **WHEN** labels exist outside the overlap zone
- **THEN** they SHALL be preserved unchanged in the merged result
