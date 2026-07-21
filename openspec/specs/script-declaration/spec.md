## ADDED Requirements

### Requirement: indicator() Declaration
The engine SHALL support indicator() declaration with all Pine-compatible parameters.

#### Scenario: Standard Indicator
- **WHEN** indicator() is called with title, shorttitle, overlay, format, precision, scale, miny, maxy, timeframe, timeframe_gaps, explicit_plot_zorder
- **THEN** the engine SHALL register the indicator with these properties

#### Scenario: Explicit Plot Z-Order
- **WHEN** indicator() includes `explicit_plot_zorder=1` or similar
- **THEN** the engine SHALL render plots respecting the z-order

### Requirement: Single Strategy Enforcement
The engine SHALL enforce that only one strategy() declaration exists per script.

#### Scenario: Single Strategy Validation
- **WHEN** a script contains a strategy() declaration
- **THEN** the engine SHALL validate that no other strategy() or indicator() exists

#### Scenario: Strategy-Indicator Conflict
- **WHEN** a script contains both strategy() and indicator()
- **THEN** the engine SHALL produce a compilation error
