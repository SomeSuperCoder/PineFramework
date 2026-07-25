## Why

The backtest system's "safe days per timeframe" limits are hardcoded via a `BARS_PER_DAY` lookup table and a `MAX_BARS` constant. Each timeframe must be manually added to the table, and the relationship between bars and days is implicit and error-prone. This creates maintenance burden and makes it impossible to adjust the safety margin dynamically. We need a single source of truth (`SAFE_AMOUNT_OF_CANDLES`) and algorithmic candle-per-day calculation so the system self-adapts to any timeframe.

## What Changes

- **Replace** `MAX_BARS` (1500) with a **global constant** `SAFE_AMOUNT_OF_CANDLES` (also 1500, but named for clarity and moved to a shared location).
- **Replace** the hardcoded `BARS_PER_DAY` lookup table with an **algorithmic function** `candlesPerDay(timeframe)` that computes it as `(24 * 60) / timeframeInMinutes`, handling minute-based, daily, and weekly timeframes correctly.
- **Convert** the days-back `NumberInput` into a **slider** with:
  - Minimum value = `Math.ceil(0.3 * maxSafeDays)`
  - Maximum value = `Math.floor(maxSafeDays)` where `maxSafeDays = SAFE_AMOUNT_OF_CANDLES / candlesPerDay(timeframe)`
- **Re-export** `SAFE_AMOUNT_OF_CANDLES` and `candlesPerDay()` from a shared location so both frontend (settings UI) and backend (server-side limit enforcement) can consume them.
- Remove the hardcoded `BARS_PER_DAY` map entirely — no manual edits needed when adding new timeframes.

## Capabilities

### New Capabilities

- *(none — this is a modification of existing behavior)*

### Modified Capabilities

- `strategy-backtest-engine`: Add a **"Safe Candle Limit"** requirement — the backtest system SHALL enforce a data safety bound using the algorithmic candle-per-day calculation rather than hardcoded per-timeframe limits.

## Non-goals

- No change to backend backtest execution logic (the server still accepts whatever range is sent; the frontend enforces the UI constraint).
- No change to the traditional (start/end date) date range mode — only the "days back" slider is affected.
- No change to the `SAFE_AMOUNT_OF_CANDLES` default value (remains 1500 for backward compatibility — tuning is a separate concern).

## Impact

- **`frontend/src/components/BacktestGeneralSettings.tsx`**: Replace `MAX_BARS`, `BARS_PER_DAY`, `getMaxDays()`, and `estimateBars()` with shared utilities; replace `NumberInput` (days back) with a slider component.
- **`frontend/src/components/BacktestSettingsPopup.tsx`**: Minor — pass updated state properly from slider.
- **New shared utility** (e.g., `frontend/src/utils/candleLimit.ts`): Export `SAFE_AMOUNT_OF_CANDLES`, `candlesPerDay()`, `maxSafeDays()`, `maxSafeBars()`, `estimateBars()`, `sliderBounds()`.
- **Tests**: Unit tests for the algorithmic calculation and slider bounds.
