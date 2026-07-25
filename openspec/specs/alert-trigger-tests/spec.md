## Purpose
Provide deterministic test infrastructure for alert trigger validation including bar fixtures and viewport pixel mapping.

## Requirements

### Requirement: Deterministic Bar Fixture Generator
The test suite SHALL provide a deterministic bar fixture generator that produces reproducible OHLCV datasets.

#### Scenario: Seeded bars are reproducible
- **WHEN** the generator is called twice with the same seed and count
- **THEN** both runs SHALL produce identical bar arrays

### Requirement: Alert Trigger Index Alignment
The system SHALL ensure `AlertTriggerEntry.barIndex` values are valid 0-based indices into the bars array.

#### Scenario: Bar index is within bounds
- **WHEN** an indicator with alertcondition() is executed on N bars
- **THEN** every alertTriggers[].barIndex SHALL be >= 0 and < N

### Requirement: Viewport Pixel Mapping
The `Viewport.barIndexToPixel` method SHALL correctly map bar indices to screen pixel coordinates.

#### Scenario: Simple linear mapping
- **WHEN** viewport has `firstBarIndex = 0`, `barSpacing = 8`
- **THEN** `barIndexToPixel(0)` SHALL return 0 and `barIndexToPixel(5)` SHALL return 40

### Requirement: Render Alert Triggers Position Correctness
`MarkerRenderer.renderAlertTriggers` SHALL render dots at X positions corresponding to the correct bar on screen.

#### Scenario: Single trigger renders at correct bar x
- **WHEN** a single trigger with `barIndex = 10` exists and viewport is at `firstBarIndex = 0`, `barSpacing = 8`
- **THEN** the dot SHALL be rendered at x = 84 pixels
