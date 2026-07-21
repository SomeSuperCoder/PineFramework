## ADDED Requirements

### Requirement: Plot Functions
The engine SHALL support all Pine plot functions: plot(), plotshape(), plotchar(), plotarrow(), fill(), barcolor(), bgcolor(), hline(), and their parameter variants.

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
- **WHEN** barcolor() is called
- **THEN** the engine SHALL set the candle/bar color

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

### Requirement: Visual Overlay Support
The engine SHALL support overlay mode to render plots on the price chart.

#### Scenario: Overlay Mode
- **WHEN** indicator() is declared with `overlay=true`
- **THEN** plots SHALL render on the price chart instead of a separate pane

### Requirement: Color Bar Coloring
The engine SHALL support conditional bar coloring via barcolor().

#### Scenario: Conditional Bar Coloring
- **WHEN** barcolor() is called with a condition-based color
- **THEN** bars matching the condition SHALL be colored accordingly
