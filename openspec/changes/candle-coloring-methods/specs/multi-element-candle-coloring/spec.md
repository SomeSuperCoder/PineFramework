## ADDED Requirements

### Requirement: Multi-Element Candle Coloring
The engine SHALL support rendering candles with separate colors for body, wick, and border per candle.

#### Scenario: plotcandle() with separate body, wick, and border colors
- **WHEN** `plotcandle()` is called with distinct `color`, `wickcolor`, and `bordercolor` parameters
- **THEN** the candle SHALL render with the specified body color, wick stroke color, and border color independently

#### Scenario: plotcandle() defaults to uniform color
- **WHEN** `plotcandle()` is called with only `color` specified (no `wickcolor` or `bordercolor`)
- **THEN** all three elements SHALL default to the `color` value

#### Scenario: barcolor() with per-bar color override
- **WHEN** `barcolor()` is called with a color value
- **THEN** the candle at the current bar index SHALL be colored with that color, overriding default bull/bear coloring

#### Scenario: Multiple barcolor() calls apply per-bar
- **WHEN** `barcolor()` is called on multiple consecutive bars with different colors
- **THEN** each bar SHALL display its respective assigned color

#### Scenario: Frontend CandlestickRenderer renders multi-element colors
- **WHEN** the frontend receives candle color data with separate body, wick, and border colors
- **THEN** the CandlestickRenderer SHALL render each candle element with its specified color

#### Scenario: Default bull/bear coloring preserved when no color override
- **WHEN** a candle has no associated color override from `barcolor()` or `plotcandle()`
- **THEN** the CandlestickRenderer SHALL fall back to default green-for-bullish, red-for-bearish coloring
