## ADDED Requirements

### Requirement: Strategy marker details in bar tooltip
The chart tooltip SHALL display strategy marker details (type, name, direction, quantity, price, comment) for any bar that has one or more strategy actions (entry, exit, close, order, cancel), shown below the OHLC values and above alert data.

#### Scenario: No markers on bar — no marker section in tooltip
- **WHEN** the user hovers over a bar that has zero strategy markers
- **THEN** the tooltip SHALL NOT render a strategy marker section

#### Scenario: Single entry marker on bar
- **WHEN** the user hovers over a bar that has exactly one entry marker
- **THEN** the tooltip SHALL display:
  - The entry name prefixed with a direction arrow (▲ for long, ▼ for short)
  - The entry quantity and price on the following line
  - The comment (if present) as an indented description line

#### Scenario: Single exit marker with comment
- **WHEN** the user hovers over a bar that has an exit marker with a comment
- **THEN** the tooltip SHALL display:
  - The exit name prefixed with "▼" (exit marker)
  - The exit quantity and price on the following line
  - The comment as an indented description line

#### Scenario: Entry and exit on same reversal bar
- **WHEN** the user hovers over a bar that has both a close/reverse and an entry
- **THEN** the tooltip SHALL display both markers, with the close/reverse shown first and the entry shown below it

#### Scenario: Multiple markers on same bar
- **WHEN** the user hovers over a bar that has two or more strategy markers
- **THEN** the tooltip SHALL display each marker as a separate entry, showing name and details per marker

#### Scenario: Marker type color coding
- **WHEN** the tooltip renders a marker line
- **THEN** it SHALL use the corresponding color for that marker type: green (#4caf50) for long entry, pink (#e91e63) for short entry, orange (#ff9800) for exit, red (#f44336) for close, yellow (#ffeb3b) for order, gray (#999999) for cancel

#### Scenario: Tooltip preserves existing OHLC, volume, alert, and plot data
- **WHEN** the tooltip renders strategy marker details
- **THEN** it SHALL still display all existing candle data (date, O, H, L, C, V), alert details, and plot values in their usual order, with the marker section inserted between OHLC and alert sections

#### Scenario: Marker display does not overflow tooltip
- **WHEN** the number of markers would cause the tooltip to exceed the chart height
- **THEN** the tooltip SHALL be capped to a maximum display of 5 markers, with an indication that more exist (e.g., "+N more")

#### Scenario: Backward compatibility with minimal marker data
- **WHEN** the tooltip receives StrategyMarkerData without optional fields (action, quantity, price)
- **THEN** the tooltip SHALL gracefully display only the available fields (name, type, direction, timestamp, color) without crashing
