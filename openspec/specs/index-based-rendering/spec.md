## Purpose
Implement and verify Index-Based Bar Rendering functionality for the index-based-rendering module.

## Requirements

### Requirement: Index-Based Bar Rendering
The chart SHALL render bars using index-based positioning rather than time-based, with access to bar_index.

#### Scenario: Index-Based Positioning
- **WHEN** rendering bars
- **THEN** each bar SHALL be positioned by its series index (bar_index)

#### Scenario: bar_index Variable
- **WHEN** bar_index is accessed in a script
- **THEN** it SHALL return the zero-based index of the current bar being executed
