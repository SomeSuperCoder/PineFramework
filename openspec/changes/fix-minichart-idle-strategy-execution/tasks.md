## 1. Component Extraction

- [x] 1.1 Create a child component (e.g. `LiveBotView`) that owns the running view's mini chart: it calls `useBotMiniChartData` and renders `<MiniChart>` (per design.md D1)
- [x] 1.2 Move the `useBotMiniChartData` call out of the `LiveDashboard` body (line ~1945) into the new child component, passing `activePair` and `strategySource` as props
- [x] 1.3 Update `LiveDashboard` to render either `SetupWizard` (Idle/Stopped) or `LiveBotView` (Running/Stopping/Error), so the hook is never invoked while Idle
- [x] 1.4 Verify no hooks are called conditionally (rules-of-hooks) and the running view renders identically to before (metrics grid, positions, mini chart, controls)

## 2. Behavior Verification

- [x] 2.1 Confirm that with a saved config + wallet, opening the Bot Dashboard to the Review step produces NO `/api/execute` calls, NO kline WS subscriptions, and NO `[StrategyEngine]` logs (specs/mini-chart spec.md — "No strategy execution in Idle state")
- [x] 2.2 Confirm that after clicking Start Bot (Running), the mini chart fetches OHLCV, executes the strategy, subscribes to klines, and updates on new candles (specs/mini-chart spec.md — "Data pipeline starts only with the mini chart")

## 3. Tests & Quality

- [x] 3.1 Add/adjust a regression test asserting that rendering `LiveDashboard` in Idle/Stopped state does not fetch OHLCV or call `/api/execute` (extend `frontend/src/__tests__/bot-stop-step.test.tsx` pattern)
- [x] 3.2 Add a test asserting that the running view mounts the mini chart pipeline and executes the strategy
- [x] 3.3 Run the full test suite (`just test`), typecheck, and lint
