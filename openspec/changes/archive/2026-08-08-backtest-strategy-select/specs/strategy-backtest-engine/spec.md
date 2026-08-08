## ADDED Requirements

### Requirement: Backtest Request SHALL Require Strategy Source
The backtest API SHALL require a `script` string in the request body when creating a backtest job. A request that omits `script` or sends an empty/non-string `script` SHALL be rejected immediately with an HTTP `400` and an error body shaped like the other request-validation errors — the job SHALL NOT be created and no data fetch SHALL be performed.

#### Scenario: Backtest rejected when script missing
- **WHEN** a client sends `POST /api/backtest` without a `script` field (valid `symbol` and `timeframe`)
- **THEN** the API responds with HTTP `400 { "error": "Missing or invalid \"script\" field" }`
- **AND** no backtest job is created

#### Scenario: Backtest rejected when script empty
- **WHEN** a client sends `POST /api/backtest` with `script: ""` (empty string)
- **THEN** the API responds with HTTP `400` and an error indicating the `script` field is missing or invalid
- **AND** no backtest job is created

#### Scenario: Backtest accepted when script provided
- **WHEN** a client sends `POST /api/backtest` with a non-empty Pine Script `source` as `script`
- **THEN** the API creates a backtest job and returns the job id (existing behavior unchanged)