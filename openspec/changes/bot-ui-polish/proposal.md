## Why

The bot configuration UI has three fundamental UX problems: (1) the user has to paste raw Pine Script code instead of selecting from their existing scripts, (2) symbol/timeframe pairs are entered as free text instead of a structured grid, and (3) the dashboard is a cramped 320px footer panel instead of a full-screen monitoring interface. These make the bot feel like a debug tool rather than a production trading dashboard.

## What Changes

- **Strategy selector**: Replace the strategy source textarea with a searchable dropdown that fetches scripts from `/api/scripts` and `/api/scripts/built-in`, filtered to show only strategies (same source as the QuickAdder indicator picker). Selecting a strategy loads its source code.
- **Symbol × Timeframe matrix**: Replace the pairs textarea with an interactive table where each row has a symbol dropdown and a timeframe dropdown. Users add/remove rows dynamically.
- **Full-screen dashboard**: The bot dashboard opens as a full-viewport overlay (like the QuickAdder popup or CodeEditor modal) instead of a 320px bottom panel. Status, metrics, logs, and controls are laid out across the full screen with proper spacing and information density.
- No backend changes required — the scripts API endpoints already serve the needed data, and the configure/start/dashboard APIs are unchanged.

## Capabilities

### New Capabilities
- `strategy-selector-ui`: Searchable strategy dropdown that loads scripts from `/api/scripts` + `/api/scripts/built-in`, filtered to strategies only
- `symbol-timeframe-matrix-ui`: Interactive table with per-row symbol + timeframe dropdowns and add/remove controls
- `fullscreen-dashboard`: Full-viewport bot dashboard with status, metrics, logs, and controls laid out across the full screen

### Modified Capabilities
- `frontend-application`: Update bot control panel requirements to reflect the new strategy selector, matrix input, and full-screen dashboard

## Impact

- `frontend/src/components/TradingBotPanel.tsx` — Full replacement of `BotConfigPanel` (strategy textarea → dropdown, pairs textarea → matrix table). `LiveDashboard` changes from 320px footer to full-screen overlay.
- `frontend/src/App.tsx` — Container for the full-screen dashboard overlay (similar to CodeEditor modal pattern).
- `frontend/src/components/QuickAdderPopup.tsx` — No change, but the strategy selector reuses the same API endpoints.
- No backend changes.
