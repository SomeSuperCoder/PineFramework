## Why

The max daily loss is currently a static user input (default $50). This doesn't scale with wallet size — a $100 wallet and a $10,000 wallet use the same limit. Auto-calculating from USDC balance ensures proportional risk: `min($1, 10% * USDC balance)`.

## What Changes

- Frontend: Auto-calculate maxDailyLoss from fetched USDC balance
- Frontend: Remove manual input, show calculated value
- Backend: No changes needed (receives the calculated value)

## Capabilities

### New Capabilities

- `auto-risk-calculation`: Calculate max daily loss as min($1, 10% × USDC balance)

### Modified Capabilities

- `frontend-application`: BotConfigPanel uses auto-calculated risk instead of manual input

## Impact

- `frontend/src/components/TradingBotPanel.tsx` — BotConfigPanel state and display

## Non-goals

- Manual override of calculated value
- Configurable risk percentage (hardcode 10%)
- Multi-token risk calculation (USDC only)
