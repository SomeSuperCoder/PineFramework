## ADDED Requirements

### Requirement: Chart Viewport Autofit
The chart SHALL provide an autofit button that resets zoom and pan to fit all available data.

#### Scenario: Viewport Reset
- **WHEN** the user clicks the autofit button
- **THEN** the chart viewport SHALL reset to show all loaded data

#### Scenario: After Scroll/Zoom
- **WHEN** the user has zoomed/panned away
- **THEN** autofit SHALL restore the view to fit all data
