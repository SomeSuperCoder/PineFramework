## ADDED Requirements

### Requirement: Scroll Re-Execution
When scrolling the chart to a new visible range, the engine SHALL re-execute indicators for the visible bars.

#### Scenario: Scroll Recompute
- **WHEN** the user scrolls to a new bar range
- **THEN** the engine SHALL re-execute for the visible bars

#### Scenario: Cached Regions
- **WHEN** scrolling to a previously computed region
- **THEN** the engine SHALL use cached results instead of re-executing
