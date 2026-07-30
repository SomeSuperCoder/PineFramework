## ADDED Requirements

### Requirement: Auto-detect timezone on config step mount
The system SHALL automatically detect the user's timezone using `Intl.DateTimeFormat().resolvedOptions().timeZone` when the config step mounts for the first time (no stored preference).

#### Scenario: First visit — auto-detect sets timezone
- **WHEN** the config step mounts and no `botTimezone` value exists in localStorage
- **THEN** the timezone field SHALL be set to the browser's detected IANA timezone (e.g., `America/New_York`)
- **AND** the detected timezone SHALL be persisted to localStorage under key `botTimezone`

#### Scenario: Return visit — load from localStorage
- **WHEN** the config step mounts and `botTimezone` exists in localStorage
- **THEN** the timezone field SHALL display the stored value (not re-detect)

### Requirement: Manual timezone override via dropdown
The system SHALL provide a dropdown containing all IANA timezones grouped by continent, allowing the user to override the auto-detected or stored timezone.

#### Scenario: Dropdown displays grouped timezones
- **WHEN** the user opens the timezone dropdown
- **THEN** all IANA timezones SHALL be displayed, grouped by continent/region (e.g., America, Europe, Asia, Africa, Pacific, UTC)
- **AND** each group SHALL be labeled with the continent name

#### Scenario: User selects a different timezone
- **WHEN** the user selects a timezone from the dropdown
- **THEN** the selected timezone SHALL be saved to localStorage under key `botTimezone`
- **AND** the config payload SHALL use the newly selected timezone

#### Scenario: Search/filter timezones
- **WHEN** the user types in the timezone filter input
- **THEN** the dropdown SHALL filter to show only timezones matching the typed text (case-insensitive substring match)

### Requirement: Timezone sent in bot configuration
The system SHALL include the selected timezone in the bot configuration payload sent to the backend.

#### Scenario: Configure bot with selected timezone
- **WHEN** the user clicks "Configure Bot" on the config step
- **THEN** the POST `/api/bot/configure` request SHALL include `timezone` field with the selected IANA timezone string
- **AND** the timezone value SHALL match what is displayed in the dropdown

### Requirement: Timezone display in review step
The system SHALL display the selected timezone on the review/config summary step.

#### Scenario: Review shows timezone
- **WHEN** the wizard advances to the review/backtest step
- **THEN** the config summary SHALL display the selected timezone label (e.g., `America/New_York`)
