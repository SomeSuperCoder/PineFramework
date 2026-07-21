## Purpose
Implement and verify Input Parameters functionality for the input-configuration module.

## Requirements

### Requirement: Input Parameters
The engine SHALL support input() with full parameter set: type, title, default value, min/max, step, options, group, inline, tooltip, confirm, and display.

#### Scenario: Input Declaration
- **WHEN** input() is called
- **THEN** the engine SHALL register a configurable input parameter with all specified properties

#### Scenario: Input Groups
- **WHEN** input() specifies a group
- **THEN** inputs SHALL be grouped in the UI under the group name

#### Scenario: Input Tooltip
- **WHEN** input() specifies a tooltip
- **THEN** the tooltip SHALL be displayed on hover in the settings panel

#### Scenario: Input Inline
- **WHEN** input() specifies inline
- **THEN** inputs SHALL be displayed on the same line

#### Scenario: Input Confirm
- **WHEN** input() specifies confirm=true
- **THEN** a confirmation dialog SHALL prompt the user

#### Scenario: Input Display
- **WHEN** input() specifies display parameter
- **THEN** the engine SHALL respect the display mode

#### Scenario: Input Source Type
- **WHEN** `input.source()` is used
- **THEN** the engine SHALL allow selection of an existing plot/indicator as the source

#### Scenario: Input Price Type
- **WHEN** `input.price()` is used
- **WHEN** `input.symbol()` is used
- **THEN** the engine SHALL provide a price input or symbol selector respectively

#### Scenario: Input Session Type
- **WHEN** `input.session()` is used
- **THEN** the engine SHALL provide a trading session time selector

#### Scenario: Input Timeframe Type
- **WHEN** `input.timeframe()` is used
- **THEN** the engine SHALL provide a timeframe dropdown (1m, 5m, 15m, 1h, 4h, 1d, etc.)

#### Scenario: Input Color Type
- **WHEN** `input.color()` is used
- **THEN** the engine SHALL provide a color picker in the UI
