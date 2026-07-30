## Context

The current bot UI lives in `frontend/src/components/TradingBotPanel.tsx` (~1200 lines). Strategy config uses a raw textarea for Pine Script source. Pairs use a free-text textarea. The dashboard is a 320px bottom panel.

The QuickAdder popup (`QuickAdderPopup.tsx`) already demonstrates the pattern we need for strategy selection: it fetches scripts from `/api/scripts` and `/api/scripts/built-in`, renders a searchable list, and loads the source on selection. The same API endpoints return the full source code in their response.

`App.tsx` already renders modal-style overlays (CodeEditor, QuickAdder, StrategyResultsPopup, etc.) using `isOpen && <Component>` pattern — the full-screen dashboard will follow the same pattern.

## Goals / Non-Goals

**Goals:**
- Replace strategy textarea with a searchable dropdown (same data source as QuickAdder)
- Replace pairs textarea with an interactive table of symbol × timeframe rows
- Convert the 320px bottom-panel dashboard into a full-screen overlay
- Preserve all existing functionality (wizard flow, auto-select progress, compatibility check, stop/emergency controls)

**Non-Goals:**
- No backend changes — the scripts API, configure API, and WebSocket channels are already sufficient
- No changes to the charting area, editor, or other panels

## Decisions

### Decision 1: Strategy selector — searchable list with source fetch

**Choice:** Build a `StrategySelector` component that fetches scripts from `/api/scripts` + `/api/scripts/built-in`, filters to `type === 'strategy'`, and renders a searchable list (reusing the CSS classes from QuickAdderPopup). On selection, it stores the script's source and name.

**Rationale:**
- The API endpoints already exist and return full source — no new backend work
- The QuickAdder already proves this pattern works
- User scripts and built-in strategies are merged into a single unified list
- Filtering to strategies only keeps the list focused (no indicator/library noise)

**Alternatives considered:**
- Loading the active script from the editor: doesn't work if the user wants a different strategy for the bot than what's in the editor
- A dropdown with just names then a separate fetch: the API data already has source, so no extra round-trip

### Decision 2: Symbol × Timeframe matrix — table with dropdowns

**Choice:** Build an interactive table component. Each row has a symbol `<select>` (populated from the app's known symbols list) and a timeframe `<select>` (populated from `VALID_TIMEFRAMES`). A "+" button appends a row, each row has a "×" to remove it. Default: 3 rows with `SOLUSDT 60`, `BTCUSDT 240`, `ETHUSDT 60`.

**Rationale:**
- Table format is visually scannable — user can see all pairs at a glance
- Dropdowns prevent typos and invalid values
- The symbol list is already known (`SYMBOLS` constant in App.tsx and `DEFAULT_SYMBOLS` in backend CLI)
- The timeframe list is already validated (`VALID_TIMEFRAMES`)

**Alternatives considered:**
- A CSV-like input field: harder to validate and less scannable
- A grid of checkboxes (symbol × timeframe as axes): becomes unwieldy with many options

### Decision 3: Full-screen dashboard — overlay, not footer

**Choice:** Render the bot dashboard as a full-viewport overlay similar to the CodeEditor modal. It covers the entire screen with a dark semi-transparent backdrop. Inside: a close button, a left panel (status + controls), a center panel (metrics + positions), and a right panel (streaming logs).

**Rationale:**
- Full screen provides real estate for all the information the spec requires: status, metrics, positions, logs, wallet, controls, and auto-select results
- The overlay pattern is already established in the app (CodeEditor, QuickAdder, StrategyResultsPopup, BacktestSettingsPopup, GoToDatePopup)
- The 320px footer is too cramped for a meaningful trading dashboard
- A full-screen dashboard signals "this is the monitoring interface" vs. the footer feeling like an afterthought

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│ Header: [Status Badge] [State] [Controls]    [Close] │
├──────────┬─────────────────────────┬─────────────────┤
│  STATUS  │  METRICS / POSITIONS    │  LOGS           │
│  Panel   │                        │                 │
│          │  Total Trades: 42      │ [14:32:01] [INFO]│
│ Wallet:  │  Win Rate: 61.9%       │ Candle processed │
│ State:   │  Profit Factor: 1.84   │ for BTCUSDT 60  │
│ Strategy:│  Max Drawdown: -12.3%  │                 │
│ DEX:     │                        │ [14:32:02] [INFO]│
│ Duration:│  Positions:            │ Signal generated │
│ Balance: │  BTCUSDT LONG 0.5      │ for SOLUSDT 240 │
│ PnL:     │    @ $68,420           │                 │
│          │                        │ [14:32:03] [WARN]│
│ Controls │                        │ Swap submitted   │
│ [Stop]   │                        │ tx: abc123...    │
│ [Emergency]│                      │                 │
├──────────┴─────────────────────────┴─────────────────┤
│ Footer: connection status, last update timestamp     │
└──────────────────────────────────────────────────────┘
```

**State awareness:**
- When bot is Idle → Full-screen layout shows the Setup wizard (wallet → strategy selector → matrix → review) centered in the available space
- When bot is Running → Full-screen layout shows Status/Metrics/Positions/Logs

## Risks / Trade-offs

- **[Strategy selector scope]** The scripts API might return scripts saved to disk but not yet compiled. **Mitigation:** The `configure()` API will still reject invalid strategies — the selector is just a UX improvement, not a safety gate.
- **[Full-screen on small monitors]** A 1366×768 screen might still feel cramped with 3 columns. **Mitigation:** Use responsive min-widths and collapse the logs panel to a tab when viewport is too narrow.
- **[Overlay blocks chart]** The full-screen overlay covers the chart, unlike the current footer which lets the user see charts while monitoring. **Mitigation:** Add a "pin to bottom" toggle that switches back to the footer layout for users who want the chart visible while monitoring.
