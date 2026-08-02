## Why

When the user reloads the page with a persisted bot config that has `autoSelect: true`, they land on the Review step but can't start the bot — the backend refuses with "auto-select must run before starting." The user already ran a backtest previously, but the system doesn't remember the resolved pair selection. There's no way to re-run the backtest from the Review step, so the user is stuck.

## What Changes

- The Review step detects when a backtest hasn't been run since the last page reload
- When detected, the Review step shows a "Re-run Backtest" button alongside the Start button
- Clicking "Re-run Backtest" advances the wizard to the Backtest step automatically
- After the backtest completes, the wizard returns to the Review step with the resolved config
- Backtest results are persisted (already fixed in `fix-bot-start-stale-autoselect`)

## Capabilities

### Modified Capabilities
- `bot-start-flow`: Review step gains a re-run backtest prompt when auto-select config is stale

### New Capabilities
- (none)

## Impact

- `TradingBotPanel.tsx` — Review step UI changes
- `useWizardState.ts` — wizard navigation logic
- No API changes — existing `/bot/backtest` endpoint already handles persistence
