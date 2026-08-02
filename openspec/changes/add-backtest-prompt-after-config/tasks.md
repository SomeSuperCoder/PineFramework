## 1. State Machine Updates

- [x] 1.1 Add `'backtest-choice'` to the step union type in `TradingBotWizard`
- [x] 1.2 Add `backtestMode: 'auto' | 'manual'` state variable
- [x] 1.3 Add `manualPair` state variable to hold user's manual selection
- [x] 1.4 Update `getInitialStep` to handle the new step in the flow

## 2. Config Step Changes

- [x] 2.1 Remove the `fetch('/api/bot/backtest')` call from `BotConfigPanel.handleConfigure`
- [x] 2.2 Change `onConfigured` callback to advance to `'backtest-choice'` instead of `'backtest'`
- [x] 2.3 Verify config is still saved via `POST /api/bot/configure` before advancing

## 3. Backtest Choice Prompt

- [x] 3.1 Create the `BacktestChoicePrompt` component with two option buttons
- [x] 3.2 Style the prompt with clear visual hierarchy (auto-select as primary, manual as secondary)
- [x] 3.3 Wire auto-select button to set `backtestMode` to `'auto'`, trigger backtest API, and advance to `'backtest'`
- [x] 3.4 Wire manual button to set `backtestMode` to `'manual'` and advance to `'backtest'`
- [x] 3.5 Add the prompt to the wizard's render logic for the `'backtest-choice'` step
- [x] 3.6 Add a "Back" button to return to the Config step from the choice prompt

## 4. Manual Selection UI

- [x] 4.1 Add manual selection mode rendering in the Backtest step (shown when `backtestMode === 'manual'`)
- [x] 4.2 Display the amber warning about bypassing auto-select
- [x] 4.3 Create pair selector dropdown (BTC, ETH, SOL or fetched from backend)
- [x] 4.4 Create timeframe selector dropdown (5m, 15m, 1h, 4h)
- [x] 4.5 Store selection in `manualPair` state
- [x] 4.6 Enable "Next" button when pair and timeframe are selected
- [x] 4.7 Wire "Next" to advance to Review with the manual selection

## 5. Review Step Integration

- [x] 5.1 Update Review step to display `manualPair` when in manual mode (instead of `autoSelectResult`)
- [x] 5.2 Ensure the persisted config reflects manual selection for `engine.start()`

## 6. Re-run Flow Update

- [x] 6.1 Modify `handleRerunBacktest` to advance to `'backtest-choice'` instead of `'backtest'`
- [x] 6.2 Remove the direct backtest API call from `handleRerunBacktest`
- [x] 6.3 Verify the choice prompt appears when re-running from Review

## 7. Testing

- [ ] 7.1 Write test for config submission advancing to choice prompt (not backtest)
- [ ] 7.2 Write test for auto-select choice triggering backtest
- [ ] 7.3 Write test for manual choice showing warning and pickers
- [ ] 7.4 Write test for manual selection advancing to Review with correct pair
- [ ] 7.5 Write test for re-run flow showing choice prompt
- [ ] 7.6 Run existing tests to verify no regressions
