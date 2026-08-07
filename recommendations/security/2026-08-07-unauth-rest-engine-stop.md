# Unauthenticated REST engine-stop endpoints
**Date:** 2026-08-07
**Source:** Security Engineer (during stop-gating review)
**Priority:** high
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Gate `POST /api/bot/stop` and `POST /api/bot/emergency-stop` (backend/src/routes/bot.ts:82,101) behind authentication. The router is mounted at `app.use('/api', ...)` (index.ts:538) with NO auth middleware — any network-reachable client can halt the trading engine without credentials.

## Rationale
Same authority boundary just hardened for Telegram (stop/emergency callbacks now operator-gated), but the REST surface remains open. An attacker reaching the server can stop the engine with a single unauthenticated POST.

## Evidence
- backend/src/routes/bot.ts:82 — POST /api/bot/stop, no auth
- backend/src/routes/bot.ts:101 — POST /api/bot/emergency-stop, no auth
- backend/src/index.ts:538 — createBotRouter mounted at /api with no auth middleware; only global middleware is request logging (index.ts:63)
- grep confirmed zero auth guards (authorization/Bearer/API-key) in backend/src

## Suggested fix (when approved)
Add an auth guard to the /api bot router (match whatever auth the app uses elsewhere, or add API-key/bearer), then verify /api/bot/stop and /api/bot/emergency-stop require it. Test: unauthenticated POST → 401/403; authenticated operator → 200.
