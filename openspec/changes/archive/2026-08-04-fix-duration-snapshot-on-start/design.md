## Context

The WebSocket gateway (`bot-gateway.ts`) already has a `sendSnapshot()` function that sends a full `engine.getSnapshot()` to a client. It's called on connect. The gateway's `createBotWSGateway` returns a `broadcast()` function used by `index.ts` to push events.

The engine emits `stateChange` with `{previous, current, reason, timestamp}`. The backend wires this to `botWS.broadcast()` with channel `bot:state`.

## Goals / Non-Goals

**Goals:**
- Deliver the correct `startedAt` to already-connected clients when the bot starts

**Non-Goals:**
- Periodic snapshot broadcasts
- Frontend changes

## Decisions

### Decision: Broadcast full snapshot on Running transition

In `index.ts`, after the `stateChange` broadcast, check if `event.current === 'Running'`. If so, call `engine.getSnapshot()` and broadcast it on `bot:snapshot` channel with type `snapshot`.

**Rationale:** Reuses the existing snapshot infrastructure. Any future fields added to `getSnapshot()` automatically propagate. One broadcast on a rare event (bot start), not a hot path.

**Alternatives considered:**
1. *Add `startedAt` to `stateChange` payload* — Tight coupling between event shape and frontend needs. Breaks if new fields are added later.
2. *Frontend re-fetches `/api/bot/status` on state change* — Extra HTTP round-trip, polling anti-pattern when WebSocket is available.

## Risks / Trade-offs

- [Frontend double-processes snapshot] → The `bot:state` broadcast still fires, setting `state: 'Running'`. The subsequent `bot:snapshot` sets the full status including `startedAt`. Both arrive in order over the same WebSocket. No conflict — snapshot overwrites the partial status cleanly.
- [Snapshot sent to wrong clients] → `broadcast()` sends to all connected WS clients. If multiple tabs are open, all get the update. Correct behavior.
