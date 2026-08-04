## Why

After completing the SetupWizard flow (Config → Backtest with manual pair selection → Review → Start Bot), the mini chart does not appear on the Bot Running screen — even though the bot is running correctly. The mini chart only appears after stopping+restarting the bot or reloading the page. The manual-select flow is the only path with this bug; the auto-select path refreshes config after the backtest.

## What Changes

- LiveDashboard re-fetches the persisted bot config when the bot transitions into `Starting`/`Running`, so `persistedConfig.pairs` reflects the pair selected during the manual backtest flow before the mini chart mounts.
- The SetupWizard's manual backtest "Next" handler refreshes the persisted config after persisting the manual pair, so the review → start transition has a resolved pair available immediately.
- Add a regression test covering the full manual flow: mount with no config, select pair via manual backtest, start, assert the mini chart data pipeline (OHLCV + execute) starts.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `mini-chart`: extend the "Mini chart displays recent candles" requirement so the chart appears on first start after a manual pair selection, not only after a stop/start or page reload.

## Non-goals

- No changes to the backend `engine.start()` lifecycle, auto-select resolution, or pair persistence — the backend already stores the manual pair correctly.
- No changes to MiniChart rendering itself.
- No changes to the auto-select backtest flow behavior.

## Impact

- `frontend/src/components/TradingBotPanel.tsx` — `LiveDashboard` (persistedConfig refresh) and `SetupWizard` (manual backtest handler).
- `frontend/src/__tests__/bot-stop-step.test.tsx` — new regression test.
- No backend or API changes.
