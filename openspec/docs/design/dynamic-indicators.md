## Dynamic Indicator Management Architecture

### 1. Overview

The Dynamic Indicator Management system allows users to add and remove multiple indicators from the chart without touching the script bank. Each running indicator is tracked with metadata (script ID, name, overlay flag, execution session) and displayed with labels in the appropriate location - overlay indicators in the top-left corner of the main chart, pane indicators in the top-left corner of their respective panes.

### 2. Data Model

```
RunningIndicator: {
  id: string (UUID),
  scriptId: string (references ScriptBank entry),
  name: string (extracted from indicator()/strategy() declaration),
  overlay: boolean (from execution result),
  source: string (Pine Script source code),
  executionSession: ScriptSession | null (Backend WebSocket session),
  active: boolean (whether currently executing on chart)
}

RunningIndicatorsData: {
  indicators: RunningIndicator[],
  activeIndicatorIds: string[]
}

IndicatorManager: {
  indicators: RunningIndicator[],
  addIndicator(scriptId, source, overlay) -> RunningIndicator,
  removeIndicator(id) -> void,
  removeAllByScriptId(scriptId) -> void,  // cascade delete when script removed from bank
  getOverlayIndicators() -> RunningIndicator[],
  getPaneIndicators() -> RunningIndicator[],
  findIndicatorByScriptId(scriptId) -> RunningIndicator | null
}
```

### 3. Backend Changes

- **ScriptSession per Indicator**: Each running indicator gets its own `ScriptSession` with its own compiled engine instance, enabling independent real-time re-execution
- **Multi-Session WebSocket**: The backend maintains multiple active `ScriptSession` instances per WebSocket client (one per running indicator), each independently processing kline updates
- **Execution Response Enhancement**: Each `execution_result` message includes the indicator's `id`, `name`, and `overlay` flag so the frontend can route outputs to the correct pane
- **Remove Indicator API**: `DELETE /api/indicators/:id` stops the execution session for a specific indicator and cleans up its state
- **Persistence**: Running indicator list persisted to `backend/data/indicators.json` (same `JsonStore` infrastructure as scripts.json and telegram.json). On backend startup, rehydrate in-memory state from the file. On add/remove, write through to disk.
- **Auto-Remove Cascade**: When `DELETE /api/scripts/:id` is called, the backend iterates the running indicators list, stops execution sessions for any indicators referencing that scriptId, removes them from the persisted list, and notifies connected WebSocket clients via a `indicator_removed` message

### 4. Frontend State Management

```
IndicatorState: {
  runningIndicators: RunningIndicator[],
  overlayIndicators: RunningIndicator[],  // derived: indicators where overlay=true
  paneIndicators: RunningIndicator[],     // derived: indicators where overlay=false
  addIndicator(scriptId) -> void,          // sends execute WS message, adds to state
  removeIndicator(id) -> void,             // sends stop WS message, removes from state, clears chart data
  handleIndicatorRemoved(id) -> void,      // handles auto-removal notification from backend
  reorderIndicators(ids) -> void           // optional: reorder rendering priority
}
```

- On app mount: fetch `GET /api/indicators` to restore running indicator list, then re-execute each via WebSocket
- On page reload: the persisted list is restored from backend, indicators are re-added to chart automatically

### 5. Overlay Indicator Labels (Main Chart Top-Left)

- **Location**: Fixed position in the top-left corner of the main chart area, overlaid on top of candlesticks
- **Layout**: Vertical list of labels, each containing the indicator name and a small delete (x) button
- **Rendering**: Canvas-drawn semi-transparent background pills with text, positioned below the chart legend
- **Interaction**: Click delete button -> calls `removeIndicator(id)` -> clears plots/fills/shapes from chart, stops execution session
- **Visual Design**:
  ```
  +-------------------------+
  |  SMA (20)          [x]  |  <- overlay indicator label
  |  EMA (50)          [x]  |  <- overlay indicator label
  |  Bollinger Bands   [x]  |  <- overlay indicator label
  +-------------------------+
  ```

### 6. Indicator Pane Labels (Per-Pane Top-Left)

- **Location**: Top-left corner of each indicator pane (below main chart)
- **Layout**: Single label per pane with indicator name and unplot button
- **Rendering**: Canvas-drawn within the pane's clipped region
- **Interaction**: Click unplot button -> calls `removeIndicator(id)` -> clears pane plots, removes pane if empty
- **Visual Design**:
  ```
  +-----------------------------------------------+
  |  MACD (12, 26, 9)                        [-]  |  <- pane label with unplot option
  |  +------------------------------------------+ |
  |  |  histogram /_/\_/\_/\_/\                 | |
  |  |  MACD line ----------                     | |
  |  |  signal line --------                     | |
  |  +------------------------------------------+ |
  +-----------------------------------------------+
  ```

### 7. Multi-Indicator Rendering Pipeline (Simplified)

```
For each rendering cycle (triggered by scriptResult or indicatorResults change):
  1. Collect all plot titles from all results (main + indicators)
  2. Call addPlotSeries for each title -- idempotent, returns existing handle if already present
  3. Remove any plot series whose title is not in the collected set (stale indicators)
  4. Repeat for fills and shapes
  5. On indicator remove: pane is cleared by the add-all-remove-stale loop; pane removal if empty is triggered by LayoutManager
```

No per-indicator key-tracking refs (`activeKeysRef`, `keyToTitlesRef`, `prevIndicatorResultsRef`) are used. The rendering is entirely driven by the merged set of current result titles in a flat pass. Indicator forming-candle updates use the `formingCandle` flag (same heuristic as the main script).

### 8. Interaction with Existing Systems

- **Script Bank**: Running indicators reference scripts by `scriptId` - removing from chart does NOT affect the script bank entry
- **Code Editor**: The editor's "Run" button can add a new indicator to the chart or replace the currently running indicator (configurable)
- **Real-Time Updates**: Each running indicator independently receives kline updates via its own ScriptSession
- **Indicator Pane Autoscale**: Each indicator pane continues to autoscale independently based on its indicator's output values
