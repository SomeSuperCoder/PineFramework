# Full-Screen Dashboard Overlay

## Problem

`LiveDashboard` is currently a 320px-tall bottom panel (`borderTop` + `height: 320px`). It feels cramped: metrics overflow, positions are hard to scan, and the log viewer shows only a handful of lines. The panel also appears below the chart instead of as a focused monitoring interface.

## Background

- `LiveDashboard` is rendered in `App.tsx` as `{botDashboardOpen && botStatus && <LiveDashboard .../>}` inline in the document flow
- The app already has an overlay pattern for modal components: `CodeEditor`, `QuickAdderPopup`, `StrategyResultsPopup`, `BacktestSettingsPopup`, `GoToDatePopup` — all use absolute/fixed positioning with backdrops
- `LiveDashboard` currently has tabbed navigation: setup (idle), status, metrics, logs (running)
- The `close` button already exists in the dashboard header as `✕`
- `SetupWizard` is rendered inside `LiveDashboard`'s "setup" view

## Design

### Overlay Layout

Convert `LiveDashboard` from a 320px bottom panel to a full-viewport overlay:

```
┌──────────────────────────────────────────────────────────────┐
│  Header Bar                                                  │
│  ● ● Bot State Badge   [Stop] [⚠ Emergency]      [✕] [Pin] │
│  ● ● Wallet / Strategy / DEX / Duration                     │
├──────────────┬──────────────────────────┬────────────────────┤
│  ═ STATUS    │  ═ METRICS              │  ═ LOGS            │
│              │                          │                    │
│  State: ● ●  │  Total Trades: 42       │ [14:32:01] [INFO]  │
│  Wallet: ● ● │  Win Rate: 61.9%        │  Candle processed  │
│  Strategy: ● │  Profit Factor: 1.84    │  for BTCUSDT 60    │
│  DEX: ● ●   │  Max Drawdown: -12.3%   │                    │
│  Duration:   │  Avg Win: $245.12       │ [14:32:02] [INFO]  │
│  Balance:    │  Avg Loss: -$98.40      │  Signal generated  │
│  Real PnL:   │  Total Fees: $12.45     │  for SOLUSDT 240   │
│  Unreal PnL: │  Avg Latency: 142ms     │                    │
│  Exposure:   │                          │ [14:32:03] [WARN] │
│              │  ═ POSITIONS            │  Swap submitted    │
│  [Stop]      │  BTCUSDT LONG 0.5       │  tx: abc123...     │
│  [Emergency] │    @ $68,420 [+$124.20] │                    │
│              │  SOLUSDT LONG 1.0       │                    │
│              │    @ $142.50 [+$45.80]  │                    │
│              │                          │                    │
│  ═ Auto-Select (if running)            │                    │
│  ★ SMACross PF: 1.84                  │                    │
│  TrendFollow PF: 1.32                  │                    │
├──────────────┴──────────────────────────┴────────────────────┤
│  Footer: Connected ●  |  Last update: 14:32:05              │
└──────────────────────────────────────────────────────────────┘
```

### Layout Details

- **Header Bar** — fixed at top, shows bot state badge (colored dot + state name), wallet/strategy/DEX/duration summary, action buttons (Stop, Emergency), view toggle tabs (Setup/Status/Metrics/Logs), and a Close button
- **Three-column body** — scrollable, fills remaining viewport:
  - **Left: Status Panel** — wallet info, state, uptime, balance, PnL, exposure, stop/emergency buttons (always visible)
  - **Center: Metrics + Positions Panel** — key trading metrics, position cards with PnL, auto-select ranking results
  - **Right: Logs Panel** — scrollable streaming log viewer with auto-scroll, log level filtering
- **Footer** — connection status, last data timestamp, version info

### States

| State | Layout |
|-------|--------|
| **Idle / Stopped** | Three columns: left=Wallet panel, center=Strategy selector + Pair matrix, right=Config summary + Start button |
| **Starting** | Show progress indicator + current step |
| **Running** | Full three-column monitoring layout as described above |
| **Stopping** | Overlay stays visible, shows "Stopping..." badge |
| **Error** | Error details prominent at top of status column |

### Responsive Behavior

- Viewport ≥ 1200px: full three-column layout
- Viewport 800–1200px: two columns (logs collapses to bottom tab)
- Viewport < 800px: single column (stacked layout with tabs)

### Integration

1. **App.tsx**: Wrap `LiveDashboard` in a fixed full-screen container with backdrop, same pattern as `CodeEditor` and `QuickAdderPopup`
2. **Remove `height: 320px`** constraint from LiveDashboard's root div
3. **Remove tab-bar logic** from LiveDashboard for the running state — columns replace tabs
4. **Preserve** `onClose` callback, `autoSelectProgress`, `autoSelectResult`, all command handlers
5. **SetupWizard** remains a child component — when displayed, it centers in the available overlay space rather than a cramped 320px box
6. **Add a "Pin to bottom" toggle** in the header that reverts to the old footer layout (stored in localStorage as `pine-bot-dashboard-pinned`)

### CSS

- Overlay: `position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 1000; background: #0d0d18;`
- Backdrop: optional subtle backdrop (semi-transparent black) only if there's content behind
- Animation: optional fade-in/transition
- Column widths: 240px / 1fr / minmax(300px, 400px) with gap
- Close button: top-right, always visible
