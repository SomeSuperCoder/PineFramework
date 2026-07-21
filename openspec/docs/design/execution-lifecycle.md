# Execution Lifecycle

## 1. Initialization Phase

- Load Pine Script source code
- Parse and compile to IR
- Initialize execution context
- Set up data connections
- Configure rendering environment

## 2. Historical Processing Phase

- For each historical bar (oldest to newest):
  - Update bar data
  - Execute script for current bar
  - Store series state
  - Calculate indicators
  - Generate plots and drawings
- Finalize historical state

## 3. Realtime Processing Phase

- On new bar (period rollover):
  - Rollback to last confirmed state
  - Append new bar data and execute script for the new bar
  - Store series state and update visualizations
- On forming-candle tick (same bar, intra-bar update):
  - Update last bar's OHLCV values in-place
  - Execute script for only the last bar (no historical reprocessing)
  - Push updated indicator values for the forming candle to the frontend
  - Trigger alerts if conditions met
  - Repeat for each tick/kline update within the candle's lifetime
- Repeat for each realtime update
- **FormingCandleManager delegation**: `ScriptSession` delegates forming candle operations to `FormingCandleManager` for tick/confirm lifecycle management, barTimestamps padding, and output conversion

## 4. Cleanup Phase

- Save final state
- Generate reports
- Clean up resources
- Log execution summary
