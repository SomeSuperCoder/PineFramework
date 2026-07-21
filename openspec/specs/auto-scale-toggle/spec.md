## Purpose
Implement and verify Auto-Scale Toggle functionality for the auto-scale-toggle module.

## Requirements

### Requirement: Auto-Scale Toggle
Each chart pane SHALL have an auto-scale toggle that automatically adjusts the price/indicator range to fit the visible data.

#### Scenario: Auto-Scale Enabled
- **WHEN** auto-scale is enabled
- **THEN** the Y-axis SHALL automatically adjust to fit the visible data

#### Scenario: Auto-Scale Disabled
- **WHEN** auto-scale is disabled
- **THEN** the Y-axis SHALL remain at the user-defined range

#### Scenario: Per-Pane Auto-Scale
- **WHEN** auto-scale is toggled on a specific pane
- **THEN** only that pane's auto-scale behavior SHALL change
