## Why

The export feature proved the engine is deterministic (byte-identical trades across producers) but also exposed that backtest results are **not trustworthy across producers**: the CLI silently defaults to 0-commission legacy math, the API silently accepts garbage commission methods, the frontend injects hardcoded engine defaults that override script declarations (`marginLong 1/1` vs script `0/0`), date windows resolve differently (raw-ms now-anchored vs UTC-midnight), 16 engine diagnostics are console-only (long-only suppression silently deletes 15 trades with `warnings: []`), and neither the UI nor CLI output shows what actually ran. Users cannot trust results or compare producers.

## What Changes

- **BREAKING** — CLI requires `--commission-method` (`jupiter_manual` = Jupiter Swap | `jupiter_ultra` = Jupiter Ultra). The silent 0-commission default is removed.
- Commission methods are restricted to the two official Jupiter methods everywhere; the API validates (invalid method → explicit 400, no silent legacy math).
- **BREAKING** — live-fee fetch failure **throws** (explicit error) instead of silently falling back to a flat 0.1% pseudo fee; user-explicit fees bypass the fetch; live fees get a short TTL cache. One policy for CLI, API, and auto-select.
- Producers share one **explicit-config contract**: the frontend stops injecting hardcoded engine defaults; CLI and API build overrides from the same explicit-config object; the engine's single merge point is preserved and `effectiveConfig` echoes its post-merge result.
- Shared **UTC-midnight day-aligned date-range resolution**; the CLI's fetch and display use the same resolved range (kills the 720-vs-721 bar drift).
- Auto-select live mapping fixed: `'jupiter-swap'` → `jupiter_manual`, `'jupiter-ultra'` → `jupiter_ultra` (today both map to `jupiter_ultra`, contradicting the UI).
- Engine diagnostics (long-only suppression, fee events, undeclared-field baselines) flow as typed warnings → export warnings + API result + CLI output.
- UI results panel gains a user-facing "what actually ran" strip (config summary + warnings/notices); CLI output gains the same. Exports remain the developer/debugger record.
- **Parity test suite**: same script + same explicit config through CLI and API paths → identical `effectiveConfig`, bar count, trades, PnL, and metrics.

## Capabilities

### New Capabilities
- `backtest-parity`: deterministic identity of results across producers — same explicit input yields identical effective config, bars, trades, and metrics on CLI and frontend/API, enforced by a parity test suite.
- `backtest-commission-methods`: the system accepts only the official Jupiter methods (Swap = `jupiter_manual`, Ultra = `jupiter_ultra`); validation everywhere; live-fee failure is explicit (no pseudo fallback); consistent live-bot mapping.
- `backtest-warnings`: engine diagnostics are surfaced as typed warnings in the export (developer record), the API result and CLI output (user-facing), covering suppression, fee, and baseline events.

### Modified Capabilities
- `cli-backtest-tool`: CLI validation and defaults (required `--commission-method`, no 0-commission path), user-facing config summary + warnings output, and date-range semantics aligned to the shared resolver.

## Impact

- **Engine/config:** `src/strategy/commission-methods/*`, `src/strategy/strategy-engine.ts` (suppression events), `src/language/runtime/execution-engine.ts` (warnings collector), `src/strategy/backtest-engine.ts` (legacy path audit)
- **Backend:** `backend/src/backtest-config.ts` (normalizer + fee policy), `backend/src/routes/backtest.ts` (validation + result payload), `backend/src/cli/*` (flags, dates, output), `backend/src/backtest-result.ts` (config + warnings in payloads), `backend/src/auto-select-runner.ts` (mapping), `backend/src/backtest-export.ts` (warnings wiring)
- **Export:** `src/export/backtest-export.ts` (warnings source)
- **Frontend:** `frontend/src/utils/useBacktestPanelState.ts` (stop injecting defaults), `frontend/src/components/BacktestResults.tsx` (+ new components), `frontend/src/components/BacktestCommissionSettings.tsx` (labels), `frontend/src/types/index.ts` (contract mirror)
- **Tests:** `backend/tests/backtest-parity.test.ts` (golden pair), commission/fee/date/warnings unit tests, `frontend/src/__tests__/backtest-flow.test.tsx` + new results-strip tests
- **Risk:** breaking CLI flag requirement, fee-failure policy change, auto-select mapping change alters existing results; all covered by the parity suite + review + QA
