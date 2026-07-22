## ADDED Requirements

### Requirement: AlertTriggerData carries display fields
The `AlertTriggerData` interface SHALL include optional display-oriented fields (`title`, `message`, `destination`) so the frontend can render alert details in the bar tooltip without requiring a separate lookup.

#### Scenario: AlertTriggerData contains display fields
- **WHEN** an alert is triggered and `AlertTriggerData` is created
- **THEN** it SHALL include `title` and `message` fields populated from the originating `AlertCondition`, and `destination` if configured

#### Scenario: Backward compatibility
- **WHEN** existing `AlertTriggerData` objects without display fields are received by the frontend
- **THEN** the tooltip SHALL gracefully omit the alert section (no crash, no rendering error)
