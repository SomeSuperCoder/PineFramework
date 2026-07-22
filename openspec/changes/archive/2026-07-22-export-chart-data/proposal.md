## Why

Debugging Pine Script indicators requires comparing every output — candles, plots, shapes, labels, fills, lines, boxes, and alert triggers — across hundreds of bars. Currently there is no way to dump this data in one place. The agent (or a developer) must manually piece together HTTP responses, WebSocket diffs, and frontend state. This wastes tokens and obscures mismatches. A single, full-depth export stores everything in a `.gitignored` file that the agent can read in one shot.

## What Changes

- Add an export endpoint that dumps the **complete** chart state: all candles, all indicator results (plots, shapes, labels, fills, lines, boxes, alert conditions, alert triggers, barTimestamps), and the raw indicator source
- Store the export as a single JSON file under a `.gitignored directory (e.g., `.exports/`) so it persists across sessions without polluting git
- Add the `.exports/` directory to `.gitignore`
- Add a `fetchExport` / `loadExport` pair so the agent can request the export, then read the file

## Capabilities

### New Capabilities
- `chart-data-export`: Full-depth chart state snapshot — candles, all indicator outputs, alerts, labels, shapes, and metadata in one file

### Modified Capabilities
<!-- No existing capabilities have their requirements changed. -->

## Impact

- **Frontend**: New `POST /api/export` route handler; new `exportChartData()` function in `useChartData`; new `.exports/` directory at repo root
- **Backend**: New `/api/export` endpoint that collects all active indicator results and the OHLCV cache into a single response
- **DX**: `.exports/` added to `.gitignore`; export filename includes timestamp for uniqueness
