## Context

The bot dashboard has a Metrics grid showing key stats. One metric is "Duration" — how long the bot has been running. It currently displays `fmtDur(status.uptimeMs)`, but `uptimeMs` is a snapshot value captured once on WebSocket connect and never refreshed by the backend.

The frontend already has:
- A 1-second `now` timer (line 1956) used for per-position duration
- `status.startedAt` (a timestamp) available from the initial snapshot

## Goals / Non-Goals

**Goals:**
- Make the Duration metric tick in real-time

**Non-Goals:**
- Backend changes to broadcast periodic status snapshots
- Fixing the empty positions array (separate Phase 2 gap)

## Decisions

### Decision: Compute uptime client-side

Replace `fmtDur(status.uptimeMs)` with `fmtDur(now - (status.startedAt ?? 0))`.

**Rationale:** The `now` timer already ticks every second and `startedAt` is already in the snapshot. This is a one-line change with zero backend impact.

**Alternatives considered:**
1. *Backend periodic broadcast* — Send full snapshots on a timer. Rejected: heavier change, unnecessary for one metric.
2. *Frontend polling `/api/bot/status`* — Extra HTTP requests. Rejected: wasteful when the data is already available client-side.

## Risks / Trade-offs

- [Clock drift between client and server] → Mitigated: `startedAt` is a timestamp, `now` is client-side `Date.now()`. Both are millisecond epoch. Drift is negligible for display purposes.
- [If `startedAt` is null (bot not started)] → Mitigated: `?? 0` fallback shows `—` via existing `fmtDur` guard (`ms <= 0`).
