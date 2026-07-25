## Purpose
Display alert trigger details in the chart bar tooltip when alerts are present.

## Requirements

### Requirement: Alert details in bar tooltip
The chart tooltip SHALL display alert trigger details (title, message, destination) for any bar that has one or more alerts attached, shown below OHLC values and above plot data.

#### Scenario: No alerts on bar — no alert section in tooltip
- **WHEN** the user hovers over a bar with zero alert triggers
- **THEN** the tooltip SHALL NOT render an alert section

#### Scenario: Single alert on bar
- **WHEN** the user hovers over a bar with exactly one alert trigger
- **THEN** the tooltip SHALL display the alert title prefixed with "⚠" and the alert message below

#### Scenario: Multiple alerts on same bar
- **WHEN** the user hovers over a bar with two or more alert triggers
- **THEN** each alert SHALL be displayed as a separate entry

#### Scenario: Alert destination is shown
- **WHEN** the alert has a destination set
- **THEN** the tooltip SHALL append the destination as a muted suffix

#### Scenario: Alert display does not overflow tooltip
- **WHEN** alerts would cause the tooltip to exceed chart height
- **THEN** the tooltip SHALL be capped with "+N more" indication
