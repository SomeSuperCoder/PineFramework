## Why

The "Duration" metric on the bot running screen is perpetually stuck at `—` when the client connects before the bot starts. The backend's `stateChange` event carries only `{current, previous, reason, timestamp}` — it does not include `startedAt`. The frontend merges only `state` into its status object, so `startedAt` stays `null` from the initial snapshot forever.

The root cause is architectural: the backend sends a full snapshot once on WebSocket connect, but never re-sends one when the bot transitions to Running. The newly-set `_startedAt` timestamp is never delivered to an already-connected client.

## What Changes

- After the bot transitions to `Running`, the backend re-broadcasts a full `getSnapshot()` to all WebSocket clients
- This delivers the correct `startedAt` and `uptimeMs` to the frontend
- The Duration metric starts ticking immediately after the bot starts

## Non-goals

- Per-periodic snapshot broadcasts (only on state transitions)
- Frontend-side workarounds (polling, re-fetching)

## Impact

- Backend only: `backend/src/index.ts` — add snapshot broadcast after `stateChange` event for `Running` state
- No API, protocol, or frontend changes
- No breaking changes
