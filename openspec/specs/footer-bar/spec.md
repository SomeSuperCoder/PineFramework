## Purpose
Implement and verify Footer Bar functionality for the footer-bar module.

## Requirements

### Requirement: Footer Bar
The chart SHALL display a footer bar showing current symbol name, timeframe, bar index, and cursor OHLC values.

#### Scenario: Symbol Display
- **WHEN** a symbol is loaded
- **THEN** the footer bar SHALL show the current symbol and timeframe

#### Scenario: Bar Index Display
- **WHEN** the cursor moves over the chart
- **THEN** the footer bar SHALL show the current bar index

#### Scenario: Cursor OHLC Display
- **WHEN** the cursor is over a bar
- **THEN** the footer bar SHALL show the bar's OHLC values
