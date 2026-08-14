## Purpose

Ensure the backtest system only ever models the two official Jupiter commission methods — Jupiter Swap (`jupiter_manual`) and Jupiter Ultra (`jupiter_ultra`) — with consistent, validated behavior across CLI, API, frontend, and auto-select. No pseudo or legacy fee paths may silently run, and a failure to obtain a live fee is always explicit — never silently replaced with an invented rate.

## ADDED Requirements

### Requirement: Official commission methods only
The system SHALL accept exactly two commission methods: `jupiter_manual` (Jupiter Swap) and `jupiter_ultra` (Jupiter Ultra). Every entry point that accepts a commission method MUST validate it against this set and reject anything else with an explicit error — never silently fall through to a legacy 0-commission or default math.

#### Scenario: API rejects an invalid method
- **WHEN** a backtest request specifies a commission method that is not `jupiter_manual` or `jupiter_ultra` (including absent when no valid default exists)
- **THEN** the API returns an explicit validation error (HTTP 400) and the backtest does not run

#### Scenario: CLI requires a commission method
- **WHEN** the CLI backtest is invoked without `--commission-method`
- **THEN** the CLI exits with an explicit error naming the two accepted values, and does not run a 0-commission backtest

#### Scenario: No legacy fee path
- **WHEN** a backtest runs
- **THEN** it never executes the legacy no-commission math silently; every run has an explicit, official commission method

### Requirement: Explicit live-fee failure
When the system needs the current Jupiter fee schedule from the live venue, a fetch failure MUST produce an explicit error that aborts the run — the system MUST NOT silently substitute a flat fallback fee. User-provided explicit fee settings SHALL bypass the live fetch entirely, and successfully fetched live fees SHALL be cached briefly so repeated runs are stable.

#### Scenario: Live fee fetch fails
- **WHEN** the live fee schedule cannot be fetched and no user-explicit fees were provided
- **THEN** the run fails with an explicit error describing the failure; no invented fee is used

#### Scenario: User-explicit fees bypass the fetch
- **WHEN** the user has provided explicit fee settings (e.g. dex fee basis points) for the run
- **THEN** the live fee fetch is skipped for those values and the run uses the user's values

#### Scenario: Live fees are cached
- **WHEN** a live fee schedule is fetched successfully
- **THEN** subsequent runs within the cache TTL reuse it instead of refetching, so CLI and API runs in quick succession agree

### Requirement: Consistent live-bot mapping
Auto-selected commission methods MUST map live bot DEX kinds to backtest methods consistently with the UI: a live Jupiter Swap bot maps to `jupiter_manual` and a live Jupiter Ultra bot maps to `jupiter_ultra`.

#### Scenario: Auto-select matches UI labels
- **WHEN** a backtest is auto-configured from a live bot using Jupiter Swap
- **THEN** the selected commission method is `jupiter_manual`, matching what the UI displays for that bot
