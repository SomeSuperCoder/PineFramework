## Purpose
Cancel in-flight indicator computation when the indicator is removed from the chart, and discard late-arriving results for removed indicators.

## Requirements

### Requirement: Computation Cancellation on Indicator Remove
The system SHALL cancel in-flight indicator computation when the indicator is removed from the chart, and SHALL discard any late-arriving results for removed indicators.

#### Scenario: HTTP execution result discarded after removal
- **WHEN** the user removes an indicator while its HTTP execution request is in flight
- **THEN** the HTTP response result SHALL be discarded and NOT plotted on the chart
- **AND** no orphaned plot series SHALL remain visible

#### Scenario: WebSocket result discarded after removal
- **WHEN** a WebSocket execution result arrives for an indicator that has been removed
- **THEN** the result SHALL be discarded
- **AND** the system SHALL NOT add it to `indicatorResults`

#### Scenario: Plot series cleanup on removal
- **WHEN** an indicator is removed from the chart
- **THEN** all plot series belonging to that indicator SHALL be removed from the chart
- **AND** any remaining plot data SHALL be erased

#### Scenario: Synchronous cleanup before async removal
- **WHEN** the user removes an indicator
- **THEN** the indicator's data sources (`indicatorSourcesRef`, `indicatorResultsRef`, `pendingExecuteRef`) SHALL be purged synchronously before any async network request completes

#### Scenario: Concurrent remove-and-re-add
- **WHEN** an indicator is removed and the same indicator is re-added before the original HTTP execution completes
- **THEN** the stale HTTP response SHALL be discarded
- **AND** only the new computation's result SHALL be used

#### Scenario: Real-time updates stop on removal
- **WHEN** `stop_indicator` is sent to the backend
- **THEN** the server SHALL remove the session from active subscriptions
- **AND** no further real-time bar updates SHALL be sent for that indicator
