## MODIFIED Requirements

### Requirement: Safe Candle Limit

The system SHALL protect against excessive data ingestion by calculating the safe maximum data range algorithmically from a single `SAFE_AMOUNT_OF_CANDLES` constant and the selected timeframe, rather than relying on hardcoded per-timeframe day limits. The guardrail SHALL apply to BOTH date-range modes: days-back and explicit date range. Explicit range SHALL be validated so start <= end, end <= today, range length >= 1 day, and the estimated bar count does not exceed the safe limit; violations SHALL block the run with a visible message, and out-of-bounds values SHALL be clamped on change and on mount (migrated stale values).

#### Scenario: Algorithmic candle-per-day calculation

- **WHEN** the system needs to compute candles per day for a given timeframe
- **THEN** it SHALL calculate it as `(24 * 60) / timeframeMinutes`, with daily timeframes returning 1 and weekly timeframes returning `1/7`.

#### Scenario: Days-back slider bounds

- **WHEN** the user selects the "days back" date range mode
- **THEN** the days-back input SHALL be a slider with:
  - Minimum = `Math.ceil(0.3 * maxSafeDays)`
  - Maximum = `Math.floor(maxSafeDays)`
  where `maxSafeDays = SAFE_AMOUNT_OF_CANDLES / candlesPerDay(timeframe)`.

#### Scenario: Explicit date range validated

- **WHEN** the user selects the "date range" mode and the start date is after the end date
- **THEN** the system SHALL show a validation error and disable the "Run Backtest" button

#### Scenario: Explicit date range end not in future

- **WHEN** the user sets an end date in the future
- **THEN** the system SHALL clamp or reject the future end date and show a validation error

#### Scenario: Explicit date range bar estimate exceeds safe limit

- **WHEN** the estimated bar count for the explicit date range exceeds `SAFE_AMOUNT_OF_CANDLES`
- **THEN** the system SHALL display a warning and disable the "Run Backtest" button

#### Scenario: Out-of-bounds values clamped on mount

- **WHEN** the panel restores persisted values that fall outside the current safe bounds (e.g. a stale `daysBack` after a timeframe change)
- **THEN** the system SHALL clamp them to the valid range on mount

#### Scenario: Shared constant used by both frontend and backend

- **WHEN** either the frontend settings UI or the backend backtest service evaluates a safe data range
- **THEN** both SHALL derive their bounds from the same `SAFE_AMOUNT_OF_CANDLES` constant and the algorithmic candle-per-day calculation.
