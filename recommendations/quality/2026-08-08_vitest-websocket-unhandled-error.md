# vitest exits 1 on undici WebSocket unhandled error in logger tests
**Date:** 2026-08-08
**Source:** Test Engineer (shadcn conversion test pass)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
`frontend/src/__tests__/logger/index.test.ts` leaves an undici WebSocket connection open; after the suite finishes, undici fires a `dispatchEvent` with a jsdom Event instance → `TypeError: The "event" argument must be an instance of Event. Received an instance of Event`. Vitest counts 1 unhandled error and the runner **exits 1 even though all 259 tests pass** — a green suite that the commit gate sees as red.

Fix: in the logger/WebSocket-forwarder area, either mock `globalThis.WebSocket` outright, or `abort()`/`close()` the undici socket and await its close before test teardown so no async event fires post-run.

## Rationale
Not caused by the shadcn conversion (present at baseline, appears in every run); but it blocks a clean `vitest run` exit code for the whole frontend suite.

## Evidence
- `src/__tests__/logger/index.test.ts` runs pass; at suite end `vitest` reports `Errors 1 error` and `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` with exit 1.
- Stack: `undici/lib/web/websocket/websocket.js → WebSocket.dispatchEvent → event_target:771` ("event" must be instance of Event).