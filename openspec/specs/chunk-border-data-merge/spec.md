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
