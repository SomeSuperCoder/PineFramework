## Purpose
Implement and verify Time Module functionality for the time-module module.

## Requirements

### Requirement: Time Module
The system SHALL provide a time module with configurable time display modes, session-specific visibility, and custom time ranges.

#### Scenario: Time Display Modes
- **WHEN** the user configures time display
- **THEN** the X-axis SHALL show time in the selected format (UTC, local, exchange)

#### Scenario: Session Visibility
- **WHEN** sessions are configured
- **THEN** only the specified trading sessions SHALL be visible

#### Scenario: Custom Time Ranges
- **WHEN** a custom time range is set
- **THEN** the chart SHALL restrict data to the specified range
