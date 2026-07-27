## ADDED Requirements

### Requirement: Plot data merge preserves prev values on warmup nulls

The system SHALL, when merging plot data at a chunk boundary, preserve the previous result's plot values wherever the new result has `null` entries due to insufficient warmup context.

#### Scenario: Warmup null in overlap keeps prev value
- **WHEN** `prependIndicatorResult` merges plot data
- **AND** `newResult` plot data has `null` at an overlap position (warmup zone)
- **AND** `prev` plot data has a non-null value at that position
- **THEN** the merged result SHALL contain the non-null value from `prev` at that position

#### Scenario: Warmup null where prev also null keeps null
- **WHEN** `prependIndicatorResult` merges plot data
- **AND** `newResult` plot data has `null` at an overlap position
- **AND** `prev` plot data also has `null` at that position
- **THEN** the merged result SHALL contain `null` at that position

#### Scenario: Non-null new data replaces prev data
- **WHEN** `prependIndicatorResult` merges plot data
- **AND** `newResult` plot data has a non-null value at an overlap position
- **THEN** the merged result SHALL contain the non-null value from `newResult` at that position (re-execution is authoritative when warmup is satisfied)

#### Scenario: Healing as context accumulates
- **WHEN** multiple prepend operations occur (multiple chunk loads)
- **AND** the available context bars increase with each load
- **AND** eventually `actualContextSize >= maxLookback`
- **THEN** the re-execution's overlap region SHALL have non-null values for previously-warmup positions
- **AND** the merge SHALL overwrite the preserved prev values with fresh computed values

### Requirement: plotColors merge preserves prev colors on warmup nulls

The system SHALL apply the same warmup-aware null-preserving logic to `plotColors` data when merging at chunk boundaries.

#### Scenario: Warmup null in plotColors keeps prev color
- **WHEN** `prependIndicatorResult` merges `plotColors`
- **AND** `newResult` has `null` at an overlap position for a color key
- **AND** `prev` has a non-null color at that position
- **THEN** the merged result SHALL contain the non-null color from `prev`

#### Scenario: Non-null new plotColor replaces prev
- **WHEN** `prependIndicatorResult` merges `plotColors`
- **AND** `newResult` has a non-null color at an overlap position
- **THEN** the merged result SHALL contain the non-null color from `newResult` (re-execution is authoritative)

### Requirement: fillColorData merge preserves prev colors on warmup nulls

The system SHALL apply the same warmup-aware null-preserving logic to `fillColorData` when merging at chunk boundaries.

#### Scenario: Warmup null in fillColorData keeps prev color
- **WHEN** `prependIndicatorResult` merges `fillColorData`
- **AND** `newResult` has `null` at an overlap position for a fill color key
- **AND** `prev` has a non-null color at that position
- **THEN** the merged result SHALL contain the non-null color from `prev`
