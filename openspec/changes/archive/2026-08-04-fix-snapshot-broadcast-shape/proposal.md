## Why

The snapshot broadcast added in `fix-duration-snapshot-on-start` sends the snapshot flat as `data: snapshot`, but the frontend expects `data: { status: snapshot }`. This causes `setStatus(undefined)`, crashing the running bot dashboard immediately after it appears.

## What Changes

- Wrap the snapshot in `{ status: ... }` to match the message shape the gateway sends on connect

## Impact

- Backend only: `backend/src/index.ts` line ~249
- One-line fix
