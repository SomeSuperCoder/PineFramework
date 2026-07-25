## Purpose
Implement and verify Alert Function Support functionality for the alert-system module.

## Requirements

### Requirement: Alert Function Support
The engine SHALL support alert() and alertcondition() functions.

#### Scenario: alert()
- **WHEN** alert() is called with a condition and message
- **THEN** the engine SHALL trigger an alert with the message

#### Scenario: alertcondition()
- **WHEN** alertcondition() is declared
- **THEN** the engine SHALL register a configurable alert condition

### Requirement: AlertTriggerData carries display fields
The `AlertTriggerData` interface SHALL include optional display-oriented fields (`title`, `message`, `destination`) so the frontend can render alert details in the bar tooltip without requiring a separate lookup.

#### Scenario: AlertTriggerData contains display fields
- **WHEN** an alert is triggered and `AlertTriggerData` is created
- **THEN** it SHALL include `title` and `message` fields populated from the originating `AlertCondition`, and `destination` if configured

#### Scenario: Backward compatibility
- **WHEN** existing `AlertTriggerData` objects without display fields are received by the frontend
- **THEN** the tooltip SHALL gracefully omit the alert section (no crash, no rendering error)
