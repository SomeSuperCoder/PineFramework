## Why

The `pnpm backtest` script and the frontend backtest both funnel into the shared
`runBacktestPipeline` engine (`backend/src/backtest-runner.ts`), which is correct.
But the **glue around** that engine — config mapping, DEX-fee fetch, and result
mapping — is copy-pasted across three callers (CLI, HTTP route, auto-select) and
has already diverged:

- The HTTP route applies `slippageType / defaultQtyType / marginLong / marginShort`;
  the CLI drops them (currently a no-op because `CliOptions` has no such fields, but
  the logic is duplicated and fragile).
- DEX-fee failure: route throws, auto-select falls back to 0.1% commission, CLI has
  its own `allowUnrealisticResults` guard — three independent implementations.
- Result shapes (`job.result` vs `SymbolMetrics` vs auto-select subset) are each
  hand-mapped from the same engine output, with subtly different sanitizers
  (`Infinity→null` vs `Infinity→0`).

This is a single-source-of-truth defect waiting to bite. Consolidating it is the
wise long-term move: one module for config/fee/result, three thin callers.

## What Changes

- New `backend/src/backtest-config.ts`:
  - `BacktestConfigInput` (union of all caller fields)
  - `buildBacktestConfigOverride(input, opts?)` — canonical field set, copy-only-present
  - `applyDexFee(symbol, override, { onFailure: 'throw' | 'fallback', fallbackCommission? })`
  - `assertRealisticCommissionMethod(method, allowNonJupiter)` — the CLI-only guard
- New `backend/src/backtest-result.ts`:
  - `BacktestOutcome` (raw, unsanitized metrics from `computeBacktestMetrics`)
  - `toApiResult(outcome)` — reproduces `routes/backtest.ts` `job.result` exactly
    (including `Infinity→null`, raw curves)
  - `toCliSymbolResult(outcome)` — reproduces CLI `SymbolMetrics` exactly (including
    its field asymmetry: only `profitFactor/maxDrawdownPercent/winRate/sharpeRatio`
    sanitized to `0`, others raw)
  - `toAutoSelectMetrics(outcome)` — reproduces auto-select's 8-field subset
- Rewire CLI (`cli/multi-symbol-runner.ts`, `cli/symbol-runner.ts`,
  `cli/backtest-cli.ts`), HTTP route (`routes/backtest.ts`), and auto-select
  (`trading/auto-select-runner.ts`) to use these.
- `backend/src/backtest-runner.ts` (engine) is **NOT** modified.

## Non-goals

- Changing the engine or metrics computation.
- Changing the frontend API contract or CLI JSON output shape.
- Changing DEX-fee semantics for any caller (route/CLI throw, auto-select falls
  back to 0.1%).
- Removing the CLI `allowUnrealisticResults` guard.

## Impact

- Code: 2 new files; 5 files edited (3 CLI + 1 route + 1 auto-select). Engine untouched.
- Tests: `backend/tests/cli-backtest.test.ts` must stay green; new parity + unit tests.
- Risk: none to external behavior if mappers reproduce current output exactly
  (locked by golden-fixture parity tests).
