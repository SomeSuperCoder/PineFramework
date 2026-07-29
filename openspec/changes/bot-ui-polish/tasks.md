# Tasks: bot-ui-polish

## Task 1: Create StrategySelector component
- [x] Create `StrategySelector` component alongside `TradingBotPanel.tsx` (or in a separate file)
- [x] On mount, fetch `GET /api/scripts` and `GET /api/scripts/built-in` (same as `QuickAdderPopup`)
- [x] Merge both lists, filter to `type === 'strategy'`
- [x] Render searchable dropdown: input field + scrollable list
- [x] Use keyboard navigation (arrows, enter, escape) matching QuickAdderPopup pattern
- [x] Handle all states: loading, empty, error, selected
- [x] Reuse CSS classes from QuickAdderPopup (`.quick-adder-*` styles)
- [x] Show type badges (STG/IND) and built-in badge
- [x] Include a "Paste raw source" toggle that falls back to textarea
- **Visual check**: verify in browser

## Task 2: Integrate StrategySelector into BotConfigPanel
- [x] Replace strategy `<textarea>` in `BotConfigPanel` with `<StrategySelector />`
- [x] Wire selected strategy source into `strategySource` state
- [x] Continue running `checkStrategyCompatibility()` on selected source
- [x] Preserve "Apply Configuration" button and its POST to `/api/bot/configure`
- **Check**: frontend builds, bot configure still works

## Task 3: Create PairMatrixTable component
- [x] Create `PairMatrixTable` component for interactive symbol×timeframe row editing
- [x] Define known symbols list matching backend `DEFAULT_SYMBOLS`: `['SOLUSDT', 'BTCUSDT', 'ETHUSDT', 'BONKUSDT', 'ORCAUSDT', 'JUPUSDT', 'PYTHUSDT', 'RAYUSDT', 'WIFUSDT']`
- [x] Define `VALID_TIMEFRAMES` set (already exists, move to shared constant)
- [x] Default rows: `SOLUSDT 60`, `BTCUSDT 240`, `ETHUSDT 60` (3 rows)
- [x] Each row: symbol `<select>` + timeframe `<select>` + remove `[×]` button
- [x] "Add Row" button appends a new row with defaults
- [x] Timeframe dropdown shows human labels (e.g., `1m`, `1h`, `4h`, `1d`), submits raw values
- [x] Duplicate detection: warn on same (symbol, timeframe) pair in two rows
- [x] Handle single-row removal (warn if last row is being removed)
- [x] Output `Array<{ symbol: string; timeframe: string }>` matching `ConfigValues.pairs`
- **Visual check**: verify in browser

## Task 4: Integrate PairMatrixTable into BotConfigPanel
- [x] Replace pairs `<textarea>`, `parsePairLine()`, and `invalidTimeframes` logic in `BotConfigPanel`
- [x] Replace with `<PairMatrixTable />` component
- [x] Wire pairs state to `ConfigValues.pairs`
- [x] Remove `parsePairLine()` function (no longer needed)
- [x] Keep the existing "parsed pairs" summary display (now reflects table rows)
- **Check**: frontend builds, configure API still sends correct pairs

## Task 5: Convert LiveDashboard from footer to full-viewport overlay
- [x] In `App.tsx`, wrap `{botDashboardOpen && botStatus && <LiveDashboard .../>}` in a fixed full-viewport container (`position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 1000; background: #0d0d18;`)
- [x] Remove `height: 320px` from `LiveDashboard`'s root `<div>`
- [x] Add close button handler (already exists)
- [x] Ensure the overlay appears above all other content (z-index check)
- [x] Test closing and re-opening the dashboard
- **Visual check**: verify full-screen overlay works

## Task 6: Rebuild LiveDashboard into three-column layout
- [x] Remove the tab-bar logic for Running state (Status/Metrics/Logs tabs)
- [x] Implement three-column layout:
  - **Left (240px)**: State, wallet, strategy, DEX, duration, balance, PnL, controls (Stop, Emergency)
  - **Center (1fr)**: Metrics grid + position cards + auto-select ranking
  - **Right (minmax(300px, 400px))**: Streaming log viewer with auto-scroll
- [x] For Idle/Stopped state: center the `SetupWizard` in the available overlay space
- [x] Keep `MetricValue` component but re-organize positioning
- [x] Preserve all command handlers (stop, emergency, reset, start)
- [x] Log viewer: preserve auto-scroll, level-based coloring, timestamps
- **Visual check**: verify three-column layout, responsive behavior

## Task 7: Add "Pin to bottom" toggle
- [x] Add a "Pin to bottom" toggle button in the `LiveDashboard` header
- [x] When pinned: render as the old 320px footer (remove overlay, add `height: 320px` back)
- [x] Persist preference in `localStorage` as `pine-bot-dashboard-pinned`
- [x] Use a pushpin icon (📌 or SVG) to indicate state
- **Check**: toggle works, persists across page reloads

## Task 8: Remove dead code and clean up
- [x] Remove `parsePairLine()` function (no longer used)
- [x] Remove `invalidTimeframes` state and related error display in BotConfigPanel
- [x] Remove any unused CSS or inline styles from BotConfigPanel related to textarea pairs
- [x] Rename or delete no-longer-used functions
- [x] Ensure `ConfigValues` interface still matches the output shape (no changes needed there)
- **Check**: build succeeds with no warnings

## Task 9: Tests and build verification
- [x] Run `pnpm run build` (or `just build`) — confirm frontend builds clean
- [x] Run `pnpm run test:frontend` (or equivalent) — confirm tests pass
- [ ] Manually check:
  - Strategy selector loads and filters correctly
  - Pair matrix table enforces valid timeframes
  - Duplicate pair detection works
  - Full-screen dashboard shows all three columns
  - Pin-to-bottom toggle works
- **Check**: all 31 trading + bot tests pass, build succeeds at ~326 KB