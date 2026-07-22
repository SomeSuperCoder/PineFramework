## MODIFIED Requirements

### Requirement: Plot Functions
The engine SHALL support all Pine plot functions: plot(), plotshape(), plotchar(), plotarrow(), fill(), barcolor(), bgcolor(), hline(), plotcandle(), and their parameter variants.

#### Scenario: line plot()
- **WHEN** plot() is called with line style
- **THEN** the engine SHALL render a line series

#### Scenario: plotshape()
- **WHEN** plotshape() is called
- **THEN** the engine SHALL render shapes at specified data points

#### Scenario: plotchar()
- **WHEN** plotchar() is called
- **THEN** the engine SHALL render Unicode text characters at data points

#### Scenario: plotarrow()
- **WHEN** plotarrow() is called
- **THEN** the engine SHALL render arrows at data points

#### Scenario: fill()
- **WHEN** fill() is called between two plots
- **THEN** the engine SHALL fill the area between the plots

#### Scenario: barcolor()
- **WHEN** barcolor() is called with a color value
- **THEN** the engine SHALL set the candle/bar color, supporting per-bar assignment with optional offset

#### Scenario: barcolor() with offset
- **WHEN** barcolor() is called with the offset parameter
- **THEN** the color SHALL be applied to the bar shifted by the offset value

#### Scenario: plotcandle() basic
- **WHEN** plotcandle() is called
- **THEN** the engine SHALL render candles with per-bar color control

#### Scenario: plotcandle() with multi-element colors
- **WHEN** plotcandle() is called with separate color, wickcolor, and bordercolor
- **THEN** the engine SHALL set distinct colors for body, wick, and border per candle

#### Scenario: bgcolor()
- **WHEN** bgcolor() is called
- **THEN** the engine SHALL set the background color

#### Scenario: hline()
- **WHEN** hline() is called
- **THEN** the engine SHALL render a horizontal line

#### Scenario: Dynamic Plot Titles
- **WHEN** plot() title attribute is a series
- **THEN** the engine SHALL update the plot title dynamically each bar

#### Scenario: Cross-Hair Plot Label
- **WHEN** plot() has the display attribute set
- **THEN** the engine SHALL support cross-hair label display mode via the display parameter

#### Scenario: Plot Precedence and Stacking
- **WHEN** multiple plots are rendered on the chart
- **THEN** plots SHALL be drawn in order, respecting Pine's stacking rules (earlier plots on top unless using overlay)

#### Scenario: plot() Color as Series
- **WHEN** the `color` parameter of `plot()` is set to a series expression
- **THEN** the engine SHALL evaluate it per-bar to dynamically color the plot

### Requirement: Color Bar Coloring
The engine SHALL support conditional bar coloring via barcolor() and plotcandle(), including per-element rendering (body, wick, border), gradient coloring, and offset shift.

#### Scenario: Conditional Bar Coloring
- **WHEN** barcolor() is called with a condition-based color
- **THEN** bars matching the condition SHALL be colored accordingly

#### Scenario: Bull/Bear Color Scheme
- **WHEN** barcolor() is called with colors derived from user-configurable bull/bear color inputs
- **THEN** each bar SHALL display the appropriate color based on trend state

#### Scenario: Gradient Bar Coloring
- **WHEN** barcolor() is called with a color.from_gradient() expression
- **THEN** bars SHALL display gradient-interpolated colors based on the evaluated value
