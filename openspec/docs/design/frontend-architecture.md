## Frontend Architecture

### 1. Frontend Component Architecture

```
+----------------------------------------------------------------+
|                    Frontend Application                          |
+----------------------------------------------------------------+
|  +----------------+ +----------------+ +----------------------+ |
|  |  Web App       | | Code Editor    | |  Canvas Chart        | |
|  |  (React)       | | (Textarea->    | | (Custom HTML5 Canvas | |
|  |                | |  Monaco)       | |  Charting Library)   | |
|  +----------------+ +----------------+ +----------------------+ |
|  +----------------+ +----------------+ +----------------+       |
|  |Error Console   | |State Manager   | | WebSocket      |       |
|  |                | | (React Hooks)  | | Client         |       |
|  +----------------+ +----------------+ +----------------+       |
+----------------------------------------------------------------+
```

### 2. Frontend Data Flow

```
User Input (Code) -> Code Editor -> POST /api/execute -> Backend (Pine Engine)
                                    |
                              Visual Output -> PineChart.setData() -> Canvas Render Loop -> Display
                                    |
                              Error Handler -> Error Console
```

### 3. Frontend-Backend Communication

- **REST API**: Script compilation/execution (`POST /api/execute`), historical data (`GET /api/ohlcv`), symbol list (`GET /api/symbols`)
- **WebSocket**: Realtime kline streaming, subscription management
- **Workspace Import**: Frontend imports `pine-framework` for type definitions and shared interfaces

### 4. Frontend Features

- **Code Editor**: Textarea (MVP) -> Monaco Editor with Pine Script syntax highlighting, auto-completion, error markers
- **Chart**: Custom Canvas Charting Library (section 8a) with candlestick rendering, volume, indicator overlays, shapes, fills, strategy markers, crosshair, zoom/pan
- **Error Console**: Real-time error display with source mapping, toggleable popup with error count badge
- **Footer Bar**: Persistent bar between chart and error console containing Auto-Scale toggle, Quick Indicator/Strategy Adder button, and Go to Date button
- **Go to Date**: Popup with date/time input and teleport line rendering on chart for quick navigation to historical timestamps
- **Chart Labels**: Overlay indicator labels in top-left of main chart and per-pane labels for non-overlay indicators, each with delete/unplot buttons
- **State Management**: React useState/useRef hooks
- **Responsive Design**: Mobile and desktop support

### 5. Chart Labels and Indicator Management

#### Overlay Indicator Labels (Main Chart Top-Left)
- Vertical list of running overlay indicator names
- Each label rendered as semi-transparent pill with delete (x) button
- Clicking delete removes indicator from chart (not from script bank)
- Labels update dynamically on add/remove
- Rendered on topmost canvas layer above candlesticks and plots

#### Indicator Pane Labels (Per-Pane Top-Left)
- Each non-overlay indicator pane shows a label with indicator name and unplot (-) button
- Clicking unplot removes indicator and its pane (if last in pane)
- Labels clipped to pane region via canvas clipping
- Rendered within pane's coordinate space

#### Dynamic Indicator Management (IndicatorManager)
- Tracks `RunningIndicator` objects with: id, scriptId, name, overlay, source, executionSession, active
- `addIndicator(scriptId, source)`: Creates ScriptSession, sends WS execute, adds to state
- `removeIndicator(id)`: Stops ScriptSession, clears chart data, removes from state
- `handleIndicatorRemoved(id)`: Handles auto-removal from backend (script deletion cascade)
- Persisted to backend via `GET/POST/DELETE /api/indicators` with `backend/data/indicators.json`

### 6. Indicator Pane Labels and Overlay Labels

- **Overlay labels**: Rendered in top-left of main chart, semi-transparent background pills, vertical list, each with delete (x) button
- **Pane labels**: Rendered in top-left of each indicator pane, single label with indicator name and unplot (-) button
- Both dynamically update on indicator add/remove
- Overlay labels sit on topmost canvas layer; pane labels clipped to pane via `ctx.clip()`

### 7. Error Console as Toggleable Popup

The error console has been redesigned as a toggleable popup panel rather than a fixed bottom panel.

#### Architecture
- **ErrorConsole Component**: Renders as a popup overlay when open, collapsed to a badge when closed
- **Error Count Badge**: Shows in footer bar / header with red notification count
- **Toggle Mechanism**: Click badge to expand/collapse; click X in popup to collapse
- **Content**: Lists compilation and runtime errors with line numbers, descriptions, and source mapping
- **Persistence**: Error state maintained in React state, survives chart re-executions

#### Benefits
- Reduces vertical space consumption when no errors
- Error count visible at all times via badge
- Full error details accessible on demand

### 8. Footer Bar Architecture

The footer bar is a persistent UI component positioned between the main chart area and the error console. It provides quick access to frequently used chart controls without opening the full code editor.

#### Components

1. **Auto-Scale Toggle**: Switches between automatic price range computation (default) and manual price range control
2. **Quick Indicator/Strategy Adder**: Opens a centered modal popup for rapid script selection and addition to the chart
3. **Go to Date Button**: Opens a date/time picker popup for navigating to a specific historical timestamp

#### Data Flow

```
App.tsx (state: autoScale, quickAdderOpen, goToDateOpen)
  -> FooterBar component (renders buttons, handles clicks)
  -> ChartComponent (forceAutoScale prop)
  -> QuickAdderPopup (when open, fetches scripts via API)
  -> GoToDatePopup (when open, renders date/time input)
  -> PineChart.setForceAutoScale() / chart.timeScale().scrollToDate()
```

#### Quick Adder Popup
- Small centered modal overlay on chart
- Auto-focused search bar for filtering scripts by name
- Merged list of user scripts (GET /api/scripts) and built-in test indicators (GET /api/scripts/built-in)
- Built-in scripts marked with "Built-In" badge
- Type badges: [IND] for indicators, [STG] for strategies
- Clicking a script adds it via IndicatorManager (POST /api/indicators)
- Popup stays open for multiple additions
- Closes on ESC, X button, or backdrop click
- Opens via footer button or "/" keyboard shortcut (when not in input focus)

#### Go to Date Popup
- Date/time input fields with calendar picker
- On submit, calls `chart.timeScale().scrollToDate(timestamp)`
- Renders a "teleport line" on the chart at the target timestamp - a vertical dashed line with a label showing the date/time
- Teleport line uses `findBarIndex` for accurate time-based positioning
- Line persists until next navigation or manual clear

### 9. Dark Theme Architecture

#### 1. Color System
The chart and UI use a unified dark theme with the following color palette:

| Element | Previous Color | Dark Theme Color |
|---------|---------------|-----------------|
| Background | `#1a1a2e` | `#0d0d18` |
| Grid lines | `#2a2a4e` | `#181830` |
| Borders | `#0f3460` | `#111128` |
| Panel backgrounds | `#16213e` | `#0f1520` |
| Text | `#e0e0e0` | `#e0e0e0` (unchanged) |

#### 2. Implementation Locations
- **CSS**: `frontend/src/index.css` - all CSS custom properties and class-based colors updated
- **Canvas renderers**: `AxisRenderer` background fill (`#0d0d18`), `CrosshairRenderer` tooltip/crosshair backgrounds (`rgba(15,15,35,0.95)` / `rgba(12,12,30,0.95)`)
- **React components**: Inline `style` objects in `BacktestPanel`, `BacktestResults`, `CodeEditor`, `ErrorConsole`, `StrategyResultsPopup`, `TelegramConfigPanel` updated to match

#### 3. Design Rationale
The darker background (`#0d0d18` vs `#1a1a2e`) increases contrast between candlestick bodies (green `#4caf50` / red `#e94560`) and the chart background, making price action easier to read during extended analysis sessions.

### 10. Centralized Time Module

A shared utility module (`src/utils/time.ts`) provides consistent time handling across frontend and backend.
