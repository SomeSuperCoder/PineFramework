## Purpose

Make backtest diagnostics visible and trustworthy. Every event that shapes or constrains a run — suppressed orders, commission decisions, fallback baselines, and similar — is recorded as a typed warning and surfaced wherever results are consumed: the user-facing API result and CLI output, and the developer-facing export record. Nothing that changes the meaning of a result may remain console-only.

## ADDED Requirements

### Requirement: Per-run warning collector
Every backtest run SHALL collect diagnostics as typed warning records during execution. At minimum, events covered include: orders suppressed by strategy constraints (e.g. long-only forcing), commission method/fee decisions, and any baseline or fallback the engine applied to script-undeclared settings. Each warning SHALL carry a machine-readable type, a human-readable message, and the context of the event.

#### Scenario: Long-only suppression is recorded
- **WHEN** a run uses a long-only commission method and the strategy would have produced a short order
- **THEN** the run records a typed warning describing the suppressed short, instead of silently dropping it

#### Scenario: Fee decisions are recorded
- **WHEN** a run applies a commission method, explicit fees, or a cached live fee
- **THEN** the run records a typed warning describing the fee decision that was made

### Requirement: Warnings in user-facing results
Backtest result payloads from the API and the CLI user output SHALL include the run's warnings so the user sees what shaped the result.

#### Scenario: API result includes warnings
- **WHEN** a backtest completes with any warnings
- **THEN** the API result payload includes the warnings list alongside the metrics

#### Scenario: CLI output shows warnings
- **WHEN** a CLI backtest completes with any warnings
- **THEN** the CLI user output displays the warnings alongside the metrics

### Requirement: Warnings in the developer record
Full backtest exports (the developer/debugger record) SHALL include the same warnings list, so a recorded run can be audited for suppressed orders and fee decisions.

#### Scenario: Export captures warnings
- **WHEN** a run that produced warnings is exported
- **THEN** the export document contains the complete warnings list
