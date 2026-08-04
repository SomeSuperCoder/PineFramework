## Context

The gateway's `sendSnapshot` wraps the snapshot as `{ status: engine.getSnapshot(), chaosSignals: [...] }`. The frontend reads `msg.data.status`. Our broadcast sent the snapshot flat.

## Decisions

### Match the gateway's message shape

Wrap the broadcast data as `data: { status: botEngine.getSnapshot() }`. No chaosSignals needed for a runtime update — the frontend already has them.

## Risks / Trade-offs

- None — single-line alignment with existing convention
