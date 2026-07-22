## ADDED Requirements

### Requirement: barcolor() offset parameter
The engine SHALL support the `offset` parameter in `barcolor()` to shift the coloring forward or backward by a specified number of bars.

#### Scenario: barcolor() with positive offset
- **WHEN** `barcolor(color.green, offset=2)` is called
- **THEN** the color SHALL be applied 2 bars ahead of the current bar

#### Scenario: barcolor() with negative offset
- **WHEN** `barcolor(color.red, offset=-1)` is called
- **THEN** the color SHALL be applied 1 bar behind the current bar

#### Scenario: barcolor() without offset defaults to zero
- **WHEN** `barcolor(color.blue)` is called without an offset parameter
- **THEN** the color SHALL be applied to the current bar (offset=0)
