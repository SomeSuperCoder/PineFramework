## Why

The auto-select backtest step has a manually coded progress indicator ("Evaluating Pairs (X/Y)") that duplicates what the new `ProgressBar` component already provides. Now that `ProgressBar` exists, the auto-select step should use it for consistency and DRY compliance.

## What Changes

- Replace manual "Evaluating Pairs ({current}/{total})" text with `<ProgressBar>` component
- Keep `AutoSelectGrid` for per-pair status (different purpose)
- Auto-select step uses same progress bar as single backtest

## Capabilities

### New Capabilities
None — this is a small refactor using existing components.

### Modified Capabilities
None.

## Impact

- `frontend/src/components/TradingBotPanel.tsx` — auto-select backtest step uses `ProgressBar`
