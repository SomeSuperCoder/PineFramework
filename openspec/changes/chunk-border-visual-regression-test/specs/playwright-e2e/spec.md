## MODIFIED Requirements

### Requirement: Test Data Bridge
The system SHALL expose current indicator result data to Playwright via `window.__pineTestData` when debug mode is enabled.

#### Scenario: Debug Mode Data Exposure
- **WHEN** the chart renders with `debug=true` URL parameter
- **THEN** `window.__pineTestData` SHALL be defined
- **AND** it SHALL contain the current labels, lines, and chunkBorders for each indicator
- **AND** it SHALL be updated after each chunk load and re-execution
- **AND** each indicator entry SHALL contain a `plotNullCounts` field (`Record<string, number>`)
- **AND** each indicator entry SHALL contain a `boundaryNullDensities` field (`Array<{ borderIndex: number; nullCount: number; totalBars: number }>`)

#### Scenario: Production Safety
- **WHEN** the chart renders without debug mode
- **THEN** `window.__pineTestData` SHALL NOT be defined
