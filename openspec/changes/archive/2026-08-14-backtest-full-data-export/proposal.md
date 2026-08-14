## Why

The backtest script (CLI) and the frontend UI report slightly different results for what appear to be the same backtest settings. To find the divergence, both producers must be able to emit a complete, self-contained record of a backtest run — input data, output data, every parameter, every trade, and the final metrics — tagged with which producer created it, so the two exports can be diffed side by side.

## What Changes

- Add a single shared export capability (`BacktestExport`) that captures, in one JSON document: input bars, computed output series, ALL effective backtest params (every config layer), the full trade list, and final metrics — with no rounding or lossy sanitization that would corrupt a comparison.
- Tag every export with its source (`script` or `frontend`) in both the payload and the filename.
- Backtest CLI: new `--export [dir]` flag (default `.exports/`) that writes per-symbol export files plus a run manifest at the point where config, bars, engine outputs, and outcome all coexist.
- Frontend: new "Export Full Data" item in the existing CSV export dropdown menu in `BacktestResults.tsx` that requests a server-side export of the completed job, written to `.exports/` tagged `frontend`.
- Backend HTTP API: retain the full export payload at job completion (job store already holds the request config) and add `POST /api/backtest/export { job_id }` to write it to `.exports/`.
- No rounding of numeric values anywhere in the export path; a shared NaN/Infinity-safe serializer prevents `JSON.stringify`'s lossy `NaN → null` from silently erasing divergence.

## Capabilities

### New Capabilities
- `backtest-data-export`: Full backtest run capture — schema, serializer, file writing, CLI flag, frontend trigger, and the server endpoint that ties them together.

### Modified Capabilities
<!-- None: existing spec requirements do not change. -->

## Impact

- **Library** `pine-framework` (root `src/`): new pure, frontend-safe export module (`src/export/`) — types + builder + serializer + filename helper, exported from `src/index.ts`. No Node-only imports in the shared path (writer lives in the backend).
- **Backend** `pine-framework-backend`:
  - `backend/src/cli/backtest-cli.ts` — new `--export` flag (mirrors existing `--output` convention).
  - `backend/src/cli/symbol-runner.ts` — export hook at `runSymbolBacktest` (config + bars + engine + outcome all in scope).
  - `backend/src/backtest-export.ts` — backend-side builder glue + Node writer (`writeExportFile`, `writeExportManifest`) into `.exports/`.
  - `backend/src/routes/backtest.ts` — `BacktestJob` gains an `exportData` field serialized at completion; new `POST /api/backtest/export` route (200 / 400 JOB_NOT_COMPLETED / 404 JOB_NOT_FOUND / 400 VALIDATION_ERROR).
  - `applyDexFee` divergence between CLI (`onFailure: 'fallback'`) and API (`onFailure: 'throw'`) is NOT changed by this proposal — but the export surfaces it, which is the point.
- **Frontend** `pine-framework-frontend`:
  - `frontend/src/App.tsx` — destructure `jobId` from `useBacktest()`, pass to `StrategyResultsPopup`.
  - `frontend/src/components/StrategyResultsPopup.tsx` — accept + forward `jobId`.
  - `frontend/src/components/BacktestResults.tsx` — new dropdown item + 4-state handler (idle/loading/success/error) calling `POST /api/backtest/export { job_id }`.
- **Tests**: `backend/tests/backtest-parity.test.ts` must stay green; new unit/parity tests for the builder/serializer, CLI flag, route, and frontend flow (`frontend/src/__tests__/backtest-flow.test.tsx`).
- **No DB changes** (job store is an in-memory `Map` with a 30-minute TTL sweep already in place).
