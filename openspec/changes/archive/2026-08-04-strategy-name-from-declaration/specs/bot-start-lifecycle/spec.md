## MODIFIED Requirements

### Requirement: Start error message surfaced to user

When `POST /api/bot/start` fails and returns an error message, the frontend Review step SHALL display the backend's specific error message to the user, not a generic string. The message SHALL be shown in the existing error display area below the Start button.

#### Scenario: Start error message shown on Review step

- **WHEN** the user clicks "Start Bot" on the Review step and the backend returns HTTP 400 with `{ "error": "<message>" }`
- **THEN** the Review step SHALL display the backend's `<message>` in the error display area below the Start button

## ADDED Requirements

### Requirement: Review step shows derived strategy name

The bot setup Review step SHALL display the derived strategy name in its `Strategy:` row. The displayed name SHALL be the name derived from the strategy declaration in the configured `strategySource`, not the raw source text. When no name can be derived, the row SHALL display a neutral fallback label.

#### Scenario: Review step shows name from strategy declaration

- **WHEN** the Review step is shown and `strategySource` contains `strategy("MA Crossover", overlay=true)`
- **THEN** the `Strategy:` row SHALL display `MA Crossover`

#### Scenario: Review step falls back when no name derivable

- **WHEN** the Review step is shown and `strategySource` contains no derivable name (for example a pasted script with no declaration)
- **THEN** the `Strategy:` row SHALL display a neutral fallback (e.g. `(unnamed strategy)`) and SHALL NOT display the first line of source code

### Requirement: Running dashboard shows derived strategy name

The bot status snapshot SHALL expose the derived strategy name in `strategyName`, and the running dashboard left panel SHALL display it in its `Strategy` metric. The value SHALL be the name derived from the configured `strategySource` declaration, not a truncated substring of the source. When the bot has no configured source, the snapshot SHALL report `(not configured)`.

#### Scenario: Dashboard Strategy metric shows derived name

- **WHEN** the bot is running with a strategy source containing `strategy("SMA Crossover")`
- **THEN** the snapshot's `strategyName` is `SMA Crossover` and the dashboard `Strategy` metric displays it

#### Scenario: Dashboard reports not configured

- **WHEN** the bot has no configured strategy source
- **THEN** the snapshot's `strategyName` is `(not configured)`

#### Scenario: Dashboard name truncated to a sane length

- **WHEN** the derived name is longer than 50 characters
- **THEN** the snapshot SHALL truncate the displayed name to at most 50 characters to keep the left panel compact
