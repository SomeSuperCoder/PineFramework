## MODIFIED Requirements

### Requirement: HTML5 Canvas Charting
The frontend SHALL implement a custom charting library using HTML5 Canvas for rendering OHLC, candle, bar, line, area, and custom chart types.

#### Scenario: OHLC/Candle Rendering
- **WHEN** OHLC or candlestick data is received
- **THEN** the chart SHALL render candles with proper open/high/low/close

#### Scenario: Y-axis outlier clamping
- **WHEN** a candle's high or low would compress the visible price range beyond `candleRange × 20`
- **THEN** the Y-axis SHALL be clamped to prevent outlier values from distorting the chart view
