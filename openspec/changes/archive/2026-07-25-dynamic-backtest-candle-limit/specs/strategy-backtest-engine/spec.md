## ADDED Requirements

### Requirement: Safe Candle Limit
The system SHALL protect against excessive data ingestion by calculating the safe maximum data range algorithmically from a single `SAFE_AMOUNT_OF_CANDLES` constant and the selected timeframe, rather than relying on hardcoded per-timeframe day limits.

#### Scenario: Algorithmic candle-per-day calculation
- **WHEN** the system needs to compute candles per day for a given timeframe
- **THEN** it SHALL calculate it as `(24 * 60) / timeframeMinutes`, with daily timeframes returning 1 and weekly timeframes returning `1/7`.

#### Scenario: Days-back slider bounds
- **WHEN** the user selects the "days back" date range mode
- **THEN** the days-back input SHALL be a slider with:
  - Minimum = `Math.ceil(0.3 * maxSafeDays)`
  - Maximum = `Math.floor(maxSafeDays)`
  where `maxSafeDays = SAFE_AMOUNT_OF_CANDLES / candlesPerDay(timeframe)`.

#### Scenario: Bar estimate exceeds safe limit
- **WHEN** the estimated bar count for the selected date range exceeds `SAFE_AMOUNT_OF_CANDLES`
- **THEN** the system SHALL display a warning and disable the "Run Backtest" button.

#### Scenario: Shared constant used by both frontend and backend
- **WHEN** either the frontend settings UI or the backend backtest service evaluates a safe data range
- **THEN** both SHALL derive their bounds from the same `SAFE_AMOUNT_OF_CANDLES` constant and the algorithmic candle-per-day calculation.
