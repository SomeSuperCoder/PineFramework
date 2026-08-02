## Why

The dashboard header has redundant controls. The "Start Bot" button in the header duplicates the Start button already in the Review step of the setup wizard. The pin/full-screen toggle button adds UI clutter without meaningful value — users don't need to pin/unpin the dashboard.

## What Changes

- **Remove** the "Start Bot" button from the LiveDashboard header (Idle/Stopped view)
- **Remove** the pin/full-screen toggle button from both Idle/Stopped and Running views
- **Keep** the Stop and Emergency Stop buttons in the Running view header
- **Keep** the Reset button in the Error view header
- **Keep** the close (✕) button in both views

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none — pure UI cleanup, no spec-level behavior changes)

## Impact

- `TradingBotPanel.tsx` — LiveDashboard component header sections
- No API changes, no behavioral changes to bot start/stop flow
