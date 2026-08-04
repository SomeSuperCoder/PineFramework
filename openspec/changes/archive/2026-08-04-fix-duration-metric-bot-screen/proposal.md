## Why

The "Duration" metric on the bot running screen is frozen. It captures `uptimeMs` once when the WebSocket connects and never updates — the value is stale from the moment it appears. Users see a duration that doesn't tick.

The backend computes `uptimeMs` at snapshot-build time but never broadcasts periodic refreshes. The frontend has a 1-second timer (`now`) and the `startedAt` timestamp available, but uses neither for the bot duration display.

## What Changes

- Replace `fmtDur(status.uptimeMs)` with a client-side computation: `fmtDur(now - (status.startedAt ?? 0))` using the existing 1-second timer
- The Duration metric now ticks in real-time, updating every second

## Non-goals

- Backend changes to broadcast periodic status snapshots (out of scope for this fix)
- Per-position duration (already uses `now - pos.openedAt` correctly; positions are empty due to a separate Phase 2 gap)
- DashboardWsService integration (unused in current architecture)

## Impact

- Frontend only: `frontend/src/components/TradingBotPanel.tsx` line 2229
- No API or WebSocket protocol changes
- No breaking changes
