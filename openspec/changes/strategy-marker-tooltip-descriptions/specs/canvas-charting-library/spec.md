## MODIFIED Requirements

### Requirement: Grid and Crosshair

> **Note**: This requirement is extended to include strategy marker details in the crosshair tooltip. See `strategy-marker-tooltip` spec for the full marker display behavior.

The frontend SHALL implement a custom charting library using HTML5 Canvas for rendering OHLC, candle, bar, line, area, and custom chart types.

#### Scenario: Grid and Crosshair with Strategy Marker Data
- **WHEN** the user hovers over the chart
- **THEN** a crosshair line SHALL track the mouse position with OHLC values in a tooltip, and the tooltip SHALL additionally display strategy marker details (type, name, direction, quantity, price, comment) for the hovered bar when markers are present
