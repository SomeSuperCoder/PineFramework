## 1. Frontend: Wizard Step Structure

- [x] 1.1 Add `backtest` to SetupWizard step union type (`'wallet' | 'config' | 'backtest' | 'review'`)
- [x] 1.2 Update StepDot indicator to show 4 steps: Wallet, Config, Backtest, Review
- [x] 1.3 Add `backtest` case to the step rendering switch in SetupWizard
- [x] 1.4 Move `autoSelectProgress` and `autoSelectResult` state from `useBotWebSocket` to SetupWizard level (passed as props)

## 2. Frontend: Backtest Step Component

- [x] 2.1 Create `BacktestStep` component in TradingBotPanel.tsx with progress grid and ranking display
- [x] 2.2 Render `AutoSelectGrid` with live `autoSelectProgress.statuses` during backtest execution
- [x] 2.3 Show "Evaluating Pairs (X/Y)" header with overall progress counter
- [x] 2.4 Show final ranking and best pair summary when `autoSelectResult` is populated
- [x] 2.5 Add "← Back" button that returns to config step and discards results (disabled during active backtests)
- [x] 2.6 Add "Next →" button that proceeds to review (disabled until backtests complete)

## 3. Frontend: Wire Backtest Trigger

- [x] 3.1 Update `BotConfigPanel.onConfigured` to transition to `backtest` step instead of `review`
- [x] 3.2 In backtest step, send `bot:configure` via WebSocket to trigger auto-select on backend
- [x] 3.3 Parse `bot:autoSelect` progress events and update `autoSelectProgress` state
- [x] 3.4 Parse `bot:autoSelect` complete event and update `autoSelectResult` state
- [x] 3.5 Handle backend errors by displaying error message in backtest step

## 4. Frontend: Review Step Update

- [x] 4.1 Update Review step to read `autoSelectResult` from props (pre-computed, not live)
- [x] 4.2 Remove auto-select progress display from Review step (it's now in Backtest step)
- [x] 4.3 Show selected pair from `autoSelectResult.best` in Review summary
- [x] 4.4 Ensure "Start Bot" button does not re-trigger auto-select

## 5. Backend: Pre-start Backtest Support

- [x] 5.1 Verify WebSocket `bot:configure` handler triggers auto-select when `autoSelect: true`
- [x] 5.2 Verify `bot:autoSelect` progress events broadcast correctly during pre-start backtests
- [x] 5.3 Verify `bot:autoSelect` complete event includes full ranking and best pair

## 6. Tests

- [ ] 6.1 Test wizard navigation: config → backtest → review flow
- [ ] 6.2 Test backtest step renders progress grid with status updates
- [ ] 6.3 Test back button from backtest step returns to config and discards results
- [ ] 6.4 Test "Next" button disabled during backtests, enabled after completion
- [ ] 6.5 Test Review step displays pre-computed results without re-running backtests
