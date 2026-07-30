## Why

Two issues:
1. USDC balance shows $0 on config step even though it was fetched correctly on wallet import step. The balance state in `SetupWizard` doesn't receive the preview balance from `WalletImportPanel`.
2. Users can't manually override the auto-calculated daily loss.

## What Changes

- Pass preview balance from WalletImportPanel up to SetupWizard
- Add manual override toggle for maxDailyLoss
- Show both calculated and override values

## Capabilities

### Modified Capabilities

- `auto-risk-calculation`: Allow manual override of calculated value
- `frontend-application`: Fix balance state persistence between steps

## Impact

- `frontend/src/components/TradingBotPanel.tsx` — state management and UI

## Non-goals

- Real-time balance updates
- Configurable risk percentage
