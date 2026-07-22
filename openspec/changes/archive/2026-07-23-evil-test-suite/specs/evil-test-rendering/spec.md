## ADDED Requirements

### Requirement: Drawing engine handles extreme coordinates
The drawing engine SHALL handle extreme, NaN, or negative coordinate values without crashing.

#### Scenario: Line with NaN coordinates
- **WHEN** a line is drawn with NaN x1, y1, x2, or y2
- **THEN** the engine SHALL not crash; the line SHALL be rejected or rendered safely

#### Scenario: Line with infinite coordinates
- **WHEN** a line is drawn with Infinity or -Infinity as coordinates
- **THEN** the engine SHALL not crash; the line SHALL be handled gracefully

#### Scenario: Line with negative coordinates
- **WHEN** a line is drawn with negative x or y values
- **THEN** the engine SHALL not crash; SHALL render or reject

#### Scenario: Label with extreme price values
- **WHEN** a label is placed with NaN, Infinity, or Number.MAX_VALUE as price
- **THEN** the engine SHALL not crash; the label SHALL be handled gracefully

### Requirement: Drawing engine handles zero/null dimensions
The drawing engine SHALL handle shapes and text with zero dimensions without crashing.

#### Scenario: Zero-width line
- **WHEN** a line is created with width=0
- **THEN** the engine SHALL not crash; line SHALL be rendered with a minimum visible width or rejected

#### Scenario: Box with zero dimensions
- **WHEN** a box is created where left=right or top=bottom
- **THEN** the engine SHALL not crash; the box SHALL be handled gracefully

### Requirement: Plot engine handles degenerate values
The plot engine SHALL handle NaN, Infinity, and null values in plot data without crashing.

#### Scenario: Plot series with NaN values
- **WHEN** a plot series contains NaN values
- **THEN** the engine SHALL not crash; NaN values SHALL be treated as na and not plotted

#### Scenario: Plot series with Infinity values
- **WHEN** a plot series contains Infinity or -Infinity
- **THEN** the engine SHALL not crash; values SHALL be clamped or rejected

#### Scenario: Fill with NaN color
- **WHEN** a fill between two plots has a NaN or undefined color
- **THEN** the engine SHALL not crash; the fill SHALL be skipped

### Requirement: Rendering handles massive drawing sets
The rendering engine SHALL handle creation of thousands of drawing objects without performance degradation or crash.

#### Scenario: 10,000 label creation
- **WHEN** 10,000 labels are created in a single script execution
- **THEN** the engine SHALL not crash; all labels SHALL be accessible
