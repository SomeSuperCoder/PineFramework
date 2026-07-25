## ADDED Requirements

### Requirement: Debug mode highlights forming candle

When the chart's debug mode is enabled, the current real-time (forming) candle SHALL be rendered with a blue color override to distinguish it from historical bars.

#### Scenario: Debug mode on shows blue forming candle
- **WHEN** the chart has `debugMode = true` and at least 1 candle exists
- **THEN** `candles[candles.length - 1]` SHALL be rendered with a blue body, blue wick, and blue border (`#2196f3`)

#### Scenario: Debug mode off shows default colors
- **WHEN** `debugMode` transitions from `true` to `false`
- **THEN** the last candle SHALL revert to its default bull (green) or bear (red) coloring

#### Scenario: Highlight tracks the latest candle on new data
- **WHEN** a new candle is appended to `candles[]` while `debugMode = true`
- **THEN** the highlight SHALL shift to `candles[newLength - 1]` and the previously highlighted candle SHALL return to default coloring
