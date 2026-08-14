## Context

Both backtest producers (CLI `backend/src/cli/backtest-cli.ts` → `multi-symbol-runner` → `runSymbolBacktest`; HTTP API `backend/src/routes/backtest.ts` → `runBacktest`) share `runBacktestPipeline` (`backend/src/backtest-runner.ts`), which returns an `ExecutionEngine`. At completion, both paths have the engine in scope and can reach the full run surface:

- `engine.getAllOutputs(): Map<string, Series>` — per-bar computed output
- `engine.getStrategyMarkers()` — strategy markers
- `engine.getStrategyEngine().getConfig()` — the FULL effective `StrategyConfig` with defaults merged (the only place the effective config exists)
- `getTrades()`, `getFilledOrders()`, `getMetrics()` — engine state
- `toOutcome(bars, engine)` — canonical `BacktestOutcome` (metrics, trades, filledOrders, equityCurve, drawdownCurve, equityPoints, monthlyReturns, buyHoldReturn)

Today the CLI throws the full outcome away after extracting 8 metrics; the API retains only the API-shaped `job.result`. Input bars (Bybit OHLCV, 1500-bar cap) are fetched identically in both paths via `fetchBars`. The job store (`BacktestJob`, in-memory `Map`, 30-min TTL sweep) already retains the raw request `config`, symbol, timeframe, and dates.

Known divergence candidates the export must surface (NOT fixed here): CLI vs API construct config overrides differently (`CliOptions` vs request body via `buildBacktestConfigOverride`), and `applyDexFee` behaves differently on upstream failure (CLI `onFailure: 'fallback', fallbackCommission: 0.1` vs API `onFailure: 'throw'`).

## Goals / Non-Goals

**Goals:**
- One shared, source-tagged `BacktestExport` schema and builder used by both producers.
- Capture every config layer (raw request / CLI options AND effective merged config), input bars, output series, markers, trades, orders, metrics — with zero lossy transforms.
- CLI: `--export [dir]` flag (default `.exports/`) → per-symbol exports + manifest.
- Frontend: "Export Full Data" item under the existing CSV dropdown → server-side export of the completed job → `.exports/`.
- Backend: retain export payload at job completion; `POST /api/backtest/export { job_id }` writes it.

**Non-Goals:**
- Fixing the script-vs-frontend divergence itself — the export exists to surface it.
- Changing `applyDexFee` CLI/API behavior, the 30-min job TTL, or the 1500-bar cap.
- Web-serving `.exports/` (files are written to the server filesystem; the API returns the file name, not the file).
- Database persistence of jobs or exports (in-memory job store stays).

## Decisions

### D1 — Shared pure module in the library, Node writer in the backend
`src/export/backtest-export.ts` in the root `pine-framework` library holds: `BacktestExport` types, `buildBacktestExport(ctx)`, the fidelity-preserving serializer, and `exportFilename(source, symbol, ts)`. It imports only types from the engine and uses plain-data signatures — frontend-safe. The Node writer (`writeExportFile`, `writeExportManifest`) lives in the backend (`backend/src/backtest-export.ts`), NOT in the library, so no `node:fs` import can leak into browser bundles. Exported from `src/index.ts`.

### D2 — Single schema, all layers, raw values
```ts
interface BacktestExport {
  schemaVersion: 1;
  source: 'script' | 'frontend';
  generatedAt: string;            // ISO-8601, explicit UTC
  runId: string;                  // CLI run id or jobId
  meta: {
    symbol, timeframe, startDate, endDate,
    barCount, engineVersion,      // runtime value, never hardcoded
    scriptHash,                   // sha256 of the script source
  };
  params: {
    request: Record<string, unknown>;  // CLI options OR API request body
    configOverride: Record<string, unknown>;
    effectiveConfig: StrategyConfig;   // engine.getStrategyEngine().getConfig() — REQUIRED; build fails if missing
  };
  input: {
    bars: Array<{ timestamp, open, high, low, close, volume }>;
    fingerprint: string;          // sha256 over the serialized bars
  };
  output: {
    series: Record<string, number[]>;   // engine.getAllOutputs(), columnar
    barTimestamps: number[];
    strategyMarkers: StrategyMarkerEntry[];
    equityCurve, drawdownCurve, equityPoints, monthlyReturns, buyHoldReturn;
  };
  trades: Trade[];                // full raw objects
  orders: FilledOrder[];
  metrics: StrategyMetrics;       // RAW, unsanitized
  warnings: string[];             // e.g. 'applyDexFee fell back', 'buyHoldReturn rounded by caller'
}
```
No rounding anywhere in the export path. `metrics` carries raw values — sanitization (`toApiResult`/`toCliSymbolResult`) is a caller concern and is NOT applied to exports.

### D3 — Fidelity-preserving serializer
A shared `serializeBacktestExport(obj)` replaces `JSON.stringify`'s lossy behavior: `NaN` → `{__nonfinite:'NaN'}`, `±Infinity` → `{__nonfinite:'Infinity'}` (and back in `parseBacktestExport`). Maps/Series are pre-converted to columnar arrays by `buildBacktestExport`. Timestamps stay numeric ms with `timestampUnit: 'ms'` declared.

### D4 — CLI hook via optional `onOutcome` sink
`runSymbolBacktest` gains an optional `onOutcome?: (ctx: ExportContext) => void | Promise<void>` parameter (default no-op) — Interface Segregation: the CLI's `SymbolResult` shape is untouched; the sink receives `{ script, symbol, timeframe, startDate, endDate, cliOptions, configOverride, bars, engine, outcome }`. `backtest-cli.ts` parses `--export [dir]` (default `.exports/`, mirrors `--output`), builds the export in the sink (source `script`), writes per-symbol file + run manifest. CLI-only, no HTTP involvement.

### D5 — Server-side frontend export (Option A)
The API path serializes the full export at job completion — `BacktestJob.exportData` (built with the same `buildBacktestExport`, source `frontend`) — because the engine is transient. This captures the exact request config, exact bars, and exact effective config the job used; re-fetching bars client-side (Option B) was rejected as it could fetch different bars and corrupt the comparison. `GET /:jobId/result` stays untouched. New route `POST /api/backtest/export { job_id }`:
- 200 `{ file }` — export written to `.exports/`
- 404 `{ error: 'Job not found' }` — unknown job
- 400 `{ error, code: 'JOB_NOT_COMPLETED' }` — queued/running/failed
- 400 `{ error, code: 'VALIDATION_ERROR' }` — missing/invalid job_id
Retention policy: `exportData` lives with the job (30-min TTL), encapsulated in `routes/backtest.ts` only. Payload is a few MB max (1500 bars, bounded series) — accepted for now.

### D6 — Frontend: thread `jobId`, one dropdown item, 4-state handler
Narrowest change, mirroring how `result` already flows: `App.tsx` destructures `jobId` from `useBacktest()` → passes to `StrategyResultsPopup` → `BacktestResults` gains optional `jobId` prop. New `DropdownMenuItem` after the Export CSV item (`BacktestResults.tsx:176`): idle ("Export Full Data") → loading ("Exporting…", disabled, no double-click) → success ("Exported ✓", 2s) → error (inline message, retry). Calls `POST /api/backtest/export { job_id }`. "Export CSV" remains untouched.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Export data fidelity (rounding/sanitization corrupts the comparison) | D3 serializer + D2 raw metrics; parity tests assert raw values survive round-trip |
| Job store memory growth from `exportData` | Bounded by 1500-bar cap + series size (a few MB per job), existing 30-min TTL sweep; encapsulated in `routes/backtest.ts` |
| CLI/API config-construction differences hide in the export | `params` captures ALL three layers incl. effective config + request body + scriptHash — the comparison diff shows exactly which layer diverges |
| Remote server: `.exports/` not reachable by the user | API returns the file name; comparison happens server-side; a download fallback is possible later (non-goal today) |
| `applyDexFee` divergence changes results | Not fixed here; `warnings` records fallback events so the diff explains itself |
| Non-finite metrics (`profitFactor: Infinity`) silently become null in JSON | D3 serializer preserves them as distinct tagged values |
| Multi-symbol CLI runs create many files | Per-symbol files + `manifest.json` index (spec requirement) |
