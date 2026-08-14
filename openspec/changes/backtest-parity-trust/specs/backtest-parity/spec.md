## Purpose

Guarantee that two producers (CLI and frontend/API) running the same script with the same explicit input produce identical results — same effective configuration, same bars, same trades, same PnL, same metrics — and that the result payload tells the user what actually ran. Producers do not inject hidden settings; the engine is the single authority for defaults.

## ADDED Requirements

### Requirement: Explicit-config contract
Every backtest producer MUST send only the settings the user explicitly provided. The system MUST resolve any absent setting from the script-declared defaults (the engine's own merge), never from producer-side hardcoded constants. The result MUST include an `effectiveConfig` that echoes the engine's post-merge configuration — the actual values that ran.

#### Scenario: Frontend sends only user-explicit fields
- **WHEN** the frontend submits a backtest request
- **THEN** the request contains only fields the user touched (settings visible/edited in the UI wizard, initial capital, commission method) and MUST NOT inject engine defaults such as margin mode, pyramiding, or Sol price that the user never touched

#### Scenario: Effective config is returned
- **WHEN** a backtest completes
- **THEN** the result payload includes the effective configuration actually used (after script-declared defaults were merged), so the user can verify what ran

#### Scenario: Absent settings resolve from the engine
- **WHEN** a producer omits a config field
- **THEN** the value is resolved by the engine's single merge point from the script's declared defaults — the same merge used for every producer

### Requirement: Deterministic producer parity
For the same script and the same explicit configuration, the CLI path and the API/frontend path MUST produce identical results: same effective config, same resolved date range (same bar count), same trades and orders, same PnL and metrics. Any observed divergence between producers for identical explicit input is a defect.

#### Scenario: CLI and API produce identical results
- **WHEN** the same script and explicit config are run through the CLI and through the API
- **THEN** the effective configs, bar counts, trade lists, PnL, and metrics are identical

### Requirement: Shared date-range semantics
All producers MUST resolve a backtest date range with the same semantics: a requested range of days resolves to the same concrete UTC-midnight-aligned start and end, and the number of bars included is the same for the same input regardless of producer.

#### Scenario: Same days request yields same bars
- **WHEN** the CLI and the frontend each request the same lookback in days for the same symbol and timeframe
- **THEN** both run over the same concrete time range and include the same number of bars

### Requirement: Parity suite enforcement
The repository MUST include a parity test that locks producer equivalence: a golden pair of runs (same canned script and explicit config, fixed clock) through the CLI path and the API path MUST produce identical effective config, bar count, trade list, PnL, and metrics. The parity test MUST run in CI and fail the build on any divergence.

#### Scenario: Parity test passes
- **WHEN** the parity test runs
- **THEN** it executes the golden pair through both paths with a fixed clock and asserts byte-equivalent results

#### Scenario: Parity test fails on divergence
- **WHEN** a change causes the two paths to diverge for identical explicit input
- **THEN** the parity test fails, identifying the divergence
