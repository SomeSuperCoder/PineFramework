## ADDED Requirements

### Requirement: Full-depth chart state export

The system SHALL provide a mechanism to export the complete chart state — every candle, every indicator result, and all associated metadata — into a single JSON file stored in the project's `.exports/` directory. The export SHALL be accessible to the AI agent via a well-known file path.

#### Scenario: Export via HTTP button

- **WHEN** the user clicks "Export Full State" in the frontend footer bar
- **THEN** a `POST /api/export` request SHALL be sent
- **THEN** the server SHALL respond with a JSON payload containing `{ success: true, path: ".exports/export-<timestamp>.json" }`
- **THEN** the file SHALL be written to `<repo-root>/.exports/export-<timestamp>.json`

#### Scenario: Export payload completeness

- **WHEN** the export endpoint is called
- **THEN** the response SHALL include the following top-level fields:
  - `candles`: full `Array<{ time, open, high, low, close, volume }>`
  - `indicators`: `Array<{ source, plots, shapes, labels, fills, lines, boxes, alertConditions, alertTriggers, barTimestamps }>`
  - `exportedAt`: ISO-8601 timestamp of when the export was created
  - `barCount`: total number of candles in the export

#### Scenario: Export to file

- **WHEN** the export is written to disk
- **THEN** the file SHALL be at `<repo-root>/.exports/export-<unix-timestamp>.json`
- **THEN** the file SHALL contain the same JSON as the HTTP response body

#### Scenario: Agent reads export

- **WHEN** the agent needs to inspect the chart state
- **THEN** the agent SHALL read the file at the path returned by the export command

### Requirement: `.exports/` is gitignored

The `.exports/` directory SHALL be added to `.gitignore` so export files are never committed.

#### Scenario: Export ignored by git

- **WHEN** `git status` is run after an export
- **THEN** `.exports/` files SHALL NOT appear in untracked files

### Requirement: Export includes every indicator

When multiple indicators are loaded, the export SHALL include every indicator's full output data, not just the primary chart indicator.

#### Scenario: Multi-indicator export

- **WHEN** two or more indicators are active on the chart
- **THEN** the export SHALL contain an `indicators` array with one entry per indicator
- **THEN** each entry SHALL include the indicator's `source` code

### Requirement: Export includes all alert data

The export SHALL include both alert conditions (id, title, message) and alert triggers (alertId, barIndex, timestamp) for every indicator.

#### Scenario: Alert data in export

- **WHEN** the export file is inspected
- **THEN** each indicator entry SHALL contain:
  - `alertConditions`: array of `{ id, title, message }`
  - `alertTriggers`: array of `{ alertId, barIndex, timestamp }`
