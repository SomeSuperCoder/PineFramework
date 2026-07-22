## ADDED Requirements

### Requirement: Alert system handles duplicate triggers
The alert system SHALL deduplicate alert triggers correctly under various scenarios, including rapid successive triggers.

#### Scenario: Exact duplicate trigger suppressed
- **WHEN** the same alert trigger fires twice with identical parameters
- **THEN** the second trigger SHALL be suppressed as a duplicate

#### Scenario: Rapid successive different triggers
- **WHEN** 200 distinct alert triggers fire rapidly (exceeding the dedup set capacity of 100)
- **THEN** all unique triggers SHALL be recorded; no legitimate alert SHALL be suppressed due to capacity overflow

#### Scenario: Duplicate trigger after dedup set eviction
- **WHEN** the dedup set reaches capacity and a previously seen alert key is evicted, then seen again
- **THEN** the re-seen trigger SHALL be treated as new (not suppressed)

### Requirement: Alert system handles edge case inputs
The alert system SHALL handle extreme message sizes and malformed input without crashing.

#### Scenario: Empty alert message
- **WHEN** an alert condition is created with an empty message string
- **THEN** the system SHALL not crash; the alert SHALL be created

#### Scenario: Extremely long alert message
- **WHEN** an alert condition contains a message of 100,000 characters
- **THEN** the system SHALL not crash; SHALL handle the message within reasonable memory bounds

#### Scenario: Alert with special characters
- **WHEN** an alert message contains HTML, Unicode, or control characters
- **THEN** the alert SHALL be stored and transmitted without corruption

### Requirement: Alert system handles rollback consistency
Alert triggers SHALL be rolled back correctly when the engine state is rolled back.

#### Scenario: Alert trigger during forming candle not persisted
- **WHEN** an alert triggers during a forming candle update which is then rolled back
- **THEN** the rollback SHALL also revert the alert trigger state

#### Scenario: Alert condition after rollback restore
- **WHEN** alert conditions are registered, then snapshot/rollback occurs
- **THEN** alert conditions SHALL be restored to snapshot-time state
