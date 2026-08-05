## Purpose

AI agents can access structured log files directly from the `logs/` directory or via a lightweight HTTP endpoint for debugging purposes.

## ADDED Requirements

### Requirement: Log files are stored in a gitignored directory accessible to AI agents
The system SHALL store all log files under `logs/` (already listed in `.gitignore`) which is directly readable by AI agents with filesystem access.

#### Scenario: AI agent reads any log category
- **WHEN** an AI agent lists the `logs/` directory
- **THEN** it finds subdirectories `logs/backend/`, `logs/frontend/`, `logs/bot/` with structured JSON log files

### Requirement: Log files are structured JSON (NDJSON format)
The system SHALL write all log entries as newline-delimited JSON (one JSON object per line) with consistent fields across all categories.

#### Scenario: AI agent parses a log line
- **WHEN** an AI agent reads a line from `logs/backend/api.log`
- **THEN** it can parse it as JSON with fields: `timestamp` (ISO 8601), `level` ("info"|"warn"|"error"|"debug"), `category`, `subcategory`, `message`, `meta` (optional object)

### Requirement: HTTP log query endpoint for remote debugging
The system SHALL provide a `GET /api/logs` endpoint that accepts query parameters `category`, `subcategory`, `level`, and `limit` to query logs remotely.

#### Scenario: AI agent queries logs via HTTP
- **WHEN** an AI agent sends `GET /api/logs?category=bot&subcategory=execution&level=error&limit=50`
- **THEN** it receives a JSON array of the 50 most recent error-level bot execution log entries

#### Scenario: AI agent queries all logs for a category
- **WHEN** an AI agent sends `GET /api/logs?category=backend`
- **THEN** it receives all backend log entries across all subcategories

### Requirement: Log directory structure follows category/subcategory pattern
The system SHALL organize log files as `logs/{category}/{subcategory}.log` for easy AI agent navigation.

#### Scenario: AI agent finds bot execution logs
- **WHEN** an AI agent looks for `logs/bot/execution.log`
- **THEN** the file exists and contains bot execution log entries

#### Scenario: AI agent finds backend API logs
- **WHEN** an AI agent looks for `logs/backend/api.log`
- **THEN** the file exists and contains backend API log entries
