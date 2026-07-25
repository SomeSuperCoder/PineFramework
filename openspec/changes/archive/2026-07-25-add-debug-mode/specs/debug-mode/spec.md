## ADDED Requirements

### Requirement: Debug Mode Toggle
The footer bar SHALL display a "Debug" toggle button that enables or disables debug mode for the chart.

#### Scenario: Toggle On
- **WHEN** the user clicks the "Debug" button
- **THEN** debug mode SHALL be enabled
- **AND** the button SHALL visually indicate debug mode is active (amber/orange highlight)

#### Scenario: Toggle Off
- **WHEN** the user clicks the "Debug" button while debug mode is active
- **THEN** debug mode SHALL be disabled
- **AND** the button SHALL revert to normal appearance

### Requirement: Chunk Border Visualization
When debug mode is enabled, the chart SHALL render vertical dashed lines at every chunk boundary position to visualize where data chunks were loaded.

#### Scenario: Initial Load Has No Borders
- **WHEN** the chart is first loaded with 1000 bars
- **AND** debug mode is enabled
- **THEN** no chunk border lines SHALL be visible (no prepend has occurred)

#### Scenario: Border After Scroll-Back
- **WHEN** the user scrolls back and loads an older chunk
- **AND** debug mode is enabled
- **THEN** a vertical dashed line SHALL be rendered at the bar index where the new chunk meets the old data

#### Scenario: Multiple Borders
- **WHEN** multiple scroll-back operations have occurred
- **AND** debug mode is enabled
- **THEN** each chunk boundary SHALL have a vertical dashed line at the corresponding bar index

#### Scenario: Debug Mode Off Hides Borders
- **WHEN** debug mode is disabled
- **THEN** all chunk border lines SHALL be removed from the canvas

### Requirement: Chunk Border Metadata
When debug mode is enabled, the chart SHALL display metadata labels at each chunk boundary showing the chunk number, bar count, and boundary timestamp.

#### Scenario: Label At Border
- **WHEN** debug mode is enabled and a chunk border is visible
- **THEN** a small label SHALL be rendered at the top of the chart area near each border line
- **AND** the label SHALL show: "Chunk N: +X bars @ T" where N is the chunk index, X is the number of bars in the chunk, and T is the timestamp at the boundary

#### Scenario: Labels Hidden When Debug Off
- **WHEN** debug mode is disabled
- **THEN** all chunk border labels SHALL be removed from the canvas

### Requirement: Non-Interference
Debug mode visualization SHALL NOT affect chart data, indicator execution, viewport behavior, or any other functional aspect of the chart.

#### Scenario: No Side Effects
- **WHEN** debug mode is toggled on or off
- **THEN** the chart data SHALL remain unchanged
- **AND** indicator results SHALL remain unchanged
- **AND** viewport scrolling SHALL remain unchanged
- **AND** all other chart behavior SHALL remain unchanged
