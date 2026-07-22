## Context

The frontend holds the complete chart state in two places: `candles` (OHLCV data) and `indicatorResultsRef` (per-indicator ScriptResult). The backend also holds the OHLCV cache and manages ScriptSessions per WebSocket client. Currently no mechanism exists to dump this state to disk. The AI agent has no way to inspect the full chart state in a single read.

The challenge is gathering data that lives in the frontend React state (merged indicator results with real-time diffs applied) and writing it to a server-side file.

## Goals / Non-Goals

**Goals:**
- Export every candle, every indicator's full output (plots, shapes, labels, fills, lines, boxes, alertConditions, alertTriggers, barTimestamps, source), plus indicator metadata
- Store the export as a single JSON file under `<repo-root>/.exports/export-<unix-ms>.json`
- Add `.exports/` to `.gitignore` so exports are never committed
- Make the export accessible to the AI agent by a predictable file path returned in the HTTP response

**Non-Goals:**
- Import/restore from an export (read-only snapshot)
- Streaming or incremental export (full dump only)
- UI for browsing historical exports (simple overwrite-per-request is fine)
- CSV or any format other than JSON

## Decisions

### Decision 1: Frontend assemblies, backend writes

The frontend has the most up-to-date state because real-time WebSocket diffs are merged into `indicatorResultsRef` there. The backend only has the initial HTTP result, not the accumulated diff state.

**Approach:** The frontend `POST`s its assembled state to the backend. The backend writes the file to disk and returns the path.

- Frontend collects: `{ candles: CandlestickData[], indicators: Array<{ source, plots, shapes, labels, fills, lines, boxes, alertConditions, alertTriggers, barTimestamps }> }`
- Frontend `POST /api/export` with that payload
- Backend writes to `<repo-root>/.exports/export-<unix-ms>.json` and returns `{ success: true, path }`

**Alternatives considered:**
- *Backend-only assembly*: Rejected because the backend lacks the merged real-time state (diffs applied after initial HTTP). Would need to replay all WS messages.
- *Frontend writes directly*: Browser can't write to arbitrary filesystem paths. Server round-trip required.

### Decision 2: Dedicated Express route

A new `POST /api/export` route on the backend Express server receives the payload and writes the file synchronously (single-file JSON write is fast — under 1ms).

### Decision 3: Export filename uses `Date.now()`

`<unix-ms>.json` guarantees uniqueness without coordination. The agent reads the path from the response, then reads the file.

### Decision 4: `.exports/` at repo root

The project root is the workspace root for both the backend and the AI agent. A single `.exports/` directory there is the simplest convention. The agent can always find it relative to `$PWD`.

## Risks / Trade-offs

- **[Staleness]** The export is a point-in-time snapshot. If the user triggers an export while a forming candle is mid-tick, the data represents that moment. → Document that exports are point-in-time.
- **[Large payload]** A 10 000-bar chart with 5 indicators could produce a multi-MB JSON. → Acceptable for agent consumption; not intended for repeated ad-hoc use.
- **[No auth]** The `/api/export` endpoint is unauthenticated (same as existing `/api/ohlcv`). → Acceptable for a local dev tool.
