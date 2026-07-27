## Purpose
Preserve shapes, lines, labels, boxes, and bgcolor entries across prepend merges at chunk boundaries.

## Requirements

### Requirement: Lines in overlap zone survive when not replaced
The system SHALL preserve lines from the previous result when they fall in the overlap zone and are NOT reproduced by the re-execution on the truncated dataset.

#### Scenario: Overlap-zone line survives when not replaced
- **WHEN** `prependIndicatorResult` merges a prev result containing a line whose `points[0].time` falls in the overlap timestamp set and newResult does NOT contain a line with that same `points[0].time`
- **THEN** the prev line SHALL appear in the merged result

#### Scenario: Overlap-zone line is replaced when new produces same
- **WHEN** `prependIndicatorResult` merges and newResult DOES contain a line with the same `points[0].time`
- **THEN** the newResult line SHALL appear in the merged result and the prev line SHALL be dropped

### Requirement: Shapes in overlap zone survive when not replaced
The system SHALL preserve shapes from the previous result when they fall in the overlap zone and are NOT reproduced by re-execution.

#### Scenario: Overlap-zone shape survives when not replaced
- **WHEN** `prependIndicatorResult` merges a prev result containing a shape whose `time` falls in the overlap timestamp set and newResult does NOT contain a shape with that same `time`
- **THEN** the prev shape SHALL appear in the merged result

### Requirement: Labels in overlap zone survive when not replaced
The system SHALL apply the same overlap-prefer-new logic to labels.

#### Scenario: Overlap-zone label with no replacement survives
- **WHEN** a prev label's `time` is in the overlap set and newResult has no label at that `time`
- **THEN** the prev label SHALL appear in merged result

### Requirement: Boxes in overlap zone survive when not replaced
The system SHALL apply the same overlap-prefer-new logic to boxes.

#### Scenario: Overlap-zone box with no replacement survives
- **WHEN** a prev box's `startTime` is in the overlap set and newResult has no box at that `startTime`
- **THEN** the prev box SHALL appear in merged result

### Requirement: Bgcolor entries in overlap zone survive when not replaced
The system SHALL apply the same overlap-prefer-new logic to bgcolor entries.

#### Scenario: Overlap-zone bgcolor with no replacement survives
- **WHEN** a prev bgcolor entry's `time` is in the overlap set and newResult has no bgcolor at that `time`
- **THEN** the prev bgcolor entry SHALL appear in merged result

### Requirement: Strategy marker barIndex is shifted after prepend
The system SHALL shift strategy marker `barIndex` values from the previous result by `addedCount` after prepend.

#### Scenario: Prev strategy marker barIndex adjusted
- **WHEN** `prependIndicatorResult` merges with `addedCount > 0`
- **AND** a prev result contains a strategy marker with `barIndex: 5` and `addedCount: 200`
- **THEN** the merged result SHALL contain that strategy marker with `barIndex: 205`

#### Scenario: New strategy markers keep their barIndex
- **WHEN** newResult contains a strategy marker
- **THEN** its `barIndex` SHALL not be modified

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
