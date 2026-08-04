## 1. Refresh persisted config on running transitions

- [x] 1.1 Extend the config-refresh effect in `LiveDashboard` (TradingBotPanel.tsx:1914) to also re-fetch `/api/bot/config` when `status.state` is `Starting` or `Running`, keeping the existing Idle/Stopped behavior. (design D1, mini-chart "Mini chart displays recent candles")
- [x] 1.2 Ensure the re-fetch updates `persistedConfig` without clobbering concurrent wallet state, mirroring the existing Idle/Stopped block.

## 2. Refresh config after manual pair persistence

- [x] 2.1 In `SetupWizard`'s manual backtest "Next" handler (TradingBotPanel.tsx:1503), after the `/api/bot/configure` POST succeeds, re-fetch `/api/bot/config` and propagate the result up to `LiveDashboard.persistedConfig` — reuse the `onBacktestStarted` pattern. (design D2)

## 3. Regression test

- [x] 3.1 Add a test to `bot-stop-step.test.tsx` that mounts `LiveDashboard` with a config GET returning empty/no pairs, drives the manual backtest flow (pair selection + configure POST), transitions to Running, and asserts the mini chart data pipeline (`/api/ohlcv` + `/api/execute`) starts. (mini-chart "Mini chart appears on first start after manual pair selection")
- [x] 3.2 Add a test that a Running transition triggers a config re-fetch when `persistedConfig` was stale. (mini-chart "Mini chart appears after reload with persisted manual pair")

## 4. Verification

- [x] 4.1 Run frontend tests (`pnpm --filter pine-framework-frontend test`) and lint; confirm the new regression tests pass.
- [x] 4.2 Manually verify the flow: Config → Backtest (manual pair) → Review → Start Bot shows the mini chart on first start.
