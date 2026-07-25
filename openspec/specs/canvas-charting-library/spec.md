## Purpose
Implement and verify HTML5 Canvas Charting functionality for the canvas-charting-library module.

## Requirements

### Requirement: HTML5 Canvas Charting
The frontend SHALL implement a custom charting library using HTML5 Canvas for rendering OHLC, candle, bar, line, area, and custom chart types.

#### Scenario: OHLC/Candle Rendering
- **WHEN** OHLC or candlestick data is received
- **THEN** the chart SHALL render candles with proper open/high/low/close

#### Scenario: Y-axis outlier clamping
- **WHEN** a candle's high or low would compress the visible price range beyond `candleRange × 20`
- **THEN** the Y-axis SHALL be clamped to prevent outlier values from distorting the chart view

#### Scenario: Chart Type Switching
- **WHEN** the user switches chart type
- **THEN** the chart SHALL re-render in the selected mode (line, area, bar, etc.)

#### Scenario: Custom Drawing
- **WHEN** indicator plot data is received
- **THEN** the chart SHALL overlay indicator plots on the canvas

#### Scenario: Grid and Crosshair
- **WHEN** the user hovers over the chart
- **THEN** a crosshair line SHALL track the mouse position with OHLC values in a tooltip

#### Scenario: Grid and Crosshair with Strategy Marker Data
- **WHEN** the user hovers over the chart
- **THEN** a crosshair line SHALL track the mouse position with OHLC values in a tooltip, and the tooltip SHALL additionally display strategy marker details (type, name, direction, quantity, price, comment) for the hovered bar when markers are present

#### Scenario: Grid and Crosshair with Alert Data
- **WHEN** the user hovers over the chart
- **THEN** a crosshair line SHALL track the mouse position with OHLC values in a tooltip, and the tooltip SHALL additionally display alert trigger details for the hovered bar when alerts are present

#### Scenario: Zoom and Pan
- **WHEN** the user scrolls or drags on the chart
- **THEN** the chart viewport SHALL zoom or pan accordingly

#### Scenario: Canvas Optimizations
- **WHEN** thousands of bars are plotted
- **THEN** canvas rendering SHALL use off-screen canvases, caching, and dirty-region optimization

#### Scenario: WebGL-Annotated Canvas
- **WHEN** rendering large indicator datasets at 60fps
- **THEN** the chart SHALL use WebGL-annotated canvas for GPU-accelerated rendering of plot series
