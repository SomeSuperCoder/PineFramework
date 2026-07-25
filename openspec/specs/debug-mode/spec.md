## Purpose
Provide debug mode visualization for the chart showing chunk borders and metadata.

## Requirements

### Requirement: Debug Mode Toggle
The footer bar SHALL display a "Debug" toggle button that enables or disables debug mode for the chart.

#### Scenario: Toggle On
- **WHEN** the user clicks the "Debug" button
- **THEN** debug mode SHALL be enabled with visual indicator (amber/orange highlight)

#### Scenario: Toggle Off
- **WHEN** the user clicks the "Debug" button while debug mode is active
- **THEN** debug mode SHALL be disabled with normal button appearance

### Requirement: Chunk Border Visualization
When debug mode is enabled, the chart SHALL render vertical dashed lines at every chunk boundary position.

#### Scenario: Border After Scroll-Back
- **WHEN** the user scrolls back and loads an older chunk with debug mode enabled
- **THEN** a vertical dashed line SHALL be rendered at the bar index where the new chunk meets the old data

#### Scenario: Multiple Borders
- **WHEN** multiple scroll-back operations have occurred with debug mode enabled
- **THEN** each chunk boundary SHALL have a vertical dashed line at the corresponding bar index

#### Scenario: Debug Mode Off Hides Borders
- **WHEN** debug mode is disabled
- **THEN** all chunk border lines SHALL be removed from the canvas

### Requirement: Chunk Border Metadata
When debug mode is enabled, the chart SHALL display metadata labels at each chunk boundary.

#### Scenario: Label At Border
- **WHEN** debug mode is enabled and a chunk border is visible
- **THEN** a small label SHALL be rendered showing "Chunk N: +X bars @ T"

### Requirement: Non-Interference
Debug mode visualization SHALL NOT affect chart data, indicator execution, viewport behavior, or any other functional aspect.

#### Scenario: No Side Effects
- **WHEN** debug mode is toggled on or off
- **THEN** chart data, indicator results, viewport, and all other behavior SHALL remain unchanged
