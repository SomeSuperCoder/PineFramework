## ADDED Requirements

### Requirement: Deterministic Bar Fixture Generator
The test suite SHALL provide a deterministic bar fixture generator that produces reproducible OHLCV datasets with known alert trigger patterns.

#### Scenario: Seeded bars are reproducible
- **WHEN** the generator is called twice with the same seed and count
- **THEN** both runs SHALL produce identical bar arrays (timestamp, open, high, low, close, volume)

#### Scenario: Bars follow trend pattern
- **WHEN** the generator produces N bars with a sine-wave or linear trend
- **THEN** the close prices SHALL follow the intended pattern within tolerance

### Requirement: Alert Trigger Index Alignment
The system SHALL ensure `AlertTriggerEntry.barIndex` values are valid 0-based indices into the bars array passed to the execution engine.

#### Scenario: Bar index is within bounds
- **WHEN** an indicator with `alertcondition()` is executed on N bars
- **THEN** every `alertTriggers[].barIndex` SHALL be >= 0 and < N

#### Scenario: Bar index matches bar timestamp
- **WHEN** a trigger has `barIndex = i` and `timestamp = t`
- **THEN** `bars[i].timestamp` SHALL equal `t`

#### Scenario: Bar index zero-indexes from first bar
- **WHEN** executing bars `[B0, B1, B2, ..., B499]`
- **THEN** the first bar SHALL produce triggers with `barIndex = 0` and the last with `barIndex = 499`

#### Scenario: Bar index survives prepend re-execute
- **WHEN** additional bars are prepended to the dataset and the engine is re-executed
- **THEN** `barIndex` values SHALL still be valid indices within the new, larger bars array

### Requirement: Viewport Pixel Mapping
The `Viewport.barIndexToPixel` method SHALL correctly map bar indices to screen pixel coordinates under all viewport states.

#### Scenario: Simple linear mapping
- **WHEN** viewport has `firstBarIndex = 0`, `barSpacing = 8`
- **THEN** `barIndexToPixel(0)` SHALL return `0`, and `barIndexToPixel(5)` SHALL return `40`

#### Scenario: Scrolled viewport
- **WHEN** viewport has `firstBarIndex = 50`, `barSpacing = 8`
- **THEN** `barIndexToPixel(50)` SHALL return `0`, and `barIndexToPixel(55)` SHALL return `40`

#### Scenario: After prepend adjustment
- **WHEN** `adjustForPrepend(20)` is called on a viewport with `firstBarIndex = 0`
- **THEN** `firstBarIndex` SHALL become `20`, and `barIndexToPixel(20)` SHALL return `0`

#### Scenario: Inverse relationship
- **WHEN** viewport has any valid state
- **THEN** `pixelToBarIndex(barIndexToPixel(i))` SHALL approximately equal `i` (within floating point tolerance)

### Requirement: Render Alert Triggers Position Correctness
`MarkerRenderer.renderAlertTriggers` SHALL render dots at X positions that correspond to the correct bar on screen.

#### Scenario: Single trigger renders at correct bar x
- **WHEN** a single trigger with `barIndex = 10` exists and viewport is at `firstBarIndex = 0`, `barSpacing = 8`
- **THEN** the dot SHALL be rendered at x = `10 * 8 + 8/2 = 84` pixels

#### Scenario: Multiple triggers on same bar
- **WHEN** three triggers all have `barIndex = 5`
- **THEN** all three SHALL render at the same X position

#### Scenario: Off-screen triggers are skipped
- **WHEN** `trigger.barIndex >= candles.length`
- **THEN** the trigger SHALL be skipped (not rendered)

### Requirement: Multiple Trigger Documentation
The system SHALL document that scripts with multiple `alertcondition()` calls can produce multiple triggers per bar.

#### Scenario: Multi-condition script behavior is recorded
- **WHEN** `higher-high-lower-low.pine` (9 `alertcondition()` calls) is executed
- **THEN** the expected multi-trigger-per-bar behavior SHALL be documented in the test output

#### Scenario: Minimal script produces one trigger per bar
- **WHEN** a script with exactly one `alertcondition()` that triggers every bar is executed
- **THEN** `alertTriggers` SHALL contain exactly 1 entry per bar where the condition is true
