## Why

After submitting the Config step, the backtest starts automatically without giving the user a choice. This forces users into the auto-select flow even when they already know which pair and timeframe they want to trade. Users should be prompted to decide whether to run the auto-select backtest or manually choose their pair/timeframe.

## What Changes

- After Config submission, show a prompt asking the user to choose between running the auto-select backtest or manually selecting a pair/timeframe
- Manual selection path includes a warning about the implications of bypassing auto-select (no automated pair evaluation, user assumes full responsibility for selection)
- The Config step no longer directly triggers the backtest API call on submit
- The Backtest step gains a manual selection mode with timeframe and pair pickers

## Capabilities

### New Capabilities
- `config-to-backtest-prompt`: Decision prompt after config submission that lets the user choose between auto-select backtest and manual pair/timeframe selection

### Modified Capabilities
- `backtest-rerun-prompt`: The re-run flow from Review step should also respect the new manual selection option

## Impact

- `frontend/src/components/TradingBotPanel.tsx`: Config step submission flow, Backtest step rendering
- `frontend/src/components/TradingBotPanel.tsx` (`BotConfigPanel`): Remove automatic backtest trigger from `handleConfigure`
- Backtest step UI: Add manual selection mode with pair/timeframe pickers and warning
- No backend API changes required — the `/api/bot/backtest` endpoint already supports manual pair selection
