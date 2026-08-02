## 1. Wizard State

- [x] 1.1 Add `backtestRunThisSession: boolean` to wizard state (default: `false`)
- [x] 1.2 Set `backtestRunThisSession: true` when Config step triggers backtest
- [x] 1.3 Expose `setBacktestRunThisSession` from useWizardState hook

## 2. Review Step UI

- [x] 2.1 Add `onRerunBacktest` callback prop to Review step component
- [x] 2.2 Show "Re-run Backtest" button when `config.autoSelect === true && !backtestRunThisSession`
- [x] 2.3 Style button to be visually distinct from Start button (secondary/outline style)
- [x] 2.4 Place button below or beside the Start button

## 3. Wizard Navigation

- [x] 3.1 Implement `goToBacktest` function in useWizardState that advances to Backtest step
- [x] 3.2 Wire "Re-run Backtest" button click to `goToBacktest`
- [x] 3.3 Ensure Backtest step auto-starts when navigated to via re-run (check existing auto-start logic)

## 4. Integration

- [x] 4.1 Pass `backtestRunThisSession` and `setBacktestRunThisSession` from LiveDashboard to Review
- [x] 4.2 Verify: reload page → Review shows re-run button when config has autoSelect: true
- [x] 4.3 Verify: click re-run → Backtest runs → Review returns with resolved config
- [x] 4.4 Verify: after re-run, page reload → re-run button no longer shows (config persisted)
