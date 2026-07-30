## Why

The auto-select backtest currently runs all pairs in parallel with a single progress indicator. Users need to see individual progress per pair+timeframe, and the backtest should run sequentially for now to avoid overwhelming the API and to provide clearer progress feedback.

The backtest engine has a hard limit of 1500 bars per run (`backend/src/backtest-runner.ts:50`). Each pair+timeframe should fetch up to this limit based on its timeframe (e.g., 60m gets 1500 candles = 1500 hours; 240m gets 1500 candles = 6000 hours).

## What Changes

- Auto-select runs sequentially (one pair at a time) instead of parallel
- Each pair+timeframe shows its own progress bar with candle count
- Candle count per pair determined by `min(1500, timeframe_candles_in_90_days)`
- Progress events include per-pair candle progress (fetched/total)
- `AutoSelectGrid` shows individual progress bars per row

## Capabilities

### New Capabilities
None — this modifies existing auto-select behavior.

### Modified Capabilities
- `auto-market-selection`: Sequential execution with per-pair progress bars and candle-based progress tracking

## Impact

- `src/trading/auto-select.ts` — sequential execution, per-pair progress with candle counts
- `frontend/src/components/TradingBotPanel.tsx` — `AutoSelectGrid` shows per-pair progress bars
- `frontend/src/hooks/useAutoSelectProgress.ts` — progress type includes candle progress
