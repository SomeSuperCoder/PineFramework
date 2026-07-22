## ADDED Requirements

### Requirement: Alert details in bar tooltip
The chart tooltip SHALL display alert trigger details (title, message, destination) for any bar that has one or more alerts attached, shown below the OHLC values and above plot data.

#### Scenario: No alerts on bar — no alert section in tooltip
- **WHEN** the user hovers over a bar that has zero alert triggers
- **THEN** the tooltip SHALL NOT render an alert section

#### Scenario: Single alert on bar
- **WHEN** the user hovers over a bar that has exactly one alert trigger
- **THEN** the tooltip SHALL display the alert title prefixed with "⚠" (warning sign) and the alert message on the line below

#### Scenario: Multiple alerts on same bar
- **WHEN** the user hovers over a bar that has two or more alert triggers
- **THEN** the tooltip SHALL display each alert as a separate entry, showing title and message per alert

#### Scenario: Alert destination is shown
- **WHEN** the alert has a destination set (e.g., email, webhook, Telegram)
- **THEN** the tooltip SHALL append the destination as a suffix after the alert message in a muted style

#### Scenario: Tooltip preserves existing OHLC, volume, and plot data
- **WHEN** the tooltip renders alert details
- **THEN** it SHALL still display all existing candle data (date, O, H, L, C, V) and plot values in their usual order, with the alert section inserted between OHLC and plot data

#### Scenario: Alert display does not overflow tooltip
- **WHEN** the number of alerts would cause the tooltip to exceed the chart height
- **THEN** the tooltip SHALL be capped to a maximum display height, with an indication that more alerts exist (e.g., "+N more")
