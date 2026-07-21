# Component Specifications

## 1. Parser Component

- **Responsibility**: Convert Pine Script v5 or v6 source code to tokens and parse tree
- **Input**: Pine Script v5 or v6 source code string
- **Output**: Abstract Syntax Tree (AST)
- **Key Features**:
  - Dynamic version detection from `//@version=N` directive (supports N=5 and N=6)
  - Automatically selects v5 or v6 grammar based on detected version
  - Handles all Pine Script v5 language constructs (original syntax, `plot()` conventions, type system)
  - Handles all Pine Script v6 language constructs including switch expressions, arrow syntax (=>), and type-inferred array.new\_\<type>() declarations
  - Version detection (`//@version=5` or `//@version=6`)
  - Syntax error reporting with line/column information
  - Supports all Pine script types: indicator, strategy, library
  - Indentation-aware else-binding: `parseIfStatement(baseColumn?)` ensures `else` clauses bind to the `if` at the same indentation level. For standalone `if`, `baseColumn` = the `if` keyword's column. For `else if`, `baseColumn` = the `else` keyword's column (passed recursively). An `else` is only consumed when `elseToken.span.start.column >= baseColumn`
  - Supports `const` keyword for constant variable declarations (v6)
  - Maintains separate grammar rule sets for v5 and v6 to handle syntax differences (e.g., v5's `plot()` parameter ordering vs v6's variadic arguments)

## 2. Compiler Component

- **Responsibility**: Validate AST and produce executable representation
- **Input**: AST from Parser (v5 or v6)
- **Output**: Compiled script with type-checked IR (Intermediate Representation)
- **Key Features**:
  - Type checking and validation including switch expression branch type unification and array.new\_\<type>() type inference (v6)
  - Version-aware type checking: applies v5 looser coercion rules or v6 stricter rules based on detected version
  - Scope resolution
  - Variable declaration validation
  - Constant folding optimization
  - Produces optimized bytecode or IR

## 3. Type System

- **Responsibility**: Manage Pine's type system with automatic coercion (v5 and v6)
- **Types Supported**:
  - Primitives: `int`, `float`, `bool`, `string`, `color`
  - Series: `series<int>`, `series<float>`, etc.
  - Simple: `simple<string>`, `simple int`, etc. (similar to series qualifier)
  - Collections: `array`, `map`
  - User-defined: type aliases
- **Key Features**:
  - Automatic type coercion following Pine rules (v5 has looser coercion, v6 is stricter)
  - Series type semantics
  - `na` (not available) value handling; logical AND/OR treats na as false (Pine Script boolean semantics)
  - Type inference for array.new\_\<type>() returning array\<elementType> (v6)
  - Generic array operations: size, first, last, shift, pop, push, unshift, insert, remove, contains, fill, set, get, sort, copy
  - Method dispatch on numeric IDs for line and label objects enabling chained operations
  - Version-aware coercion: v5 allows implicit int→float and float→int in some contexts; v6 enforces stricter type boundaries

## 4. Execution Engine

- **Responsibility**: Execute compiled Pine scripts bar-by-bar (v5 and v6)
- **Execution Model**:
  - Historical mode: process bars sequentially
  - Realtime mode: update calculations on new bar data
  - Rollback capability for realtime execution
- **Key Features**:
  - Version-aware execution: dispatches built-in functions to v5 or v6 implementations based on detected version
  - Maintains series state across executions
  - Implements Pine's series indexing (`close[1]`, etc.) — the engine accumulates an `ohlcHistory` object across bar execution with `open/high/low/close/volume` arrays, so `executeIndexExpression()` reads from the engine's accumulated history rather than from the context series (which only holds the current bar's value). This avoids O(n²) memory from cumulative series while preserving full history access. `StateManager` snapshots save/restore `ohlcHistory` for rollback.
  - Variable scope management
  - Error recovery with rollback
  - Returns shapes (plotshape markers), fills (area between plots), strategyMarkers, lines (LineEntry), and labels (LabelEntry) as part of execution result
  - Supports named arguments forwarding to built-in functions
  - Auto-detects plot titles from variable names when no explicit title is provided
  - Maintains var/varip variable state across bars without resetting on re-declaration
  - Supports inclusive for-loop iteration (`for i = 0 to end` includes the `end` value)
  - Forwards named arguments (comment, stop, limit) to strategy.entry() and strategy.exit() builtins
  - Parses variable-length argument lists for strategy builtins to extract positional and named parameters
  - Incremental real-time bar execution via `executeRealtimeBar()` which processes a single new bar while preserving prior state; primarily used for the initial `totalBars === 0` edge case
  - State snapshot management for rollback: `createSnapshot()` saves engine state before real-time updates, `rollbackToSnapshot()` restores on error
  - The engine instance is kept alive across real-time updates so that var/varip, series indices, and strategy positions persist between bars
  - Executes switch expressions with full conditional branching and local block scoping
  - Switch-as-expression returns matched case body result: `executeSwitchStatement()` tracks `lastResult` through the matched case/default body loop and returns it, enabling arrow-syntax switch (`"EMA" => expr`) to return computed values instead of NA
  - Supports syminfo namespace as built-in read-only variables (tickerid, mintick, pointvalue, pricescale, currency)
  - Implements strict comparisons matching Pine Script: ta.crossover uses <= on prev bar, ta.crossunder uses >=, ta.pivothigh uses strict >, ta.pivotlow uses strict <
  - Generic array method execution: size, push, pop, shift, unshift, insert, remove, contains, fill, set, get, sort, copy
  - Method dispatch system for line.\* and label.\* calls on numeric object IDs returned by line.new() and label.new()
  - User-defined method dispatch: checks user-defined methods before built-in line/label switches, enabling receiver.method(args) syntax
  - `nz(value, fallback)` replaces na with 0 or custom fallback value
  - `math.pi`, `math.e`, `math.phi` constants resolved via member expression
  - Per-bar color storage: plot color data and fill color data stored as separate arrays alongside output values
  - plot() builtin outputs a single continuous series key regardless of per-bar color variation (no splitting into per-color variants)
  - bgcolor data forwarded through execution result pipeline
  - barColorData (array of `{time, color}` objects) forwarded through execution result pipeline, preserved across snapshots and rollbacks
  - Compound assignment operators (`+=`, `-=`, `*=`, `/=`) read current series value via `getRelative(0)`, apply the operator, and push the result
  - Forming-candle computation: on each real-time tick or kline update, only the last (live) bar is re-evaluated without reprocessing historical bars, enabling sub-bar indicator updates that track intra-bar price action
  - **Caller controls `isFormingCandle` flag**: The caller (`ScriptSession`) sets `engine.setFormingCandle(true|false)` before calling `computeFormingCandle()`. The engine no longer manages this flag internally. Both forming (intra-bar) and confirmed (bar-close) updates use `computeFormingCandle()`; `executeRealtimeBar()` is only used for the `totalBars === 0` edge case.
  - `barstate.isconfirmed` resolves to `!this.isFormingCandle`, so the Pine script sees `true` when `setFormingCandle(false)` was called (confirmed bar close) and `false` during intra-bar ticks.
  - `computeFormingCandle()` generates alert triggers in `diffAlertTriggers` regardless of the forming/confirmed state; suppression happens at the gateway layer via the `isConfirmed` guard in the `ScriptOutputs` result.
  - Output series length is always truncated to the pre-execution length after `computeFormingCandle()` rollback, preventing series-length drift when `barTimestamps.length` is used for time-alignment.
  - `const` variable declarations: variables marked as `const` are initialized once and cannot be reassigned; the `isConst` flag is threaded through `VariableDeclarationNode` → `IRGlobal` → `declareVariable()` → `VariableBinding`
  - `ta.hma(source, length)`: Hull Moving Average implemented via WMA-based algorithm with per-call-site buffer isolation (`hmaBuffers` map keyed by `hma\_${len}\_${hmaCallIndex}`). Maintains `half` (half-length WMA), `full` (full-length WMA), and `diff` (sqrt-length WMA of 2\*half - full) buffers. Returns NA until sufficient data is accumulated. `hmaCallIndex` reset each bar.
  - `plotchar(series, title, char, location, color, ...)`: Character marker builtin that produces `ShapeEntry` objects with unicode char, location handling (abovebar/belowbar/absolute), and color. Supports unicode characters (▲, ▼, ◆, etc.).
  - `plotcandle(open, high, low, close, color, ...)`: Candle color override builtin that stores body color into `barColorData` array for candle body rendering.
  - `display` namespace: `display.data_window`, `display.pane`, `display.none` resolved as builtin constants via `executeMemberExpression()`. When `display` is `none` or `0`, the plot is suppressed from visible line rendering but its data remains available for fill() lookups (the engine tracks `hiddenPlotKeys` to tell the frontend which plots to skip during line rendering while keeping data in `allPlots` for AreaRenderer fill polygon construction). Price range calculation also excludes hidden plot values.
  - `plot()` variadic arguments: accepts `(...allArgs)` with positional args separated from trailing namedArgs object. Reads color from `positionalArgs[2]`, linewidth from `[3]`, style from `[4]`, display from `[11]`. Named args override positional when both present. Pushes `positionalArgs[0]` (the series) to output, not the `value` parameter.
  - `fill()` variadic arguments: accepts `(...allArgs)` with positional args separated from trailing namedArgs. Reads `top_color` from `positionalArgs[4]` and `bottom_color` from `positionalArgs[5]`. Stores one color per bar in `fillColorData` for per-bar segment rendering.
  - `ta.change(source)`: Returns the difference between current and previous source values (source - source[1]). Per-call-site state tracking via `changeCallIndex` and `changePrevValues` arrays. Returns NA on first call. State reset each bar.
  - `box.new(left, top, right, bottom, border_color, bgcolor)`: Creates box drawing objects stored in `boxes` Map. Returns numeric ID. BoxEntry includes left, top, right, bottom coordinates and border/background colors.
  - Comparison operators (>, <, >=, <=): Compiler infers `BOOL_TYPE` instead of `FLOAT_TYPE` for comparison expressions, matching Pine Script semantics where comparisons produce boolean results.
  - `strategy.entry()` namedArgs qty: Extracts `qty` from named arguments when not provided as a positional argument, supporting `strategy.entry("Long", "long", qty=0.1)` syntax.

## 5. Data Engine

- **Responsibility**: Manage OHLCV data and data requests
- **Data Types**:
  - Historical bars with timestamps
  - Realtime updates
  - Multi-symbol data alignment
- **Key Features**:
  - Efficient storage for millions of candles
  - Caching for performance optimization
  - Data gap handling
  - Request coalescing for similar data requests

## 6. Technical Analysis (TA) Engine

- **Responsibility**: Implement all ta.\* functions with TradingView precision
- **Function Categories**:
  - Moving averages: `sma`, `ema`, `wma`, etc.
  - Oscillators: `rsi`, `macd`, `stoch`, etc.
  - Indicators: `bb`, `atr`, `adx`, `sar`, etc.
  - Mathematical: `highest`, `lowest`, `correlation`, etc.
  - Crossover/Crossunder: `ta.crossover`, `ta.crossunder` with proper state tracking
- **Key Features**:
  - Numerical precision matching TradingView
  - Lookback window management
  - Optimized calculations for large datasets
  - Parameter validation and defaults
  - Real ta.sma() using circular buffer with configurable lookback, returning NA until sufficient data
  - Real ta.ema() using exponential moving average formula (prev \* (1-k) + source \* k)
  - ta.crossover() and ta.crossunder() with internal state tracking for proper detection
  - ta.sar() with correct 2-bar initialization (UP/DOWN detection from close vs prevClose), EP/AF tracking, and reversal logic
  - Per-call-site state isolation for ta.sma() and ta.ema() via call-site counters so multiple calls with different sources do not share internal buffers
  - ta.atr(length) with per-key state tracking, true range calculation, and warmup period (returns NA until sufficient bars accumulated)
  - ta.hma(source, length) using WMA-based Hull Moving Average with per-call-site buffer isolation (half, full, diff buffers), returning NA until sufficient data

## 7. Request System

- **Responsibility**: Handle multi-symbol and multi-timeframe data access
- **Key Features**:
  - `request.security()` implementation
  - Lookahead bias prevention
  - Data alignment across different timeframes
  - Caching with invalidation strategy
  - Real-time update propagation

## 8. Plot Engine

- **Responsibility**: Produce plot/shape/fill/marker data structures consumed by the Canvas Charting Library
- **Plot Functions**:
  - `plot()`: Line plots with styles (line, stepline, histogram, columns, area, areabr, circles, cross) — variadic positional args with trailing namedArgs; reads color from positionalArgs[2], linewidth from [3], style from [4], display from [11]; auto-detects title from variable names
  - `plotshape()`: Shape markers (arrowup, arrowdown, circle, square, diamond, triangleup, triangledown, cross, xcross) — produces shape data with bar index, position, and color for canvas rendering
  - `plotchar()`: Character markers with custom unicode characters (▲, ▼, ◆, etc.) at specified locations (abovebar, belowbar, absolute); produces ShapeEntry objects with char, location, color, and text
  - `plotarrow()`: Directional arrows with colorup/colordown
  - `plotcandle()`: Candle body color overrides storing {time, color} entries in barColorData for candle body rendering
  - `hline()`: Horizontal lines at price levels with linestyle (solid, dotted, dashed)
- **Background & Bar Coloring**:
  - `bgcolor()`: Color chart background with specified colors
  - `barcolor()`: Color chart candles/bars with specified colors — stores `{time, color}` entries in `barColorData` array, forwarded through execution result pipeline
  - `fill()`: Fill area between two plots or hlines — variadic positional args with trailing namedArgs; reads top_color from positionalArgs[4] and bottom_color from [5]; stores one color per bar in fillColorData for per-bar segment rendering
- **Key Features**:
  - Style support (color, linewidth, transparency, offset, editable, show_last, display)
  - Z-ordering for overlapping plots
  - Visual fidelity matching TradingView
  - Support for all plot.style\_\* enums (line, stepline, histogram, columns, area, areabr, circles, cross)
  - Support for size enums (tiny, small, normal, large, huge, auto)
  - Support for location enums (abovebar, belowbar, top, bottom, absolute)
  - Support for all Pine plot parameters
  - Auto-detection of plot titles from variable names
  - Named arguments support for all plot functions
  - Null value filtering before rendering
  - Color, shape, and location namespace syntax support
  - plot() style parameter support for circles, cross, histogram, columns, stepline, and areabr visual styles
  - Per-bar plot colors and per-bar fill colors stored as separate color data arrays alongside output values for fine-grained rendering
  - Single continuous plot series key regardless of per-bar color variation (no splitting into per-color variant series)
  - bgcolor data forwarded through the full execution result pipeline (API, Websocket, frontend)

## 9. Drawing Engine

- **Responsibility**: Render drawing objects on charts
- **Object Types**:
  - **label** — Text labels on the chart:
    - `label.new(x, y, text, xloc, yloc, color, style, textcolor, size, textalign, tooltip)`
    - `label.copy(id)` to duplicate
    - `label.delete(id)` to remove
    - `label.set_x/set_y/set_xy(id, ...)` to reposition
    - `label.set_text/set_color/set_textcolor/set_size/set_style/set_tooltip/set_textalign/set_xloc/set_yloc(id, ...)`
    - `label.get_x/get_y/get_text(id)` to read properties
  - **line** — Drawing lines on the chart:
    - `line.new(x1, y1, x2, y2, xloc, extend, color, style, width)`
    - `line.copy(id)` to duplicate
    - `line.delete(id)` to remove
    - `line.set_x1/set_x2/set_y1/set_y2/set_xy1/set_xy2(id, ...)`
    - `line.set_color/set_style/set_width/set_extend/set_xloc(id, ...)`
    - `line.get_x1/get_x2/get_y1/get_y2/get_price(id, x)` to read coordinates
  - **box** — Rectangles on the chart:
    - `box.new(left, top, right, bottom, border_color, border_width, border_style, extend, xloc, bgcolor, text, text_color, text_size, text_halign, text_valign, text_wrap, text_font_family)`
    - `box.copy(id)` to duplicate
    - `box.delete(id)` to remove
    - `box.set_left/set_top/set_right/set_bottom/set_lefttop/set_rightbottom(id, ...)`
    - `box.set_bgcolor/set_border_color/set_border_width/set_border_style/set_extend(id, ...)`
    - `box.set_text/set_text_color/set_text_size/set_text_halign/set_text_valign(id, ...)`
    - `box.get_left/get_top/get_right/get_bottom(id)` to read coordinates
  - **polyline** — Multi-point lines (Pine v6):
    - `polyline.new(points, curved, closed, xloc, line_color, fill_color, line_style, line_width)`
    - `polyline.delete(id)` to remove
  - **linefill** — Fill between two lines:
    - `linefill.new(line1, line2, color)`
    - `linefill.delete(id)` to remove
    - `linefill.set_color(id, color)` to change fill color
    - `linefill.get_line1(id)` / `linefill.get_line2(id)` to get referenced lines
  - **table** — Floating data tables:
    - `table.new(position, columns, rows, bgcolor, frame_color, frame_width, border_color, border_width)`
    - `table.cell(id, column, row, text, width, height, text_color, text_size, bgcolor, tooltip, text_halign, text_valign)`
    - `table.clear(id)` to clear cells
    - `table.delete(id)` to remove
    - `table.merge_cells(id, start_column, start_row, end_column, end_row)`
    - `table.cell_set_text/set_bgcolor/set_text_color/set_text_size/set_width/set_height/set_tooltip/set_text_halign/set_text_valign(id, column, row, ...)`
  - **chart.point** — Coordinate positioning objects:
    - `chart.point.new(x, y)`, `chart.point.now()`, `chart.point.from_index(bar_index)`, `chart.point.from_time(timestamp)`, `chart.point.copy(point)`
- **Key Features**:
  - All copy, delete, set\_\*, get\_\* methods for each object type
  - Styling options (fill, border, text formatting)
  - Positioning and anchoring (xloc: bar_index, bar_time; yloc: price, abovebar, belowbar)
  - Extend modes (none, left, right, both)
  - Update/delete operations
  - Memory management for large numbers of objects
  - Enforcement of max_labels_count, max_lines_count, max_boxes_count, max_polylines_count limits
  - Canvas rendering of all objects at correct bar index and price level positions
  - Object position updates when chart is zoomed or panned

## 8a. Canvas Charting Library

- **Responsibility**: Render all chart elements on an HTML5 Canvas with full programmatic control over every pixel
- **Replaces**: Lightweight Charts third-party dependency
- **Architecture**:

  ```
  PineChart (main orchestrator)
  ├── CoordinateSystem (data-space ↔ pixel-space transforms)
  ├── Viewport (visible range, zoom, pan state; adjustForPrepend for scroll-preserving prepend)
  ├── LayoutManager (chart area, volume area, price scale, time scale regions)
  ├── Renderers
  │   ├── CandlestickRenderer (OHLCV bodies + wicks)
  │   ├── VolumeRenderer (volume histogram bars)
  │   ├── LineRenderer (line, stepline, dotted, dashed styles; per-bar color support)
  │   ├── AreaRenderer (fill between plots; per-bar color overlay on base polygon)
  │   ├── MarkerRenderer (shape markers: arrows, circles, squares, diamonds; unicode ▲/▼/◆ mapped to named handlers)
  │   ├── CharRenderer (text characters on bars)
  │   ├── ArrowRenderer (directional arrows for plotarrow)
  │   ├── HLineRenderer (horizontal lines)
  │   ├── BarColorRenderer (bar color overrides)
  │   ├── BackgroundRenderer (background color fills)
  │   ├── DrawingLineRenderer (drawing lines from line.new, extend modes)
  │   ├── BoxRenderer (drawing boxes/rectangles)
  │   ├── LabelRenderer (drawing labels with text, all label styles)
  │   ├── TableRenderer (floating data tables)
  │   ├── PolylineRenderer (multi-point lines)
  │   ├── LineFillRenderer (fill between two lines)
  │   ├── StrategyMarkerRenderer (entry/exit/close markers)
  │   ├── AlertMarkerRenderer (alert trigger markers)
  │   ├── GridRenderer (price/time grid lines)
  │   ├── AxisRenderer (price scale labels, time scale labels)
  │   └── CrosshairRenderer (crosshair + tooltip)
  └── InteractionHandler (mouse/touch events for zoom, pan, hover, price scale drag/zoom, time axis drag, middle-mouse pan, Ctrl+scroll fine zoom, double-click reset on price/time axes)
  ```

- **Key Features**:
  - Coordinate transformation system mapping (barIndex, price) → (x, y) pixels
  - DevicePixelRatio-aware rendering for HiDPI/Retina displays
  - Double buffering via offscreen canvas to prevent flicker
  - Dirty flag pattern: only redraw when state changes
  - requestAnimationFrame-based render loop
  - Batched canvas draw calls by style (color, lineWidth) to minimize state changes
  - Path batching for line plots (single beginPath/stroke per style group)
  - Viewport management with overscan buffer (only render visible bars)
  - Viewport adjustForPrepend(added): shifts totalBars and firstBarIndex when bars are prepended, preserving visible content without scroll jump
  - beginUpdate/endUpdate batch API to defer rendering until multiple indicator/data updates are complete
  - Configurable bar spacing (pixels per bar) for zoom
  - Automatic price scale tick calculation
  - Multiple price scales (main + volume)
  - Momentum-based inertial scrolling
  - Manual and auto price range modes: auto (computed from visible candles/plots), manual (set by user drag or shift+wheel)
  - Vertical zoom on price scale via Shift+scroll-wheel, centered on cursor position
  - Vertical zoom on price scale via click-and-drag on the price scale area (scales range centered on cursor)
  - Double-click to reset to auto price range and fit content
  - Ctrl+scroll wheel (Cmd+scroll on Mac) for fine-grained horizontal zoom with reduced zoom factor
  - Middle mouse button (or mouse wheel press) drag for free panning — unrestricted horizontal/vertical movement without affecting price scale auto-range mode
  - Time axis drag: dragging the bottom time scale area horizontally compresses/expands the time scale (bar spacing) for time-axis-only zoom
  - Double-click time axis to reset bar spacing and fit all data
  - Double-click price scale to reset to auto price range and fit content
  - Price range computation filters non-finite and near-zero plot values to prevent chart distortion
  - Price range clamped to at most 10x candle range to prevent excessive scaling when plot values exceed candle prices
  - Indicator panes have independent price scales rendered on the right side with per-pane tick labels
  - Indicator pane rendering clipped to allocated regions via canvas clipping to prevent bleed-through
  - Horizontal separator lines between indicator panes and between volume area and indicator panes
  - Per-bar plot color rendering for line, stepline, histogram, columns styles
  - Per-bar fill color overlay: when fillColorData exists, skip the base fill polygon entirely and draw only per-bar color segments with their actual colors to prevent base polygon color bleeding through transparent segments
  - Drawing line rendering (solid, dotted, dashed, extend modes: none/left/right/both)
  - Label rendering (rounded boxes, all label styles, configurable text/background/border colors)
  - Box rendering (filled rectangles with configurable border_color and bgcolor, rendered on layer above drawing lines)
  - ResizeObserver for responsive container handling
  - Event system: onCrosshairMove, onVisibleRangeChange, onResize, onPriceRangeChange
- **API**:
  - `createChart(container, options)` → chart instance
  - `chart.setCandles(data)`, `chart.setVolume(data)`
  - `chart.addPlotSeries(name, options)` → series handle
  - `chart.setMarkers(markers)`, `chart.setFills(fills)`, `chart.setLines(lines)`, `chart.setLabels(labels)`, `chart.setHLines(hlines)`, `chart.setDrawingLines(drawingLines)`, `chart.setBoxes(boxes)`
  - `chart.removeSeries(name)`
  - `chart.timeScale()` → { fitContent(), scrollTo(), scrollToDate() }
  - `chart.applyOptions(options)`, `chart.remove()`
  - `chart.beginUpdate()`, `chart.endUpdate()` — batch update batching
  - Events: onCrosshairMove, onVisibleRangeChange, onResize, onPriceRangeChange
- **Rendering Layers** (back to front):
  1. Background (bgcolor)
  2. Grid lines
  3. Volume bars
  4. Fill areas (base polygon + per-bar color overlay segments)
  5. Candlesticks
  6. Bar color overrides (barcolor)
  7. Horizontal lines (hline)
  8. Line plots (line, stepline, circles, cross, histogram, columns; with per-bar color support)
  9. Area plots (area, areabr)
  10. Drawing lines (line.new objects, solid/dotted/dashed, extend modes)
  11. Boxes (box.new objects)
  12. Polylines (polyline.new objects)
  13. Linefills (linefill.new objects)
  14. Shape markers (plotshape)
  15. Character markers (plotchar)
  16. Directional arrows (plotarrow)
  17. Drawing labels (label.new objects, all styles)
  18. Strategy markers (entry/exit/close)
  19. Alert markers (alert trigger points)
  20. Axes (price scale, time scale)
  21. Crosshair + tooltip
  22. Tables (floating data tables, rendered as overlay)
  - **Clipping**: Candlesticks, overlay plots, and fills are clipped to `chartArea` using canvas clip regions; volume bars are clipped to `volumeArea`; indicator pane plots are clipped to their respective pane regions — preventing any visual bleed-through between panes

## 10. Strategy Engine

- **Responsibility**: Execute and backtest trading strategies with visual markers
- **Visual Markers**:
  - `strategy.entry(id, direction, qty, price, stop, limit, comment)`: Entry markers on chart — reverses position on opposite direction like TradingView; marker name defaults to "Long"/"Short" by direction, overridden by comment parameter
  - `strategy.order()`: Order markers on chart
  - `strategy.exit(id, qty, price, stop, limit, comment)`: Exit markers on chart with optional comment text; marker name defaults to "Exit {id}" format, overridden by comment parameter
  - `strategy.close()`: Closing markers on chart — supports named arguments (id, comment); marker name formatted as "Exit {name}"
  - `strategy.close_all()`: Closing markers on chart for all open positions
  - `strategy.cancel()`: Update displayed orders
  - `strategy.cancel_all()`: Update displayed orders
- **Key Features**:
  - Order management and position tracking
  - Performance metrics calculation
  - Commission and slippage modeling
  - Backtesting reports
  - Real-time order execution simulation
  - Visual representation of orders on chart
  - Trade-by-trade analysis
  - Market order fills deferred to next bar's open for realistic backtesting
  - Position reversal on opposite direction entry
  - Exit markers rendered with comment text
  - Strategy markers returned as part of execution result
  - strategy.position_size builtin for querying current position quantity
  - Pluggable Commission Calculation Methods via `CommissionCalculator` interface
  - getConfig() method for accessing strategy configuration
  - strategy.entry() and strategy.exit() accept stop, limit, and comment parameters for advanced order configuration
  - Entry marker naming: defaults to capitalized direction ("Long"/"Short"), overridden by comment parameter
  - Exit marker naming: defaults to "Exit {id}" format, overridden by comment parameter
  - Close marker naming: formatted as "Exit {name}" matching exit marker convention
  - strategy.exit() allows creation when position is flat but pending market entry exists (entry+exit on same bar support)

## 11. Plugin Registry

- **Responsibility**: Manage extensibility through plugins
- **Plugin Types**:
  - Function plugins: new built-in functions
  - Type plugins: new data types
  - Renderer plugins: new visualization components
  - Data source plugins: new data providers
- **Key Features**:
  - Runtime plugin discovery and registration
  - Interface validation
  - Dependency resolution
  - Version compatibility checking
  - Hot-swapping capability

## 12. Alert System

- **Responsibility**: Evaluate alert conditions and trigger notifications
- **Alert Functions**:
  - `alert(message, alert_freq)`: Trigger notifications with the specified message and frequency
  - `alertcondition(condition, title, message)`: Create named alert conditions visible in UI
- **Alert Frequencies**:
  - `alert.freq_once_per_bar`: Trigger once per bar (first occurrence)
  - `alert.freq_once_per_bar_close`: Trigger once on bar close
  - `alert.freq_all`: Trigger on every condition true
  - `alert.freq_max_per_bar`: Trigger maximum once per bar
- **Message Templates**:
  - Template variables: `{{plot_0}}`, `{{plot_1}}`, `{{plot_2}}`, etc. for referencing plot values
  - Bar data: `{{close}}`, `{{open}}`, `{{high}}`, `{{low}}`, `{{volume}}`, `{{time}}`, `{{interval}}`
- **Key Features**:
  - Condition evaluation on each bar
  - Message formatting with template syntax
  - Duplicate prevention with configurable windows
  - Multiple output destinations (email, webhook, popup, Telegram, etc.)
  - Alert logging and auditing
  - Display alertcondition() in indicator settings UI
  - Alert markers rendered on chart at trigger bar
  - Bar-close dispatch: alert triggers are suppressed during intra-bar updates and forming-candle recalculations; Telegram/email/webhook delivery only fires on confirmed bar close (`barstate.isconfirmed`), preventing notification spam during live candle formation
- **Three-Layer Alert Dedup Enforcement**:
  1. **ScriptSession `lastConfirmedTimestamp`** — Per-session timestamp tracking: if a second `confirmed=true` kline arrives with the same or older timestamp, the session skips re-execution entirely (returns forming-candle result with `isConfirmed=false`, alerts suppressed).
  2. **Gateway `recentAlertKeys` Set** — Module-level Set keyed by `alertId:timestamp:topic` (bounded at 100 entries, oldest evicted first). Before dispatching a Telegram alert, the gateway checks this Set; if the key exists, the duplicate is suppressed with a log message.
  3. **Stale connection pruning** — Before iterating topic subscribers, closed WebSocket connections are removed from the subscriber Set, preventing orphaned sessions from producing phantom alerts.
- **Telegram Integration (Telegraf Bot)**:
  - Uses the **Telegraf** library (v4+, 9.2k GitHub stars, Bot API v7.1 compatible) as the Telegram Bot API framework
  - Bot runs as a long-lived service colocated with the Backend, using `bot.launch()` with graceful `SIGINT`/`SIGTERM` shutdown via `bot.stop()`
  - On alert trigger, formats message with alert text, script name, symbol, timeframe, timestamp and dispatches via `ctx.telegram.sendMessage()`
  - Supports MarkdownV2-formatted alert messages via `ctx.replyWithMarkdownV2()` with embedded OHLCV, indicator values, and plot references
  - Supports sending chart screenshots with alerts via `ctx.telegram.sendPhoto()` using the canvas as a `Buffer`
  - Command system via `bot.command()`: `/start`, `/help`, `/subscribe`, `/unsubscribe` with persistent subscription storage in `backend/data/telegram.json`
  - Middleware pipeline via `bot.use()` for logging, rate-limiting, and authorization checks
  - Webhook mode support for production: attaches to the existing Express server via `bot.createWebhook()` for shared port usage
  - Graceful error handling for Telegram API failures (rate limits, network, Bot API errors)
  - **SOCKS5 Proxy**: All Telegram Bot API outbound connections are routed through a configurable SOCKS5 proxy
    - Proxy settings (host, port, username, password) are persisted in the `proxy` key under `settings` in `backend/data/telegram.json`
    - On bot initialization, if proxy settings are present, a SOCKS5 agent (via `socks-proxy-agent` or equivalent) is created and passed as the Telegram HTTP agent via Telegraf's `telegram.options.agent` configuration
    - If no proxy is configured, the bot connects directly (backward compatible)
    - Proxy configuration is exposed via REST endpoints `GET /api/settings/telegram/proxy` and `PUT /api/settings/telegram/proxy`
- **JSON File Persistence** (`backend/data/telegram.json`):
  - Single-file storage for all Telegram configuration and subscriptions — no database dependency
  - Schema: `{ botToken: string, subscribers: Array<{chatId, username, subscribedAt, alerts: [{id, title, enabled}]}>, settings: object }`
  - Auto-creates `backend/data/` directory and `telegram.json` with defaults on first launch
  - Synchronous atomic reads/writes with file-locking (via `proper-lockfile` or similar) to prevent concurrent write corruption
  - Reloads from disk on every read to support manual edits and external backup workflows
  - Lightweight JSON CRUD service (`JsonStore`) wrapping `fs.readFileSync`/`fs.writeFileSync` with validation

## 13. Input and Configuration System

- **Responsibility**: Handle user inputs and script configuration
- **Input Types**:
  - `input.int()`, `input.float()`, `input.bool()`, `input.string()`
  - `input.color()`, `input.symbol()`, `input.timeframe()`
  - `input.source()`, `input.session()`
  - `input.time()` for timestamp-type inputs with default values
- **Key Features**:
  - Default value handling
  - Constraint validation
  - Input grouping and organization
  - Persistence across executions
  - Real-time input change handling

## 14. Color System

- **Responsibility**: Manage Pine's color system and formatting
- **Key Features**:
  - Color representations (hex, rgb, named colors)
  - Color arithmetic and blending
  - Transparency (alpha channel) support
  - Conditional color expressions
  - Gradient and palette functions
  - Consistent rendering across displays
  - color.new(color, transp) builtin for creating colors with specified transparency
  - Color namespace syntax (color.blue, color.red, color.green, etc.) resolving to hex values
  - color.from_gradient(value, minVal, maxVal, bottomColor, topColor) for linear RGB interpolation between two colors

## 15. Script Declaration System

- **Responsibility**: Handle script type declarations and configuration (v5 and v6)
- **Script Types**:
  - `indicator()`: Configure script as indicator with overlay, max_labels_count, max_lines_count, max_boxes_count, max_polylines_count
  - `strategy()`: Configure script as strategy with order management parameters
  - `library()`: Configure script as reusable library
- **Key Features**:
  - Support for all indicator() parameters (title, shorttitle, overlay, format, precision, scale, max_labels_count, max_lines_count, max_boxes_count, max_polylines_count, max_bars_back, calc_on_every_tick, max_lines_left, max_labels_left, max_boxes_left, explicit_plot_zorder)
  - Support for all strategy() parameters (title, shorttitle, overlay, format, precision, scale, pyramiding, calc_on_every_tick, backtest_fill_limits_assumption, default_qty_type, default_qty_value, initial_capital, commission_type, commission_value, slippage, process_orders_on_close, close_entries_rule, margin_long, margin_short, max_boxes_count, max_lines_count, max_labels_count, risk_free_rate)
  - Script type validation and compatibility checking
  - Version-aware parameter handling: v5 and v6 may have different default values or parameter names for indicator()/strategy()/library()

## 16. Frontend Web Application

- **Responsibility**: Provide interactive web-based interface for Pine Script development (v5 and v6) using a custom canvas-based charting library
- **Key Components**:
  - **Web Application**: Main application shell with routing and state management
  - **Code Editor**: Monaco/CodeMirror-based editor with Pine Script syntax highlighting and auto-completion
  - **Canvas Chart**: Custom HTML5 Canvas charting library (see section 8a) rendering candlesticks, volume, plots, shapes, fills, strategy markers, crosshair
  - **Error Console**: Real-time error logging with line numbers and descriptions
  - **Strategy Results Popup**: Full-screen overlay showing backtest metrics, equity/drawdown chart, and trade list with sortable columns; includes gear icon to open a compact settings overlay for tweaking strategy parameters
- **Workflow**:
  1. User clicks "Open Editor" → popup editor opens with default Pine Script code
  2. User writes/modifies code and clicks "Run" or presses Ctrl+Enter
  3. Script is sent to Backend `/api/execute` for compilation and execution
  4. Execution results (plots, shapes, fills, strategy markers) are rendered on the chart
  5. If the script returned `strategyMarkers` (indicating a strategy, not an indicator), a "Run Backtest" button appears in the header area
  6. Clicking "Run Backtest" opens a settings panel where the user configures backtest parameters before running
  7. The settings panel is pre-populated with defaults from the `strategy()` declaration and any previously saved user settings
  8. Settings persist across sessions and page reloads — previously used values are restored when the panel reopens
  9. The date range input defaults to a "days back" mode (e.g., "10 days", "30 days") with a toggle to switch to traditional begin/end date picker mode
  10. Settings are read-only until the backtest has been run at least once
  11. After the first run, settings become editable for subsequent backtests
  12. When the user confirms settings and clicks "Confirm" (or "Run"), the backtest runs and the results panel is displayed
  13. The results panel shows key metrics, equity/drawdown chart, and sortable trade list
  14. A settings gear button in the results panel opens the settings overlay for tweaking parameters (after the first backtest)
- **Key Features**:
  - Realtime candlestick chart rendered entirely on HTML5 Canvas
  - Popup code editor for Pine Script entry
  - Sends script to Backend for compilation/execution, renders returned results on canvas
  - Error logging for compilation and runtime errors
  - Realtime chart updates with WebSocket data streaming from Backend
  - Zoom (mouse wheel, pinch) and pan (click-and-drag) on canvas
  - Crosshair cursor with OHLCV and indicator value tooltip
  - Chart legend with indicator names and values
  - Timeframe and symbol selection controls
  - Render all Pine Script visual outputs on canvas (candlesticks, volume, plots, shapes, fills, strategy markers, hlines, drawing lines)
  - Multiple concurrent indicators on same chart
  - Smooth 60fps rendering with requestAnimationFrame and dirty flag optimization
  - Syntax highlighting for Pine Script
  - Auto-completion for Pine Script keywords and functions
  - Save and load user scripts
  - Workspace package importing `pine-framework` directly
  - Renders shapes as canvas-drawn vector markers at correct bar/price positions
  - Renders strategy entry/exit/close markers with directional arrows and color coding
  - Renders fill() as filled polygons between plot lines
  - Auto-focuses chart to new symbol's price range on pair switch
  - Filters invalid data points (time=0, non-finite values) before rendering
  - Auto-assigns distinct colors to plot lines when not explicitly specified
  - Parses plot metadata (color, linewidth) from output keys
  - Stores the last submitted script code in memory for automatic re-execution on new candle data
  - Automatically re-executes the script via the backend when new WebSocket kline data arrives
  - Applies updated indicator overlays (plots, shapes, fills, strategy markers) on the canvas chart without user interaction
  - Automatically re-executes the active script when symbol or timeframe changes
  - Renders drawing lines from line.new() and labels from label.new() on the canvas
  - Renders per-bar plot colors for line, stepline, histogram, and columns styles
  - Renders per-bar fill color overlays on top of base fill areas
  - Lazy loads historical OHLCV data when scrolling backwards: fetches older bars via Backend `end` timestamp param, prepends to chart data
  - Maintains scroll position when prepending data — viewport adjusts automatically, no visual jump
  - Batches candle and indicator updates into a single React render cycle during lazy load to prevent flicker
  - Uses engine-generated `barTimestamps` (when available) for time-alignment of plot data in `buildScriptResult()`, falling back to `ohlcvData` timestamps — making plots self-describing regardless of `ohlcvDataRef` divergence during lazy loading
  - Validates output lengths against both `barTimestamps.length` and `ohlcvData.length` (with ±1 tolerance for kline timing) in `handleExecutionResult()`, rejecting stale WS session results whose output count covers fewer bars than the frontend has, preventing indicator misalignment on newer candles
- **Strategy Results Popup Details**:
  - Position: fixed, centered, ~90vw × ~90vh, dark theme matching the existing UI
  - Sections:
    - Header: title "Backtest Results", close button (✕), settings gear (⚙), status (connected/disconnected), progress bar during backtest run
    - Metrics grid: 8 tiles (Net Profit, Win Rate, Profit Factor, Sharpe, Max DD, Sortino, Total Trades, Commission)
    - Equity/Drawdown chart: canvas-rendered equity curve (blue line) and drawdown (red line), dual-panel layout
    - Trades table: sortable columns (Direction, Entry, Exit, PnL, Return, MAE, MFE, Bars), green/red coloring
  - Settings panel: initially shown before results, containing fields: initial capital, commission calculation method (dropdown selecting from percent_fixed, per_order_fixed, jupiter_ultra, jupiter_manual, none), commission method settings (method-specific fields), slippage (value + type), default quantity (value + type), pyramiding, margin (long/short), date range (days back input with toggle to begin/end date picker)
  - Settings are read-only until the first backtest has run; after the first run, settings become editable
  - Settings persist across sessions and page reloads (stored in localStorage or backend)
  - Auto-extracts default values from `strategy()` declaration in the script source
  - Backtest runs asynchronously via `/api/backtest` with progress polling

## 17. Backend API Server

- **Responsibility**: Bridge frontend and engine, serve market data, manage connections (v5 and v6)
- **Key Components**:
  - **REST API Server**: Express/Fastify HTTP server on port 8080
  - **WebSocket Gateway**: ws-based realtime data streaming
  - **Script Executor**: Invokes `pine-framework` engine for compilation and execution
  - **Session Manager**: Persists execution engine instances per WebSocket client for incremental real-time bar updates
  - **Data Cache**: In-memory LRU cache for recent OHLCV data
  - **Telegram Bot (Telegraf)**: Long-running Telegraf bot service for alert delivery, user subscriptions, command handling, and chart screenshot broadcasting
- **API Endpoints**:
  - `GET /api/ohlcv?symbol=BTCUSDT&interval=1m&limit=1000&end=<timestamp>` — Historical kline data (optional `end` param for lazy loading)
  - `POST /api/execute` — Compile and execute Pine Script code (returns outputs, shapes, fills, strategyMarkers, lines, labels, bgcolor, per-bar colors, barTimestamps); accepts optional `offset` param for incremental results
  - `GET /api/symbols` — List available trading symbols
  - `GET /api/status` — Server and connection status
- **WebSocket Protocol**:
  - Client sends: `{ type: "subscribe", topic: "kline.1m.BTCUSDT" }`
  - Client sends: `{ type: "unsubscribe", topic: "kline.1m.BTCUSDT" }`
  - Server sends: `{ type: "kline", data: { symbol, interval, open, high, low, close, volume, timestamp } }`
  - Client sends: `{ type: "execute", data: { source: "…" } }` — register a Pine Script for persistent execution
  - Server sends: `{ type: "connected", data: { connectionId } }`
  - Server sends: `{ type: "error", data: { message, code } }`
  - Server sends: `{ type: "execution_result", data: { outputs, shapes, fills, strategyMarkers, lines, labels, bgcolors, plotColors, fillColors, barTimestamps, barIndex } }` — updated script results after each new kline
  - Server sends: `{ type: "session_ready", indicatorId }` — session initialized and ready for real-time updates
  - Server sends: `{ type: "indicator_stopped", indicatorId }` — session stopped (e.g., user removed indicator)
  - Server sends: `{ type: "indicator_removed", data: { indicatorIds } }` — broadcast when indicators are removed (cascade delete)
- **Key Features**:
  - Manages Bybit API connections (REST + WebSocket)
  - Relays realtime market data to connected frontend clients
  - Executes Pine Script via `pine-framework` engine API
  - Caches OHLCV data to reduce API calls
  - Handles multiple concurrent WebSocket clients
  - Rate limiting for Bybit API compliance
  - Graceful reconnection on Bybit disconnects
  - Accepts JSON request bodies up to 5MB
  - Returns shapes, fills, and strategyMarkers in execute response
  - Includes `comment` field in each strategy marker entry returned from POST /api/execute
  - Handles non-JSON server responses gracefully
  - Validates WebSocket kline data before forwarding to clients
  - Maintains a ScriptSession per WebSocket client storing the compiled engine instance, source code, and current bar set
  - Invalidates the previous ScriptSession before creating a new one on WS execute, preventing stale sessions from emitting outdated execution_result messages
  - On receiving a `kline` WebSocket message from Bybit, appends/updates the bar in the session's bar set and calls `appendOrUpdateBar()` on the persisted ScriptSession, which delegates to `computeFormingCandle()` for forming updates and permanently advances engine state via `executeBar()` when a new bar arrives (previous bar confirmed)
  - Pushes updated execution results to the frontend as `execution_result` WebSocket messages containing the full outputs, shapes, fills, strategyMarkers, lines, labels, bgcolors, per-bar colors, and barTimestamps
  - Accepts `offset` parameter in POST /api/execute to return only outputs for newly added bars during lazy loading
  - Accepts `end` timestamp parameter in GET /api/ohlcv for fetching historical bars before a given time point
  - Includes bgcolor data, per-bar plot colors, per-bar fill colors, line objects (DrawingLineData), and label objects (LabelData) in execution responses
  - **Stale connection pruning**: Before iterating a topic's subscriber Set in `reexecuteForTopic`, closed connections (`readyState !== WebSocket.OPEN`) are removed, preventing the Set from accumulating stale references
  - **Confirm field forwarding**: The Bybit `confirm` property is parsed (`d.confirm === true || d.confirm === 'true'`) and forwarded to both the frontend (as `confirmed` in the kline data) and `ScriptSession.appendOrUpdateBar()` for bar-close detection

## 18. Bybit Data Adapter

- **Responsibility**: Integrate with Bybit exchange for real market data
- **Data Sources**:
  - **REST API**: `GET /v5/market/kline` for historical OHLCV
  - **WebSocket**: `wss://stream.bybit.com/v5/public/linear` for realtime kline streams
- **Supported Intervals**: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d, 1w, 1M
- **Supported Symbols**: BTCUSDT, ETHUSDT, and all linear perpetual contracts
- **Key Features**:
  - Normalizes Bybit data format to engine's `Bar` interface
  - Handles WebSocket reconnection and heartbeat
  - Rate-limits REST calls (Bybit: 120 requests/second for public endpoints)
  - No API keys required for public market data
  - Implements engine's `DataSource` interface for `request.security()` integration
  - Handles data gap detection and backfill
  - Symbol and interval subscription management
  - **Confirm field threading**: The `confirm` property from Bybit V5 kline WebSocket messages is parsed (`d.confirm === 'true'`) and threaded through the execution pipeline — forwarded to `ScriptSession.appendOrUpdateBar()` as the `confirmed` parameter, which controls whether the bar is treated as a confirmed close (`setFormingCandle(false)`) or a forming tick (`setFormingCandle(true)`)

## 19. Telegram Bot Integration

- **Responsibility**: Send script alert notifications to a Telegram user via a Telegram Bot
- **Architecture**:
  ```
  Backend (Alert System) → Telegram Bot (HTTP API) → Telegram User
  ```
- **Configuration Storage**: Telegram Bot Token and Telegram Username stored in Database
- **SOCKS5 Proxy**: All Telegram Bot API outbound connections are routed through a SOCKS5 proxy when configured
  - Proxy settings (host, port, username, password) stored in the `proxy` key under `settings` in `backend/data/telegram.json`
  - On initialization, if proxy settings are present, a SOCKS5 agent is created and configured as the Telegram HTTP agent
  - Falls back to direct connection when no proxy is configured
  - Exposed via REST API for frontend configuration UI
- **Key Features**:
  - Sends Telegram messages when `alert()` or `alertcondition()` triggers during chart rendering
  - Messages formatted with alert text, script name, symbol, timeframe, and timestamp
  - Per-alert enable/disable toggle stored in Database — each alert condition has a `telegramEnabled` flag
  - Disabled alerts still fire locally (chart markers, logs) but skip Telegram notification
  - Configuration UI provided in the Frontend to set/update Telegram credentials
  - Configuration UI provides per-alert toggle controls for Telegram selection
  - Graceful error handling: retries on rate limit (429), logs failures, never blocks script execution
  - Uses `telegraf` or raw fetch-based HTTP client to call Telegram Bot API (`sendMessage`)
  - Database layer provides CRUD operations for Telegram config and per-alert preferences

## 20. Database Layer

- **Responsibility**: Provide persistent storage for application configuration and user preferences
- **Data Stores**: SQLite (development) / PostgreSQL (production)
- **Tables**:
  - `telegram_config`: stores `bot_token`, `chat_id/username`, `enabled`
  - `alert_preferences`: stores `alert_id`, `script_name`, `telegram_enabled`
  - `user_settings`: general user preferences (extensible)
- **Key Features**:
  - Database client integrated into the Backend service
  - CRUD API exposed via REST endpoints: `GET/PUT /api/settings/telegram`, `GET/PUT /api/settings/alerts/:id/telegram`
  - Migrations managed via simple migration scripts
  - Connection pooling for production use
  - Prepared statements to prevent injection
  - Synchronous read/write for init-time config loading; async for runtime updates
