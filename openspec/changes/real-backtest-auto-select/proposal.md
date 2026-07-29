## Why

The current auto-select feature runs backtests **sequentially** — one pair at a time — making the evaluation phase slow and giving the user no visibility into parallel progress. Additionally, the UI still offers a manual pair selection mode (PairMatrixTable) that duplicates effort and creates confusion about which mode is active. Users expect auto-select to be the default and only path, with real backtests running across all candidate combinations simultaneously and progress displayed per-pair.

## What Changes

- **Remove manual pair selection**: The `PairMatrixTable` component and its associated state are removed. Pair selection is always handled by auto-select.
- **Auto-select is always enabled**: Remove the "Auto-select" checkbox toggle. The bot always runs auto-select when starting.
- **Parallel backtest execution**: `AutoMarketSelector.select()` runs backtests concurrently (bounded by a configurable concurrency limit) instead of sequentially. Bar data is fetched in parallel, then backtests run in parallel.
- **Per-pair progress tracking**: The progress callback emits status for each concurrent backtest — including which pairs are fetching, backtesting, completed, or failed — rather than a single `current/total` counter.
- **Frontend parallel progress display**: The dashboard shows a grid/table of all candidates with real-time status indicators (fetching spinner, backtest spinner, checkmark, error icon) instead of a single progress bar.

## Capabilities

### New Capabilities
- `parallel-auto-select`: Parallel backtest execution with per-pair progress tracking across all candidate pairs.

### Modified Capabilities

## Impact

- **Backend**: `src/trading/auto-select.ts` — `AutoMarketSelector.select()` rewritten for parallel execution with concurrency control.
- **Backend**: `SelectionProgressCallback` type updated to emit per-pair status events (phase + completion state).
- **Backend**: `backend/src/index.ts` — progress broadcast updated for new event shape.
- **Frontend**: `frontend/src/components/TradingBotPanel.tsx` — `BotConfigPanel` removes manual pair selection; `PairMatrixTable` removed; auto-select checkbox removed.
- **Frontend**: `frontend/src/components/TradingBotPanel.tsx` — `SetupWizard` and `LiveDashboard` progress display rewritten for parallel grid view.
- **Frontend**: `useBotWebSocket` hook updated to handle new progress event shape.
- **Tests**: `tests/unit/trading/auto-select.test.ts` updated for parallel execution and new progress events.
