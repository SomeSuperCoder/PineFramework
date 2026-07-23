## ADDED Requirements

### Requirement: Lines in overlap zone survive when not replaced

The system SHALL preserve lines from the previous result when they fall in the overlap zone and are NOT reproduced by the re-execution on the truncated dataset.

**Key:** A line is identified by `points[0].time`. A line is "replaced" when newResult contains a line with the same `points[0].time`.

#### Scenario: Overlap-zone line survives when not replaced
- **WHEN** `prependIndicatorResult` merges a prev result containing a line whose `points[0].time` falls in the overlap timestamp set
- **AND** newResult (from re-execution on truncated dataset) does NOT contain a line with that same `points[0].time`
- **THEN** the prev line SHALL appear in the merged result (shifted/output intact)

#### Scenario: Overlap-zone line is replaced when new produces same
- **WHEN** `prependIndicatorResult` merges a prev result containing a line whose `points[0].time` falls in the overlap timestamp set
- **AND** newResult DOES contain a line with the same `points[0].time`
- **THEN** the newResult line SHALL appear in the merged result and the prev line SHALL be dropped

#### Scenario: Non-overlap line always survives
- **WHEN** a prev line's `points[0].time` is NOT in the overlap timestamp set
- **THEN** the prev line SHALL survive the merge unchanged (existing behavior, preserved)

### Requirement: Shapes in overlap zone survive when not replaced

The system SHALL preserve shapes from the previous result when they fall in the overlap zone and are NOT reproduced by re-execution.

**Key:** A shape is identified by `time`. A shape is "replaced" when newResult contains a shape with the same `time`.

#### Scenario: Overlap-zone shape survives when not replaced
- **WHEN** `prependIndicatorResult` merges a prev result containing a shape whose `time` falls in the overlap timestamp set
- **AND** newResult does NOT contain a shape with that same `time`
- **THEN** the prev shape SHALL appear in the merged result

#### Scenario: Overlap-zone shape is replaced when new produces same
- **WHEN** `prependIndicatorResult` merges with a prev shape in overlap
- **AND** newResult contains a shape with the same `time`
- **THEN** the newResult shape SHALL appear, the prev shape SHALL be dropped

### Requirement: Labels in overlap zone survive when not replaced

The system SHALL apply the same overlap-prefer-new logic to labels.

#### Scenario: Overlap-zone label with no replacement survives
- **WHEN** a prev label's `time` is in the overlap set and newResult has no label at that `time`
- **THEN** the prev label SHALL appear in merged result

### Requirement: Boxes in overlap zone survive when not replaced

The system SHALL apply the same overlap-prefer-new logic to boxes.

**Key:** A box is identified by `startTime`. A box is "replaced" when newResult contains a box with the same `startTime`.

#### Scenario: Overlap-zone box with no replacement survives
- **WHEN** a prev box's `startTime` is in the overlap set and newResult has no box at that `startTime`
- **THEN** the prev box SHALL appear in merged result

### Requirement: Bgcolor entries in overlap zone survive when not replaced

The system SHALL apply the same overlap-prefer-new logic to bgcolor entries.

**Key:** A bgcolor entry is identified by `time`. A bgcolor is "replaced" when newResult contains a bgcolor with the same `time`.

#### Scenario: Overlap-zone bgcolor with no replacement survives
- **WHEN** a prev bgcolor entry's `time` is in the overlap set and newResult has no bgcolor at that `time`
- **THEN** the prev bgcolor entry SHALL appear in merged result

### Requirement: Strategy marker barIndex is shifted after prepend

The system SHALL shift strategy marker `barIndex` values from the previous result by `addedCount` after prepend to account for new bars inserted at the front of the dataset.

#### Scenario: Prev strategy marker barIndex adjusted
- **WHEN** `prependIndicatorResult` merges with `addedCount > 0`
- **AND** a prev result contains a strategy marker with `barIndex: 5`
- **AND** `addedCount: 200`
- **THEN** the merged result SHALL contain that strategy marker with `barIndex: 205`

#### Scenario: New strategy markers keep their barIndex
- **WHEN** newResult contains a strategy marker
- **THEN** its `barIndex` SHALL not be modified (it was computed against the new+overlap dataset which is the full dataset)
