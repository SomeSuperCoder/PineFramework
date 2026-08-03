## Why

The dashboard currently only shows open positions when they exist (`status.positions.length > 0`). Users need to always see the positions panel to understand the current trading state, even when no positions are open. Additionally, the current display is minimal and lacks important details like current price, P&L percentage, and position duration.

## What Changes

- Always display the positions panel in the dashboard (even when empty)
- Show "No open positions" message when positions array is empty
- Add current price display for each position
- Add P&L percentage calculation and display
- Add position duration (time since opened)
- Improve visual formatting with better spacing and colors

## Capabilities

### New Capabilities

- `dashboard-positions-panel`: Enhanced positions display that always shows current trading positions with detailed information

### Modified Capabilities

(None - this extends existing functionality without changing requirements)

## Impact

- Frontend only: `frontend/src/components/TradingBotPanel.tsx`
- No backend changes required (data already available in `BotStatusSnapshot.positions`)
- No API changes required
