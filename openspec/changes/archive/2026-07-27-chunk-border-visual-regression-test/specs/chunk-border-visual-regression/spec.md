## ADDED Requirements

### Requirement: Plot null density near chunk boundaries
The system SHALL detect when indicator plot data has an unexpected concentration of null values near chunk boundaries compared to the rest of the dataset.

#### Scenario: No abnormal null run at chunk border
- **WHEN** a chunk load completes and indicator results are merged
- **AND** the test examines the 50 bars on either side of each chunk border
- **THEN** the null-value count in that window SHALL NOT exceed 2x the null density of the full dataset (excluding the warmup zone)

#### Scenario: Fill regions span chunk boundaries
- **WHEN** an indicator produces a fill (plot fill between two plots)
- **AND** a chunk boundary falls within the fill's time range
- **THEN** the fill's fillColorData SHALL have non-null entries on both sides of the boundary
- **AND** no more than 2 consecutive null entries SHALL appear at the exact boundary position

### Requirement: Diagnostic data exposure for visual regression
The system SHALL expose per-plot null counts and boundary-region diagnostics via `window.__pineTestData` when debug mode is enabled.

#### Scenario: Plot null diagnostics available
- **WHEN** the chart renders with `debug=true` URL parameter
- **THEN** `window.__pineTestData.indicators[n]` SHALL contain a `plotNullCounts` field
- **AND** `plotNullCounts` SHALL be a `Record<string, number>` mapping plot title to its total null count

#### Scenario: Chunk boundary null diagnostics available
- **WHEN** the chart renders with `debug=true` URL parameter
- **AND** chunk borders exist
- **THEN** `window.__pineTestData.indicators[n]` SHALL contain a `boundaryNullDensities` field
- **AND** `boundaryNullDensities` SHALL be an array of `{ borderIndex: number; nullCount: number; totalBars: number }` entries, one per chunk border

### Requirement: Multi-indicator scroll-back test
The system SHALL have a Playwright test that scrolls back through multiple chunk boundaries while running indicators that produce fills and colored plots.

#### Scenario: Zero-lag-signals indicator survives scroll-back
- **WHEN** the zero-lag-signals-for-loop indicator is loaded
- **AND** the test scrolls back through at least 3 chunk boundaries
- **THEN** the indicator's plot data SHALL have non-null values in the boundary region after each chunk load
- **AND** the fill regions SHALL not have gaps larger than 2 bars at any chunk border

#### Scenario: Kalman-trend-levels indicator survives scroll-back
- **WHEN** the kalman-trend-levels indicator is loaded
- **AND** the test scrolls back through at least 3 chunk boundaries
- **THEN** the indicator's plot data SHALL have non-null values in the boundary region after each chunk load
