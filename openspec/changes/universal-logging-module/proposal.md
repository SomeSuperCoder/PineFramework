## Why

Logging in PineFramework is fragmented: the backend uses pino to stdout, the frontend and shared code use raw `console.*` with inconsistent prefixes, and there is no file-based logging, no structured log storage, and no way for AI agents to access logs for debugging. A universal logging module with categories, subcategories, and gitignored file storage is needed to make the project debuggable by both humans and AI agents.

## What Changes

- Create a `PineLogger` shared interface in `src/utils/logger/` with structured metadata (category, subcategory, level, timestamp)
- Create a backend implementation wrapping pino with file transport to `logs/backend/`
- Create a frontend browser logger with in-memory ring buffer and WebSocket forwarding
- Create a bot logging specialization integrating with the existing `BotLogger` interface
- Wire the existing `bot:log` WebSocket channel for all log levels (not just errors)
- Add log categories and subcategories: `frontend` (ui, chart, ws), `backend` (api, db, cache, ws), `bot` (execution, risk, telegram, scheduler)
- Ensure `logs/` directory is gitignored and accessible to AI agents
- Progressive migration: replace `console.*` calls with the new logger in highest-impact files first

## Capabilities

### New Capabilities
- `logging-backend`: Backend logging with pino + file transport to `logs/backend/`, structured JSON for AI consumption
- `logging-frontend`: Frontend browser logger with in-memory buffer and WebSocket forwarding to backend
- `logging-bot`: Live-trading bot logging with categories/subcategories, integrated with BotEngine
- `logging-ai-access`: AI agents can read `logs/` directory directly or query via HTTP endpoint for debugging

### Modified Capabilities
- `backend-api-server`: API server now serves log query endpoint (`GET /api/logs`) for AI agent access
- `dashboard-ws`: WebSocket gateway now broadcasts all log levels via `bot:log` channel, not just errors

## Impact

- New shared module `src/utils/logger/` — used by all three packages
- New backend utilities for file-based log transport
- New frontend utilities for browser-side logging
- Updated `BotEngine` to accept `PineLogger`-compatible logger
- Updated WebSocket gateway to broadcast all log levels
- New `logs/` directory structure (already gitignored)
- `backend/package.json` — add `pino-file` or `pino-transport` for file output
- `frontend/package.json` — no new dependencies (browser logger is self-contained)
