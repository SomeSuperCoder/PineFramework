## 1. Shared Logger Interface

- [ ] 1.1 Create `src/utils/logger/` directory with `PineLogger` interface (info/warn/error/debug + structured metadata: category, subcategory, timestamp, meta)
- [ ] 1.2 Create `src/utils/logger/types.ts` — define `LogEntry`, `LogMeta`, `PineLogger` interface
- [ ] 1.3 Create `src/utils/logger/index.ts` — export the interface and factory function signature
- [ ] 1.4 Add `src/utils/logger/` to the root `tsconfig.json` include path

## 2. Backend Logger Implementation

- [ ] 2.1 Create `backend/src/utils/logger/` directory with pino-based backend logger
- [ ] 2.2 Implement `createBackendLogger(category, subcategory)` — wraps pino with file transport to `logs/backend/{subcategory}.log`
- [ ] 2.3 Add `pino-file` or `pino-transport` dependency to `backend/package.json`
- [ ] 2.4 Support `LOG_LEVEL` env var for minimum log level
- [ ] 2.5 Dev mode: pino-pretty stdout; Production mode: JSON file output only
- [ ] 2.6 Update `backend/src/utils/logger.ts` to use the new backend logger internally (keep backward compatibility)
- [ ] 2.7 Replace `console.*` in `backend/src/telegram/TelegramService.ts` with backend logger
- [ ] 2.8 Replace `console.*` in `backend/src/ws/gateway.ts` with backend logger
- [ ] 2.9 Replace `console.*` in `backend/src/routes/ohlcv.ts` with backend logger

## 3. Frontend Logger Implementation

- [ ] 3.1 Create `frontend/src/utils/logger/` directory with browser-native logger
- [ ] 3.2 Implement `createFrontendLogger(category, subcategory)` — in-memory ring buffer (max 500 entries) + WebSocket forwarding
- [ ] 3.3 Implement `flush()` method to retrieve buffered logs for AI agent access
- [ ] 3.4 No external dependencies — pure TypeScript/JavaScript
- [ ] 3.5 Replace `console.*` in `frontend/src/hooks/useChartData.ts` with frontend logger
- [ ] 3.6 Replace `console.*` in `frontend/src/components/TradingBotPanel.tsx` with frontend logger

## 4. Bot Logger Integration

- [ ] 4.1 Create `src/utils/logger/bot.ts` — bot logger specialization with `category: "bot"`
- [ ] 4.2 Subcategories: `execution`, `risk`, `telegram`, `scheduler`, `wallet`, `strategy`
- [ ] 4.3 Update `BotEngine` constructor to accept `PineLogger`-compatible logger (extend `BotLogger` interface)
- [ ] 4.4 Replace `consoleLogger` fallback with `PineLogger`-backed default logger
- [ ] 4.5 Wire `bot:log` WebSocket channel for all log levels (not just errors) in `backend/src/index.ts`

## 5. AI Agent Access

- [ ] 5.1 Ensure `logs/` directory structure is `logs/{category}/{subcategory}.log`
- [ ] 5.2 Verify `.gitignore` already covers `logs/` and `*.log` (it does)
- [ ] 5.3 Add `GET /api/logs` endpoint to Express backend for remote log queries
- [ ] 5.4 Endpoint supports query params: `category`, `subcategory`, `level`, `limit`

## 6. Testing

- [ ] 6.1 Write unit tests for `PineLogger` interface (shared package)
- [ ] 6.2 Write unit tests for backend logger (file output, log levels, categories)
- [ ] 6.3 Write unit tests for frontend logger (ring buffer, WebSocket forwarding)
- [ ] 6.4 Write unit tests for bot logger (subcategories, metadata)
- [ ] 6.5 Write integration test for `GET /api/logs` endpoint
- [ ] 6.6 Verify existing tests still pass after console.* replacements

## 7. QA & Verification

- [ ] 7.1 QA Engineer verifies all acceptance criteria from specs pass
- [ ] 7.2 Code Reviewer reviews all diffs against spec requirements
- [ ] 7.3 Verify no regressions in existing backend/frontend functionality
- [ ] 7.4 Verify `logs/` directory is properly gitignored
- [ ] 7.5 Verify AI agent can read and parse log files from `logs/`
