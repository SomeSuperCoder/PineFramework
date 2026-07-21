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
