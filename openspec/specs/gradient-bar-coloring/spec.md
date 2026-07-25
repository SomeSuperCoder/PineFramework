## Purpose
Support gradient-based candle coloring via color.from_gradient().

## Requirements

### Requirement: Gradient Bar Coloring
The engine SHALL support gradient-based candle coloring where colors are mapped from a numeric value through `color.from_gradient()`.

#### Scenario: barcolor() with color.from_gradient()
- **WHEN** `barcolor()` is called with a `color.from_gradient()` expression
- **THEN** each bar SHALL display a color interpolated between the gradient endpoints

#### Scenario: Gradient colors pass through the backend API
- **WHEN** an indicator uses gradient-based bar coloring
- **THEN** the backend response SHALL include per-bar gradient colors

#### Scenario: Plotcandle() with gradient wick/body/border colors
- **WHEN** `plotcandle()` is called with gradient-derived colors
- **THEN** each candle element SHALL render with its independently computed gradient color
