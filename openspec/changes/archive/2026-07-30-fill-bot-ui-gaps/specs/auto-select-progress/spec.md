## ADDED Requirements

### Requirement: Auto-Select Progress Display
The dashboard SHALL display real-time progress when auto-select is running, and show the final ranked results.

#### Scenario: Progress shown during evaluation
- **WHEN** the user starts the bot with auto-select enabled
- **THEN** the dashboard SHALL display a progress panel showing: current pair being evaluated, phase (fetching/backtesting/ranking), and count (e.g., "Evaluating pair 3/10")

#### Scenario: Single-step progress
- **WHEN** the user configures and starts the bot
- **THEN** the progress SHALL update from start to completion in a single continuous flow (not requiring multiple clicks)

#### Scenario: Results displayed on completion
- **WHEN** auto-select completes
- **THEN** the dashboard SHALL display the ranked pairs (best first) with their metric values
- **AND** the auto-selected pair SHALL be highlighted

#### Scenario: Failure handling
- **WHEN** auto-select fails (all pairs fail evaluation)
- **THEN** the dashboard SHALL show an error message
- **AND** the bot SHALL NOT enter Running state

#### Scenario: Progress updates via WebSocket
- **WHEN** the backend emits auto-select progress events
- **THEN** the frontend SHALL receive them on the existing WebSocket connection
- **AND** update the progress display without polling
