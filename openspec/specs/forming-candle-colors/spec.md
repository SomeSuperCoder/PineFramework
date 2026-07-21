## Purpose
Implement and verify Forming Candle Colors functionality for the forming-candle-colors module.

## Requirements

### Requirement: Forming Candle Colors
The forming (live) candle SHALL be rendered with a distinct color from confirmed candles.

#### Scenario: Forming Candle Styling
- **WHEN** the current bar is a forming candle
- **THEN** the candle SHALL be rendered with a distinct color/style

#### Scenario: Forming-to-Confirmed Transition
- **WHEN** the bar confirms
- **THEN** the candle color SHALL transition from forming to confirmed colors
