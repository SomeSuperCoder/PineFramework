## Context

See proposal.md — Why.

The project currently has fragmented logging: backend uses pino to stdout, frontend and shared code use raw `console.*` with inconsistent prefixes, and there is no file-based logging or structured log storage. The `logs/` directory is already gitignored but unused. The existing `BotLogger` interface in `src/trading/bot-engine.ts` provides a 4-method contract (info/warn/error/debug) but no structured metadata or file transport.

## Goals / Non-Goals

**Goals:**
- Unified `PineLogger` interface across all three domains (frontend, backend, bot)
- Structured JSON log files in `logs/{category}/{subcategory}.log`
- AI agents can read logs directly from the filesystem
- HTTP endpoint for remote log queries
- Progressive migration — replace `console.*` in highest-impact files first

**Non-Goals:**
- Log rotation and size management (Phase 2)
- Log aggregation service integration (Loki, Datadog, etc.)
- Replacing all `console.*` calls in one shot
- Frontend log persistence beyond the session (browser storage)

## Decisions

### 1. Thin abstraction layer (PineLogger) over pino

**Decision:** Define a `PineLogger` interface in the shared `src/utils/logger/` package. Backend wraps pino. Frontend uses a lightweight browser-native implementation. Bot engine uses `PineLogger`-compatible logger.

**Why over Option A (pino everywhere):** pino is Node.js-centric. The browser adapter (`pino-browser`) adds bundle weight and is a second-class citizen. A thin abstraction lets each domain use the best tool for its environment.

**Why over Option C (custom from scratch):** We don't need to reinvent structured logging. pino already solves the hard problems (backend JSON serialization, levels, child loggers). We just need a unified interface.

**Alternatives considered:**
- Option A (pino everywhere): Rejected — browser bundle bloat, second-class frontend experience
- Option C (custom logging framework): Rejected — maintenance burden, edge cases (rotation, serialization) we don't need to solve ourselves
- Option D (extend BotLogger): Rejected — too narrow, conflates bot events with system logging

### 2. Log directory structure: `logs/{category}/{subcategory}.log`

**Decision:** Organize log files as `logs/backend/api.log`, `logs/bot/execution.log`, `logs/frontend/chart.log`, etc.

**Why:** AI agents can navigate by category and subcategory. The `logs/` directory is already gitignored. This mirrors the category/subcategory requirement from the user.

### 3. Frontend logger uses in-memory ring buffer + WebSocket forwarding

**Decision:** The frontend logger stores the last 500 entries in memory and forwards each entry to the backend via WebSocket. The backend writes forwarded entries to `logs/frontend/`.

**Why:** Browsers have no filesystem access. WebSocket forwarding leverages the existing `bot:log` channel infrastructure. The ring buffer ensures the frontend always has recent logs available even if WebSocket is disconnected.

### 4. HTTP log query endpoint (`GET /api/logs`)

**Decision:** Add a lightweight query endpoint to the Express backend that reads log files from `logs/` and returns filtered results.

**Why:** AI agents with HTTP access (e.g., running in a browser or remote environment) can query logs without filesystem access. This is Phase 2 — the primary access method is direct filesystem read.

### 5. Progressive migration of console.* calls

**Decision:** Replace `console.*` calls in highest-impact files first (TelegramService, gateway.ts, bot-engine.ts), then expand outward.

**Why:** A big-bang rewrite is risky and hard to review. Progressive migration lets us validate the logging module works before expanding it. Each replacement is a small, reviewable change.

## Risks / Trade-offs

- **[Risk] Frontend log loss on WebSocket disconnect** → Mitigation: Ring buffer retains last 500 entries; frontend can flush on reconnect
- **[Risk] Log volume grows unbounded** → Mitigation: Phase 2 will add rotation; for now, `logs/` is gitignored and can be cleaned manually
- **[Risk] Abstraction leakage between pino and browser logger** → Mitigation: The `PineLogger` interface is intentionally narrow (4 methods + structured metadata); domain-specific features stay in each implementation
- **[Risk] Migration breaks existing console.* patterns** → Mitigation: Progressive rollout; each file is changed independently with tests verifying behavior is preserved

## Migration Plan

1. Create `src/utils/logger/` shared module with `PineLogger` interface
2. Create backend implementation with pino + file transport
3. Create frontend browser logger with ring buffer + WebSocket forwarding
4. Create bot logger specialization
5. Wire `bot:log` WebSocket channel for all log levels
6. Add `GET /api/logs` endpoint
7. Replace `console.*` in highest-impact files
8. Write tests for each module
9. QA sign-off

## Open Questions

- Should the `PineLogger` interface extend the existing `BotLogger` interface or replace it entirely? (Recommendation: extend — `PineLogger` is a superset)
- What should the default log level be for the frontend logger? (Recommendation: `debug` in dev, `warn` in prod)
- Should the HTTP log query endpoint support streaming large result sets? (Recommendation: No for Phase 1 — add streaming in Phase 2)
