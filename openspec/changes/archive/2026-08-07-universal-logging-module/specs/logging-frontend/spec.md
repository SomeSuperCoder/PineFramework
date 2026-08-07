## Purpose

Frontend browser logger with an in-memory ring buffer and WebSocket forwarding to the backend, so AI agents can access frontend logs via the `logs/frontend/` directory.

## ADDED Requirements

### Requirement: Frontend logger is a lightweight browser-compatible module
The system SHALL provide a `createFrontendLogger` function that returns a PineLogger-compatible instance that stores logs in an in-memory ring buffer (max 500 entries) and forwards them to the backend via WebSocket.

#### Scenario: Frontend logger buffers logs in memory
- **WHEN** the frontend logger receives 501 log entries
- **THEN** it discards the oldest entry and keeps the most recent 500

#### Scenario: Frontend logger forwards logs via WebSocket
- **WHEN** a log entry is created in the frontend
- **THEN** it is sent to the backend via the existing `bot:log` WebSocket channel (or a new `frontend:log` channel)

### Requirement: Frontend logger supports categories and subcategories
The system SHALL allow each log call to specify a `category` ("frontend") and a `subcategory` (e.g., "ui", "chart", "ws").

#### Scenario: Log call includes frontend category and subcategory
- **WHEN** `logger.debug("chart.render", { category: "frontend", subcategory: "chart", chartType: "candlestick" })`
- **THEN** the log entry contains `category: "frontend"`, `subcategory: "chart"`, and the message `"chart.render"`

### Requirement: Frontend logs are stored in gitignored directory
The system SHALL write forwarded frontend logs to `logs/frontend/` on the backend, which is gitignored and accessible to AI agents.

#### Scenario: AI agent reads frontend log file
- **WHEN** an AI agent reads `logs/frontend/chart.log`
- **THEN** it finds structured JSON lines with frontend log entries

### Requirement: Frontend logger has no external dependencies
The system SHALL NOT import pino or any Node.js library in the frontend logger implementation.

#### Scenario: Frontend logger bundle size is minimal
- **WHEN** the frontend logger is imported in a Vite build
- **THEN** it adds less than 2KB to the bundle (no pino, no Node.js polyfills)

### Requirement: Frontend logger replaces raw console.* calls
The system SHALL replace `console.*` calls in frontend source files with the new frontend logger, starting with `useChartData.ts` and `TradingBotPanel.tsx`.

#### Scenario: Chart data hook uses the new logger
- **WHEN** `useChartData` encounters a WebSocket error
- **THEN** it uses `logger.error("ws.connection-lost", { category: "frontend", subcategory: "ws" })` instead of `console.error`
