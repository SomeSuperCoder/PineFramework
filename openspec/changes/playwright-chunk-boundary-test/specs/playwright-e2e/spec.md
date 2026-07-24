## ADDED Requirements

### Requirement: Chunk Boundary E2E Test
The system SHALL have a Playwright end-to-end test that validates the chart's chunk border behavior with the HHLL indicator in debug mode.

#### Scenario: Infinite Scroll Back
- **WHEN** the chart loads with the HHLL indicator running in debug mode
- **AND** the user scrolls back past multiple chunk boundaries (minimum 3)
- **THEN** the test SHALL verify that new chunk borders appear in the data after each scroll
- **AND** the test SHALL verify that labels and lines are still present after each scroll (no "wall")

#### Scenario: Label Count Equals Line Count
- **WHEN** indicator results are available after any scroll-back
- **THEN** the number of labels SHALL equal the number of lines for that indicator
- **AND** the test SHALL fail if any label exists without a corresponding line

#### Scenario: No Duplicate Labels
- **WHEN** indicator results are available after any scroll-back
- **THEN** there SHALL be no two labels with the same (time, price) tuple
- **AND** there SHALL be no two labels with the same (text, price) tuple in the overlap zone

#### Scenario: Labels Near Chunk Borders Have Lines
- **WHEN** indicator results are available
- **THEN** for each chunk border, all labels within 5 bars of the border SHALL have a line starting or ending at their timestamp

### Requirement: Test Data Bridge
The system SHALL expose current indicator result data to Playwright via `window.__pineTestData` when debug mode is enabled.

#### Scenario: Debug Mode Data Exposure
- **WHEN** the chart renders with `debug=true` URL parameter
- **THEN** `window.__pineTestData` SHALL be defined
- **AND** it SHALL contain the current labels, lines, and chunkBorders for each indicator
- **AND** it SHALL be updated after each chunk load and re-execution

#### Scenario: Production Safety
- **WHEN** the chart renders without debug mode
- **THEN** `window.__pineTestData` SHALL NOT be defined
