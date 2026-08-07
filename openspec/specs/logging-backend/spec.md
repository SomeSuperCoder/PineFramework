# logging-backend Specification

## Purpose
Backend logging with pino + file transport to `logs/backend/`, producing structured JSON that AI agents can read directly for debugging.
## Requirements
### Requirement: Backend logger wraps pino with file transport
The system SHALL provide a `createBackendLogger` function that returns a PineLogger-compatible instance backed by pino with a file transport writing to `logs/backend/`.

#### Scenario: Logger writes structured JSON to file
- **WHEN** the backend logger is initialized with `category: "backend"` and `subcategory: "api"`
- **THEN** it writes JSON log lines to `logs/backend/api.log` with fields: `timestamp`, `level`, `category`, `subcategory`, `message`, `meta`

#### Scenario: Dev mode uses pino-pretty stdout
- **WHEN** `NODE_ENV=development`
- **THEN** the backend logger outputs pretty-printed logs to stdout instead of writing to file

#### Scenario: Production mode writes JSON to file only
- **WHEN** `NODE_ENV=production`
- **THEN** the backend logger writes newline-delimited JSON to `logs/backend/` files and does not output to stdout

### Requirement: Backend logger supports categories and subcategories
The system SHALL allow each log call to specify a `category` ("backend") and a `subcategory` (e.g., "api", "db", "cache", "ws", "telegram").

#### Scenario: Log call includes category and subcategory
- **WHEN** `logger.info("cache.hit", { category: "backend", subcategory: "cache", key: "BTCUSDT" })`
- **THEN** the log entry contains `category: "backend"`, `subcategory: "cache"`, and the message `"cache.hit"`

### Requirement: Backend logger is accessible to AI agents via filesystem
The system SHALL store log files in `logs/backend/` which is gitignored and directly readable by AI agents.

#### Scenario: AI agent reads backend log file
- **WHEN** an AI agent reads `logs/backend/api.log`
- **THEN** it finds structured JSON lines with timestamps, levels, and metadata

### Requirement: Backend logger supports LOG_LEVEL env var
The system SHALL respect the `LOG_LEVEL` environment variable for controlling the minimum log level.

#### Scenario: LOG_LEVEL=warn suppresses info and debug
- **WHEN** `LOG_LEVEL=warn` is set
- **THEN** `logger.info(...)` and `logger.debug(...)` calls are not written to the log file

### Requirement: Backend logger is used across the backend package
The system SHALL replace raw `console.*` calls in backend source files with the new backend logger, starting with `TelegramService`, `gateway.ts`, and `ohlcv.ts`.

#### Scenario: Telegram service uses the new logger
- **WHEN** `TelegramService` sends a message
- **THEN** it uses `logger.info("telegram.sent", { category: "backend", subcategory: "telegram" })` instead of `console.log`

