# Design Document: Chart Interactions and UI Features

## Overview
This document covers the chart interactions and UI features of the Pine Script v5/v6 Engine, including viewport auto-fit, auto-scale toggle, scroll re-execution, go to date, quick indicator/strategy adder, footer bar, error console, chart labels, dynamic indicator management, and the rendering architecture.

---

## 1. Chart Viewport Auto-Fit on Initial Load

### 1.1 Overview
When the chart first loads, there is a race condition between WebSocket kline data and REST API historical data. WebSocket ticks can arrive before the REST response, causing the chart to render a single candle before the full dataset loads. This creates a brief flash of one large candle that quickly snaps to the full view.

### 1.2 Race Condition Timeline
```
1. Page loads → shouldFitRef = true
2. fetchOHLCV starts async REST request (clears candles)
3. WebSocket connects, subscribes to kline topic
4. Bybit WS kline tick arrives (faster than REST)
5. WS handler pushes one candle → candles = [oneBar]
6. ChartComponent effect runs → fitContent() called with totalBars=1
7. shouldFitRef consumed (set to false)
8. REST API response arrives → setCandles(1000 bars)
9. setCandles detects prepend → adjustForPrepend(999)
10. Viewport shifts to bar 999-1000 → only 1 candle visible
11. shouldFitRef = false → fitContent NOT called
12. User sees ONE candle → bug
```

### 1.3 Fix: Two-Part Solution

**Part A: Auto-fit when REST data arrives (PineChart.setCandles)**
```typescript
setCandles(data: CandlestickData[]): void {
  const prevLength = this.candles.length;
  // ... prepend/append detection ...
  this.candles = data;
  // ... viewport adjustment ...

  // Auto-fit when candle count jumps from 0/1 to many
  if (prevLength <= 1 && data.length > 1) {
    const regions = this.layout.getRegions();
    this.viewport.fitContent(regions.chartArea.width);
  }
  this.markDirty();
}
```

**Part B: Suppress WS updates until REST loads (useChartData)**
```typescript
const historicalDataLoadedRef = useRef(false);

// In fetchOHLCV:
historicalDataLoadedRef.current = false;
// ... after REST response:
historicalDataLoadedRef.current = true;

// In WS kline handler:
setCandles((prev) => {
  if (!historicalDataLoadedRef.current) return prev;  // Skip WS update
  // ... normal candle update logic ...
});
```

### 1.4 Result
- Chart shows a blank/loading state briefly, then renders all historical candles at once
- No flash of a single large candle
- WebSocket updates begin only after historical data is loaded
- Viewport automatically fits to show all available data

---

## 2. Auto-Scale Toggle Architecture

### 2.1 Overview
An auto-scale toggle in the footer bar allows users to switch between automatic price range computation (default) and manual price range control. When auto-scale is active, manual price range operations (drag, Shift+scroll) are blocked.

### 2.2 Data Flow
```
App.tsx (autoScale state, default: true)
  → Footer bar toggle button
  → ChartComponent (forceAutoScale prop)
  → useEffect syncs to PineChart.setForceAutoScale()
  → LayoutManager.forceAutoScale flag
  → InteractionHandler checks flag before price range operations
```

### 2.3 LayoutManager Integration
- `LayoutManager` gains a `forceAutoScale: boolean` flag (default `true`)
- `setManualPriceRange()` — no-op when `forceAutoScale` is true
- `zoomPrice()` — no-op when `forceAutoScale` is true
- `panPrice()` — no-op when `forceAutoScale` is true
- `setForceAutoScale(v: boolean)` — sets the flag
- `isForceAutoScale()` — returns current state

### 2.4 PineChart Integration
- `PineChart.setForceAutoScale(v)` delegates to `layout.setForceAutoScale(v)`
- Called from `ChartComponent` via useEffect when `forceAutoScale` prop changes

### 2.5 Footer Bar UI
- Positioned between `<main>` and `<ErrorConsole>` in `App.tsx`
- CSS class: `.footer-bar` with dark theme styling
- Toggle button: `.auto-scale-toggle` with green background when active, dim when inactive

---

## 3. Scroll Re-Execution with Boundary Recomputation

### 3.1 Overview
When the user scrolls backward to load older candles, the frontend fetches them via `fetchOlderOHLCV` and re-executes the active script on the combined bar set. The key challenge is that indicator values at the boundary between old and new data may be incorrect without recomputation — the first `maxLookback` bars of the previous batch need to be recomputed with access to the newly loaded older context bars.

### 3.2 execBars Construction
```typescript
// In fetchOlderOHLCV:
const contextBars = previousBars.slice(-maxLookback); // last N bars from previous batch
const execBars = [...newBars, ...contextBars];         // chronological: new first, context after
```
- `newBars`: the freshly fetched older bars (not yet in `ohlcvDataRef`)
- `contextBars`: the last `maxLookback` bars from the previous batch (for indicator warm-up)
- execBars are chronological — the engine processes them bar-by-bar in order
- Context bars are NOT added to `ohlcvDataRef.current` — they are execution-only

### 3.3 prependIndicatorResult Boundary Recomputation
```
newResult: [newBar1, newBar2, ..., newBarN, context1, context2, ..., contextK]
           |<--- newBarData --->|         |<--- boundaryData --->|

prevResult: [old1, old2, ..., oldM]

mergedResult: [newBar1..N, boundary1..K, oldK+1..M]
              |<--- new + boundary --->|  |<--- remaining prev --->|
```
- `newBarData`: first N bars of newResult (bars not yet in indicator state)
- `boundaryData`: next K bars of newResult (overlapping with previous batch's last K bars — these are the recomputed boundary values)
- `remainingPrev`: skip first K entries from prevResult (they were recomputed), keep the rest
- Final merged result: `[...newBarData, ...boundaryData, ...remainingPrev]`

### 3.4 Why Not Just Prepend
Simply prepending new indicator data to the old data would leave the boundary incorrect — the first few bars of the old batch were computed without access to the now-available older context bars. Boundary recomputation ensures the transition is seamless.

---

## 4. Footer Bar Architecture

The footer bar is a persistent UI component positioned between the main chart area and the error console. It provides quick access to frequently used chart controls without opening the full code editor.

### 4.1 Components

1. **Auto-Scale Toggle**: Switches between automatic price range computation (default) and manual price range control
2. **Quick Indicator/Strategy Adder**: Opens a centered modal popup for rapid script selection and addition to the chart
3. **Go to Date Button**: Opens a date/time picker popup for navigating to a specific historical timestamp

### 4.2 Data Flow
```
App.tsx (state: autoScale, quickAdderOpen, goToDateOpen)
  → FooterBar component (renders buttons, handles clicks)
  → ChartComponent (forceAutoScale prop)
  → QuickAdderPopup (when open, fetches scripts via API)
  → GoToDatePopup (when open, renders date/time input)
  → PineChart.setForceAutoScale() / chart.timeScale().scrollToDate()
```

### 4.3 Quick Adder Popup
- Small centered modal overlay on chart
- Auto-focused search bar for filtering scripts by name
- Merged list of user scripts (GET /api/scripts) and built-in test indicators (GET /api/scripts/built-in)
- Built-in scripts marked with "Built-In" badge
- Type badges: [IND] for indicators, [STG] for strategies
- Clicking a script adds it via IndicatorManager (POST /api/indicators)
- Popup stays open for multiple additions
- Closes on ESC, X button, or backdrop click
- Opens via footer button or "/" keyboard shortcut (when not in input focus)

### 4.4 Go to Date Popup
- Date/time input fields with calendar picker
- On submit, calls `chart.timeScale().scrollToDate(timestamp)`
- Renders a "teleport line" on the chart at the target timestamp — a vertical dashed line with a label showing the date/time
- Teleport line uses `findBarIndex` for accurate time-based positioning
- Line persists until next navigation or manual clear

---

## 5. Quick Indicator/Strategy Adder

### 5.1 Overview
The Quick Adder provides a fast, keyboard-driven way to add indicators and strategies to the chart without opening the full code editor. It is a small, centered popup overlay accessible via a footer bar button or the "/" keyboard shortcut.

### 5.2 UI Layout
```
┌─────────────────────────────────────────┐
│  [X]  Add Indicator/Strategy            │
├─────────────────────────────────────────┤
│  🔍 Search...                           │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │  SMA Crossover          [IND]  │    │
│  │  MACD                    [IND]  │    │
│  │  Kalman Trend Filter     [IND]  │    │
│  │  Two-Pole Trend Filter   [IND]  │    │
│  │  Volatility Trail        [IND]  │    │
│  │  Kalman Trend Levels     [IND]  │    │
│  │  Kalman Trend Strategy   [STG]  │    │
│  │  ● MACD (Built-In)      [IND]  │    │
│  │  ● RSI (Built-In)       [IND]  │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### 5.3 Component Architecture
```
QuickAdderPopup (React component)
├── Search bar (input, auto-focused on open)
├── Script list (filtered by search query)
│   ├── User scripts (from GET /api/scripts)
│   └── Built-in scripts (from GET /api/scripts/built-in)
│       └── Marked with "Built-In" badge
├── Close button (X)
└── Keyboard handler (ESC to close)
```

### 5.4 Data Flow
```
Footer bar button click OR "/" keypress
  → Set quickAdderOpen = true
  → Fetch GET /api/scripts + GET /api/scripts/built-in (parallel)
  → Render popup with combined script list
  → User types in search bar → filter list client-side
  → User clicks a script
    → Call addIndicator(scriptId, source) (same as CodeEditor "Add")
    → Popup remains open for additional adds
  → User clicks X or presses ESC
    → Set quickAdderOpen = false
```

### 5.5 Keyboard Shortcuts
- `/` — Open quick adder (when not focused on input/textarea)
- `ESC` — Close quick adder
- Arrow keys — Navigate script list (optional enhancement)
- `Enter` — Add highlighted script (optional enhancement)

### 5.6 Integration with Existing Systems
- **IndicatorManager**: Uses existing `addIndicator()` method — no new backend APIs needed
- **Script Bank**: Reads from existing `GET /api/scripts` and `GET /api/scripts/built-in` endpoints
- **Footer Bar**: New button placed alongside the existing auto-scale toggle
- **Code Editor**: The quick adder is an alternative entry point — does NOT replace the code editor's "Add" button

---

## 6. Error Console as Toggleable Popup

The error console has been redesigned as a toggleable popup panel rather than a fixed bottom panel.

### 6.1 Architecture
- **ErrorConsole Component**: Renders as a popup overlay when open, collapsed to a badge when closed
- **Error Count Badge**: Shows in footer bar / header with red notification count
- **Toggle Mechanism**: Click badge to expand/collapse; click X in popup to collapse
- **Content**: Lists compilation and runtime errors with line numbers, descriptions, and source mapping
- **Persistence**: Error state maintained in React state, survives chart re-executions

### 6.2 Benefits
- Reduces vertical space consumption when no errors
- Error count visible at all times via badge
- Full error details accessible on demand

---

## 7. Chart Labels and Indicator Management

### 7.1 Overlay Indicator Labels (Main Chart Top-Left)
- Vertical list of running overlay indicator names
- Each label rendered as semi-transparent pill with delete (×) button
- Clicking delete removes indicator from chart (not from script bank)
- Labels update dynamically on add/remove
- Rendered on topmost canvas layer above candlesticks and plots

### 7.2 Indicator Pane Labels (Per-Pane Top-Left)
- Each non-overlay indicator pane shows a label with indicator name and unplot (−) button
- Clicking unplot removes indicator and its pane (if last in pane)
- Labels clipped to pane region via canvas clipping
- Rendered within pane's coordinate space

### 7.3 Dynamic Indicator Management (IndicatorManager)
- Tracks `RunningIndicator` objects with: id, scriptId, name, overlay, source, executionSession, active
- `addIndicator(scriptId, source)`: Creates ScriptSession, sends WS execute, adds to state
- `removeIndicator(id)`: Stops ScriptSession, clears chart data, removes from state
- `handleIndicatorRemoved(id)`: Handles auto-removal from backend (script deletion cascade)
- Persisted to backend via `GET/POST/DELETE /api/indicators` with `backend/data/indicators.json`

### 7.4 Persistence
- Running indicator list persisted to `backend/data/indicators.json` (same `JsonStore` infrastructure as scripts.json and telegram.json)
- On backend startup, rehydrate in-memory state from the file
- On add/remove, write through to disk
- **Auto-Remove Cascade**: When `DELETE /api/scripts/:id` is called, the backend iterates the running indicators list, stops execution sessions for any indicators referencing that scriptId, removes them from the persisted list, and notifies connected WebSocket clients via a `indicator_removed` message

### 7.5 Frontend State Management
```
IndicatorState: {
  runningIndicators: RunningIndicator[],
  overlayIndicators: RunningIndicator[],  // derived: indicators where overlay=true
  paneIndicators: RunningIndicator[],     // derived: indicators where overlay=false
  addIndicator(scriptId) → void,          // sends execute WS message, adds to state
  removeIndicator(id) → void,             // sends stop WS message, removes from state, clears chart data
  handleIndicatorRemoved(id) → void,      // handles auto-removal notification from backend
  reorderIndicators(ids) → void           // optional: reorder rendering priority
}
```
- On app mount: fetch `GET /api/indicators` to restore running indicator list, then re-execute each via WebSocket
- On page reload: the persisted list is restored from backend, indicators are re-added to chart automatically

### 7.6 Overlay Indicator Labels Visual Design
```
┌─────────────────────────┐
│  SMA (20)          [×]  │  ← overlay indicator label
│  EMA (50)          [×]  │  ← overlay indicator label
│  Bollinger Bands   [×]  │  ← overlay indicator label
└─────────────────────────┘
```

### 7.7 Indicator Pane Labels Visual Design
```
┌──────────────────────────────────────────┐
│  MACD (12, 26, 9)                  [−]  │  ← pane label with unplot option
│  ┌──────────────────────────────────┐    │
│  │  histogram ▁▃▅▇▅▃▁             │    │
│  │  MACD line ──────────            │    │
│  │  signal line ────────            │    │
│  └──────────────────────────────────┘    │
└──────────────────────────────────────────┘
```

### 7.8 Multi-Indicator Rendering Pipeline
```
For each rendering cycle (triggered by scriptResult or indicatorResults change):
  1. Collect all plot titles from all results (main + indicators)
  2. Call addPlotSeries for each title — idempotent, returns existing handle if already present
  3. Remove any plot series whose title is not in the collected set (stale indicators)
  4. Repeat for fills and shapes
  5. On indicator remove: pane is cleared by the add-all-remove-stale loop; pane removal if empty is triggered by LayoutManager
```
No per-indicator key-tracking refs (`activeKeysRef`, `keyToTitlesRef`, `prevIndicatorResultsRef`) are used. The rendering is entirely driven by the merged set of current result titles in a flat pass. Indicator forming-candle updates use the `formingCandle` flag (same heuristic as the main script).

### 7.9 Interaction with Existing Systems
- **Script Bank**: Running indicators reference scripts by `scriptId` — removing from chart does NOT affect the script bank entry
- **Code Editor**: The editor's "Run" button can add a new indicator to the chart or replace the currently running indicator (configurable)
- **Real-Time Updates**: Each running indicator independently receives kline updates via its own ScriptSession
- **Indicator Pane Autoscale**: Each indicator pane continues to autoscale independently based on its indicator's output values

---

## 8. Rendering Architecture

### 8.1 Visual Element Hierarchy
```
HTML5 Canvas Element
├── Background Layer (BackgroundRenderer)
│   ├── bgcolor() solid color fill
│   └── Background color
├── Grid Layer (GridRenderer)
│   ├── Horizontal grid lines at price scale ticks
│   └── Vertical grid lines at time scale ticks
├── Volume Layer (VolumeRenderer)
│   └── Volume bars (bottom 20% of chart)
├── Fill Layer (AreaRenderer)
│   ├── fill() between two plots (filled polygon)
│   └── fill() between hlines
├── Candlestick Layer (CandlestickRenderer)
│   ├── Candle bodies (rectangles: open-close range)
│   ├── Candle wicks (lines: high-low range)
│   └── Bar color overrides (barcolor())
├── HLine Layer (HLineRenderer)
│   └── Horizontal lines at price levels
├── Plot Layer (LineRenderer)
│   ├── Line Plots (solid, dotted, dashed)
│   ├── Stepline Plots
│   ├── Histogram Plots (vertical lines from baseline)
│   ├── Area Plots (filled below line)
│   ├── Circle Plots (small circles at data points)
│   └── Cross Plots (cross marks at data points)
├── Shape Marker Layer (MarkerRenderer)
│   ├── Arrow Up/Down (triangular pointers)
│   ├── Triangle Up/Down
│   ├── Circle, Square, Diamond
│   ├── Cross, XCross
│   └── Text labels alongside markers
├── Strategy Marker Layer (StrategyMarkerRenderer)
│   ├── Entry markers (long=green arrowUp, short=red arrowDown)
│   ├── Exit markers (above bar, colored by direction)
│   ├── Close markers (distinct from entry/exit)
│   └── Text labels (entry name, comment)
├── Drawing Layer (DrawingLineRenderer)
│   ├── Lines (line.new)
│   ├── Boxes (box.new)
│   ├── Labels (label.new)
│   ├── Tables (table.new)
│   ├── Line Fills (linefill.new)
│   └── Polylines (polyline.new)
├── Axis Layer (AxisRenderer)
│   ├── Price scale labels (right side)
│   └── Time scale labels (bottom)
└── Crosshair Layer (CrosshairRenderer)
    ├── Vertical line through hovered bar
    ├── Horizontal line at hovered price
    ├── Price/time labels on axes
    └── Data window tooltip (OHLCV + indicator values)
```

### 8.2 Rendering Pipeline
```
Data Change / Interaction → Dirty Flag Set → requestAnimationFrame Callback
  → Clear Canvas → Apply Coordinate Transforms → Render Layers in Order
    → Background → Grid → Volume → Fills → Candles → HLines → Plots
    → Shapes → Strategy Markers → Drawings → Axes → Crosshair
  → Swap Buffers (double buffer) → Display
```

### 8.3 Performance Optimization
- Double buffering via offscreen canvas to prevent flicker
- Dirty flag pattern: only redraw when state changes
- Batched canvas draw calls by style (color, lineWidth) to minimize state changes
- Path batching for line plots (single beginPath/stroke per style group)
- Viewport-based rendering with overscan buffer (only render visible bars)
- requestAnimationFrame for vsync-aligned render cycles
- DevicePixelRatio-aware rendering for HiDPI/Retina displays
- Level-of-detail (LOD) rendering for large datasets
- Object pooling for drawing objects
- Viewport-based rendering (only render visible elements)
- Throttled updates for smooth animation

---

## 9. Index-Based Renderer Positioning

### 9.1 Overview
All chart renderers (LineRenderer, AreaRenderer) use direct index-based positioning instead of time-based `findBarIndex()` matching. Since plot data and candle data maintain a 1:1 index correspondence in the data pipeline, using the data index directly as the bar index eliminates O(n²) time-based scanning and prevents visual discontinuities during forming candle updates.

### 9.2 Index-Based Rendering
- **LineRenderer**: For each plot data point at index `i`, uses `i` directly as the bar index for pixel positioning via `indexToPixel(i)`
- **AreaRenderer**: Same approach — fill polygon vertices use data index `i` directly as the bar index
- **No findBarIndex()**: The time-based `findBarIndex(candles, time)` helper is NOT used for plot rendering; it was removed to prevent O(n²) performance and visual discontinuities

### 9.3 Why Index-Based Over Time-Based
- **1:1 correspondence guarantee**: Plot data and candle data are always the same length in the data pipeline; each plot data point at index `i` corresponds to the candle at the same index
- **No index drift**: The data pipeline ensures candle data and indicator data are aligned by construction — no time-matching needed
- **Forming candle support**: When forming candle data is appended to existing data arrays, the 1:1 correspondence is preserved by design
- **Performance**: Eliminates O(n²) time-based scanning per render cycle

---

## 10. Indicator Pane Architecture

### 10.1 Overview
In TradingView, the `overlay` parameter in `indicator()` determines whether an indicator renders on the main price chart (`overlay=true`) or in a separate pane below (`overlay=false`, the default). Non-overlay indicators like MACD, RSI, and Stochastic have their own Y-axis scale and are displayed below the main chart.

### 10.2 Data Flow
```
Script Declaration (indicator(..., overlay=false))
  → Parser: scriptArgs parsed
  → Compiler: overlay extracted into CompiledScript.overlay
  → Engine: overlay included in ExecutionResult.overlay
  → Backend: overlay included in API/WebSocket response
  → Frontend: plots separated into overlay[] vs indicator[] arrays
  → PineChart: non-overlay plots rendered in separate indicator pane with own price scale
```

### 10.3 IR Changes
```
CompiledScript {
  ...existing fields...
  overlay: boolean  // NEW: extracted from indicator() declaration args
}
```

### 10.4 Layout Changes (LayoutManager)
```
┌──────────────────────────────────┐
│  Main Chart Area (overlay=true)  │  ← candlesticks, volume, overlay plots
│  Height: flexible base            │
├──────────────────────────────────┤  ← horizontal separator
│  Indicator Pane 1 (e.g., MACD)   │  ← own Y-axis price scale, own plots
│  Height: equal share of remaining │
├──────────────────────────────────┤  ← horizontal separator
│  Indicator Pane 2 (e.g., RSI)    │  ← own Y-axis price scale, own plots
│  Height: equal share of remaining │
├──────────────────────────────────┤  ← separator (if more panes)
│  ... (additional panes)          │
└──────────────────────────────────┘
│         Time Scale (shared)       │
```
Each non-overlay indicator gets its own pane with:
- Independent Y-axis price scale computed from that indicator's output values
- Its own coordinate space for `priceToPixel()` / `pixelToPrice()` transforms
- Its own canvas clip region to prevent visual bleed-through between adjacent panes

`LayoutManager.calculate()` receives the list of non-overlay indicators and allocates vertical space accordingly:
- The main chart area gets a flexible base height (typically 60–80% of available)
- Remaining vertical space is divided equally among N indicator panes
- Dynamic adjustment: when an indicator is added or removed, `recalculateLayout()` redistributes space

### 10.5 PineChart Changes
- `updatePriceRange()` splits into `updateOverlayPriceRange()` and per-pane `updateIndicatorPriceRange(paneId)`
- Each non-overlay indicator's plots use its own pane's coordinate space for `priceToPixel()`
- LineRenderer, AreaRenderer, and HLineRenderer accept a target pane's Y coordinates
- Separate price scale rendering for each indicator pane via `AxisRenderer.renderIndicatorScale(paneIndex)`
- `recalculateLayout()` detects overlay count changes (new plot series added/removed) and triggers `resize()` to re-allocate pane space across all panes
- Canvas clipping via `ctx.save()`/`ctx.clip()`/`ctx.restore()` restricts candlestick and overlay plot rendering to the `chartArea` and volume rendering to the `volumeArea`, preventing visual bleed-through into indicator panes below

### 10.6 Indicator Pane Autoscale on Scroll
When the viewport changes (scroll, pan, or zoom), each indicator pane recomputes its visible price range from the min/max of its indicator values within the current visible bar range. The autoscale fires after every `onVisibleRangeChange` event. For each indicator pane, the engine filters the output series to only bars within the visible range, computes `min`/`max`, and applies a small vertical padding margin (e.g., 5%). This replaces the previous static price range and forces a re-render of the pane's Y-axis and plot positions. Manual price range overrides are ignored for indicator panes — they always autoscale.

---

## 11. Dark Theme Architecture

### 11.1 Color System
The chart and UI use a unified dark theme with the following color palette:

| Element | Previous Color | Dark Theme Color |
|---------|---------------|-----------------|
| Background | `#1a1a2e` | `#0d0d18` |
| Grid lines | `#2a2a4e` | `#181830` |
| Borders | `#0f3460` | `#111128` |
| Panel backgrounds | `#16213e` | `#0f1520` |
| Text | `#e0e0e0` | `#e0e0e0` (unchanged) |

### 11.2 Implementation Locations
- **CSS**: `frontend/src/index.css` — all CSS custom properties and class-based colors updated
- **Canvas renderers**: `AxisRenderer` background fill (`#0d0d18`), `CrosshairRenderer` tooltip/crosshair backgrounds (`rgba(15,15,35,0.95)` / `rgba(12,12,30,0.95)`)
- **React components**: Inline `style` objects in `BacktestPanel`, `BacktestResults`, `CodeEditor`, `ErrorConsole`, `StrategyResultsPopup`, `TelegramConfigPanel` updated to match

### 11.3 Design Rationale
The darker background (`#0d0d18` vs `#1a1a2e`) increases contrast between candlestick bodies (green `#4caf50` / red `#e94560`) and the chart background, making price action easier to read during extended analysis sessions.

---

## 12. Forming Candle Color Updates

### 12.1 Overview
The forming candle computation must produce correct bgcolor, fillColorData, and plotColors diffs. Previously, these diffs were computed before restoring the pre-execution state, resulting in empty diffs because the restored state matched the snapshot. The fix moves the restoration to AFTER diff computation.

### 12.2 Diff Computation Order
```
1. Execute script for forming candle
2. Compute bgcolor diff (newBgcolorData vs this.bgcolorData)
3. Compute fillColorData diff (newFillColorData vs this.fillColorData)
4. Compute plotColors diff (newPlotColors vs this.plotColors)
5. Restore pre-execution state (barTimestamps, outputSeriesLength)
6. Apply diffs to the forming candle result
```

### 12.3 Why This Order Matters
- Before the fix: restoration happened at step 1, making all diffs perpetually empty (restored state matched snapshot)
- After the fix: restoration happens at step 5, so diffs capture actual changes during forming candle execution
- This ensures bgcolor, fill, and plot color changes are correctly reflected on the forming candle

---

## 13. Centralized Time Module

A shared utility module (`src/utils/time.ts`) provides consistent time handling across frontend and backend.

### 13.1 Features
- **Timezone Handling**: UTC-based internal representation with configurable display timezone
- **Timestamp Parsing**: Accepts ISO strings, epoch milliseconds, and date components
- **Formatting**: `formatTime(timestamp, timeframe)` for axis labels with adaptive precision
- **Interval Utilities**: `intervalToMs(interval)` converts timeframe strings (1m, 1h, 1D) to milliseconds
- **Bar Alignment**: `alignToInterval(timestamp, interval)` snaps timestamps to interval boundaries
- **Relative Time**: `timeAgo(timestamp)` for human-readable relative timestamps

### 13.2 Usage
- Frontend: CrosshairRenderer, AxisRenderer, GoToDatePopup, ChartComponent
- Backend: Bybit adapter, ScriptSession, kline processing
- Shared: Type definitions in `pine-framework` package exports
