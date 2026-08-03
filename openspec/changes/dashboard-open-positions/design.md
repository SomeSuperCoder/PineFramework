## Context

The dashboard currently has a positions section that only renders when `status.positions.length > 0`. The `BotStatusSnapshot` interface already includes a `positions: PositionSummary[]` field, and the WebSocket handler already processes `bot:position` events for opened/closed/updated positions.

The `PositionSummary` interface contains:
- `symbol`: string
- `side`: 'long' | 'short'
- `size`: number
- `entryPrice`: number
- `currentPrice`: number
- `unrealizedPnl`: number
- `openedAt`: number (timestamp)

## Goals / Non-Goals

**Goals:**
- Always show the positions panel (even when empty)
- Display comprehensive position information
- Calculate and show P&L percentage
- Show position duration
- Maintain real-time updates via WebSocket

**Non-Goals:**
- Modify backend or WebSocket protocol
- Add position closing functionality from dashboard
- Add position history or trade log

## Decisions

### Decision 1: Remove conditional rendering
**Choice**: Always render the positions panel, show "No open positions" when empty
**Rationale**: Users need to see the positions section exists even when empty
**Alternatives considered**: Keep conditional rendering (rejected - hides feature)

### Decision 2: Calculate P&L percentage client-side
**Choice**: Compute `(unrealizedPnl / (entryPrice * size)) * 100` in the component
**Rationale**: Data already available, no backend changes needed
**Alternatives considered**: Add percentage to backend (rejected - unnecessary API change)

### Decision 3: Calculate duration from timestamp
**Choice**: Use `Date.now() - openedAt` with a timer for live updates
**Rationale**: Standard approach, works with existing data
**Alternatives considered**: Backend-provided duration (rejected - adds complexity)

## Risks / Trade-offs

**[Risk]** Timer for duration updates may cause performance issues → **Mitigation**: Use `setInterval` with reasonable interval (1 second), clean up properly

**[Risk]** Empty state may confuse users → **Mitigation**: Clear "No open positions" message with styling
