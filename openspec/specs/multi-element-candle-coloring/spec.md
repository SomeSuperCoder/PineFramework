## Purpose
Support rendering candles with separate colors for body, wick, and border per candle.

## Requirements

### Requirement: Multi-Element Candle Coloring
The engine SHALL support rendering candles with separate colors for body, wick, and border per candle.

#### Scenario: plotcandle() with separate body, wick, and border colors
- **WHEN** `plotcandle()` is called with distinct `color`, `wickcolor`, and `bordercolor` parameters
- **THEN** the candle SHALL render with the specified colors independently

#### Scenario: plotcandle() defaults to uniform color
- **WHEN** `plotcandle()` is called with only `color` specified
- **THEN** all three elements SHALL default to the `color` value

#### Scenario: barcolor() with per-bar color override
- **WHEN** `barcolor()` is called with a color value
- **THEN** the candle at the current bar index SHALL be colored with that color

#### Scenario: Frontend CandlestickRenderer renders multi-element colors
- **WHEN** the frontend receives candle color data with separate body, wick, and border colors
- **THEN** the CandlestickRenderer SHALL render each candle element with its specified color
