## MODIFIED Requirements

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
