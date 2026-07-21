## Purpose
Implement and verify Separate Indicator Panes functionality for the separate-indicator-panes module.

## Requirements

### Requirement: Separate Indicator Panes
The chart SHALL render each non-overlay indicator in a separate pane below the main price chart, with synchronized crosshair and X-axis.

#### Scenario: Pane Creation
- **WHEN** an indicator is added with overlay=false
- **THEN** the chart SHALL create a new pane below existing panes

#### Scenario: Pane Resizing
- **WHEN** the user drags a pane boundary
- **THEN** the pane height SHALL be resizable

#### Scenario: Synchronized Crosshair
- **WHEN** the user moves the crosshair on any pane
- **THEN** all panes SHALL show the synchronized crosshair position

#### Scenario: Synchronized X-Axis
- **WHEN** the user zooms/pans on one pane
- **THEN** all panes SHALL scroll/zoom in sync
