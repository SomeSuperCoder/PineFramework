## ADDED Requirements

### Requirement: ProgressBar component renders progress indicator
The system SHALL provide a reusable `ProgressBar` component that displays a horizontal progress bar with phase text and percentage.

#### Scenario: Inline variant renders compact bar
- **WHEN** `ProgressBar` is rendered with `variant="inline"`
- **THEN** the system SHALL display a horizontal bar with phase text below it

#### Scenario: Modal variant renders centered bar
- **WHEN** `ProgressBar` is rendered with `variant="modal"`
- **THEN** the system SHALL display a centered horizontal bar with phase text below it

#### Scenario: Progress percentage displayed
- **WHEN** `ProgressBar` receives `progress={75}`
- **THEN** the bar fill SHALL be 75% width and the text SHALL show "75%"

#### Scenario: Phase text displayed
- **WHEN** `ProgressBar` receives `phase="Fetching bars"`
- **THEN** the text below the bar SHALL show "Fetching bars... 75%"

#### Scenario: Indeterminate state
- **WHEN** `ProgressBar` receives `status="queued"` or `status` is null
- **THEN** the bar SHALL show an indeterminate animation (no percentage)

#### Scenario: Completed state
- **WHEN** `ProgressBar` receives `status="completed"`
- **THEN** the bar SHALL be 100% width and show "100%"

#### Scenario: Failed state
- **WHEN** `ProgressBar` receives `status="failed"`
- **THEN** the bar SHALL be hidden and only error text shown (if error prop provided)
