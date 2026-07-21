## ADDED Requirements

### Requirement: Time-Based Bar Rendering
The chart SHALL render bars based on their timestamps rather than fixed bar spacing, handling gaps and non-uniform time intervals.

#### Scenario: Timestamp-Based Positioning
- **WHEN** bars have non-uniform time intervals
- **THEN** each bar SHALL be positioned proportionally to its timestamp

#### Scenario: Gap Handling
- **WHEN** there are time gaps between bars (weekends, holidays)
- **THEN** gaps SHALL be visible as empty space on the chart

#### Scenario: Session Breaks
- **WHEN** trading sessions have breaks
- **THEN** the chart SHALL show session separators
