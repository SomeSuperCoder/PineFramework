## Purpose

Allow any backtest producer (CLI script or frontend UI) to emit a complete, self-contained, source-tagged record of a run — inputs, outputs, every parameter, trades, and final metrics — so exports from different producers with the same settings can be compared exactly.

## Requirements

### Requirement: Complete backtest capture
Every export document MUST contain: the input data fed to the backtest (bars and metadata), the computed output data (per-bar series, markers, equity/drawdown curves), ALL parameters the backtest was given (every config layer, including the effective config after defaults are merged), the full list of trades and orders, and the final metrics. No field that the backtest engine produces may be omitted from the export.

#### Scenario: Full run is captured
- **WHEN** a backtest completes and an export is generated
- **THEN** the export contains the input bars, output series, every parameter (raw request plus effective config), all trades, all orders, and the final metrics

### Requirement: Producer source tagging
Every export MUST be tagged with its producer — `script` for the CLI backtest script or `frontend` for the frontend UI — in the export payload AND in the export filename, so files from different producers are distinguishable without opening them.

#### Scenario: Script and frontend exports are distinguishable
- **WHEN** a CLI run and a frontend run of the same settings each produce an export
- **THEN** each export carries a `source` field and a filename containing `script` or `frontend` respectively, and the two files are distinguishable by name alone

### Requirement: Fidelity-preserving serialization
Export values MUST be serialized without lossy transforms: numeric values MUST NOT be rounded, and non-finite values (NaN, Infinity, -Infinity) MUST be preserved as distinct tagged values rather than silently converted to null or 0. The serialized export MUST round-trip exactly for the purpose of comparison.

#### Scenario: Non-finite metrics survive serialization
- **WHEN** a backtest produces a non-finite metric value (e.g. profit factor of Infinity with zero losing trades)
- **THEN** the export records that value distinctly, not as null or 0, so the same metric from another producer can be compared faithfully

### Requirement: CLI export flag
The backtest CLI MUST accept an `--export` flag. When provided, the CLI writes full exports to the given directory (default `.exports/` under the repo root) for every symbol in the run, plus a run manifest, tagged with source `script`.

#### Scenario: CLI writes exports on request
- **WHEN** the CLI backtest script is invoked with `--export`
- **THEN** a per-symbol export file and a run manifest are written under `.exports/` (or the flag-specified directory), each export tagged with source `script`

#### Scenario: CLI without the flag writes nothing
- **WHEN** the CLI backtest script is invoked without `--export`
- **THEN** no export files are written and existing behavior is unchanged

### Requirement: Frontend export trigger
The frontend backtest results panel MUST offer an export action below the existing CSV export item. When triggered for a completed backtest, the frontend MUST request a server-side full export of that run and report loading, success, and failure states to the user. Exports produced this way MUST be tagged with source `frontend` and written to the same `.exports/` directory.

#### Scenario: Frontend exports a completed backtest
- **WHEN** a completed backtest result is shown and the user triggers the full-data export action
- **THEN** the frontend requests the export, shows an exporting state, and on success confirms the export was written to `.exports/` tagged with source `frontend`

#### Scenario: Frontend export failure is visible
- **WHEN** the export request fails (job expired, not completed, or server error)
- **THEN** the frontend shows a failure state and allows retrying

### Requirement: Server-side export endpoint
The backend MUST expose `POST /api/backtest/export` accepting `{ job_id }`. For a completed job it MUST build the full export (using the exact request config, input bars, and engine outputs the job used) and write it to `.exports/` tagged with source `frontend`, returning the export file name. For a missing job it MUST return 404; for a job that has not completed it MUST return 400 with `JOB_NOT_COMPLETED`.

#### Scenario: Export of a completed job
- **WHEN** `POST /api/backtest/export` is called with the `job_id` of a completed backtest
- **THEN** a full export is written to `.exports/`, tagged with source `frontend`, and the response returns success with the file name

#### Scenario: Export of a missing job
- **WHEN** `POST /api/backtest/export` is called with an unknown `job_id`
- **THEN** the backend responds 404

#### Scenario: Export of an incomplete job
- **WHEN** `POST /api/backtest/export` is called with the `job_id` of a job that is queued, running, or failed
- **THEN** the backend responds 400 with code `JOB_NOT_COMPLETED` and writes no file

### Requirement: Multi-symbol run manifest
When a CLI run exports more than one symbol, the CLI MUST also write a manifest file describing the run: producer, timestamp, symbols exported, and the file name of each export, so a comparison run can locate all artifacts from one index.

#### Scenario: Multi-symbol run produces a manifest
- **WHEN** the CLI exports a run containing multiple symbols
- **THEN** one manifest file lists the run metadata and the file name of each per-symbol export
