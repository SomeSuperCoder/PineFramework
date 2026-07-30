## Why

After clicking "Apply configuration" in the setup wizard, the bot immediately shows "Review & Start" with no visible backtest execution. The auto-select backtests only run when the user clicks "Start Bot", making the process feel instant and uninformative. Users need to see the parallel backtests running with clear visual feedback before committing to start live trading.

## What Changes

- Add a new wizard step "Backtest" between Config and Review where auto-select runs visibly
- Show real-time per-pair progress grid with status icons (fetching → backtesting → done/failed)
- Display final ranking with best pair highlighted before proceeding to Review
- User can go back to Config from the Backtest step (before backtests complete)
- Review step shows pre-computed results instead of triggering backtests

## Capabilities

### New Capabilities
- `auto-backtest-visual-flow`: Visual backtest step in the setup wizard with real-time progress display and ranking results before bot start

### Modified Capabilities
- `auto-market-selection`: Backtests now run during wizard flow (between config and review) instead of at bot start time; results cached for review step

## Impact

- `frontend/src/components/TradingBotPanel.tsx` — SetupWizard gains a 4th step; BotConfigPanel `onConfigured` triggers backtest instead of跳to review; new BacktestStep component
- `backend/src/routes/bot.ts` — New endpoint to trigger pre-start backtests (or reuse existing configure + auto-select flow)
- `backend/src/ws/bot-gateway.ts` — Broadcast progress for pre-start backtests
- Review step reads cached autoSelectResult instead of waiting for start-time backtests
