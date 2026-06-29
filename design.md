# Design Document: Pine Script v6 Engine

## Overview

The Pine Script v6 Engine is a production-grade alternative runtime that parses, executes, and renders Pine Script v6 programs with TradingView-like semantics. This design document outlines the architecture, components, data flow, and implementation strategies for building a complete Pine Script v6 compatible system.

### Research Findings

Key insights from Pine Script v6 and TradingView architecture research:

1. **Pine Script v6 Language Features**: Latest version includes enums, dynamic data requests, runtime logging, and tighter type system
2. **Execution Model**: Bar-by-bar execution with rollback capability for realtime bars
3. **Series Data Type**: Core Pine concept where each element corresponds to a historical bar
4. **Script Structure**: `//@version=6` declaration, script type (indicator/strategy/library), main code body
5. **TradingView Architecture**: Event-driven, plugin-based extensibility, realtime updates with rollback

### Design Principles

1. **SOLID Principles**: Single responsibility, open/closed, Liskov substitution, interface segregation, dependency inversion
2. **Plugin Architecture**: Extensible via plugin registry without core modifications
3. **Separation of Concerns**: Clear boundaries between parser, compiler, runtime, data engine, indicator engine, renderer, UI layer
4. **Performance Optimization**: Efficient handling of millions of candles and hundreds of concurrent indicators
5. **Modularity**: Independent development of components with well-defined interfaces

## Architecture

### System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Pine Script v6 Engine                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Layer 1: Language Processing                                               │
│    ┌──────────┐ ┌──────────┐ ┌──────────────┐                              │
│    │  Parser  │→│Compiler  │→│ AST Walker   │                              │
│    └──────────┘ └──────────┘ └──────────────┘                              │
│                                                                             │
│  Layer 2: Execution Engine                                                  │
│    ┌──────────┐ ┌──────────┐ ┌──────────────┐                              │
│    │  Runtime │→│Type Sys  │→│  State Mgmt  │                              │
│    └──────────┘ └──────────┘ └──────────────┘                              │
│                                                                             │
│  Layer 3: Data & Analysis                                                   │
│    ┌──────────┐ ┌──────────┐ ┌──────────────┐                              │
│    │ Data Eng │→│ TA Engine │→│  Request Sys │                              │
│    └──────────┘ └──────────┘ └──────────────┘                              │
│                                                                             │
│  Layer 4: Rendering                                                         │
│    ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────────┐             │
│    │ Plot Eng │→│Draw Eng  │→│  Renderer    │→│ Chart Engine │             │
│    └──────────┘ └──────────┘ └──────────────┘ └──────────────┘             │
│                                                                             │
│  Layer 5: Strategy & Extensibility                                         │
│    ┌──────────┐ ┌──────────┐ ┌──────────────┐                              │
│    │Strat Eng │→│Plugin Reg│→│  Alert Sys   │                              │
│    └──────────┘ └──────────┘ └──────────────┘                              │
│                                                                             │
│  Layer 6: Input & Configuration                                            │
│    ┌──────────┐ ┌──────────┐ ┌──────────────┐                              │
│    │Input Sys │→│Config    │→│ Color Sys    │                              │
│    └──────────┘ └──────────┘ └──────────────┘                              │
│                                                                             │
│  Layer 7: Frontend                                                          │
│    ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────────┐             │
│    │ Web App  │→│Code Editor│→│Canvas Chart  │→│ Error Console│             │
│    └──────────┘ └──────────┘ └──────────────┘ └──────────────┘             │
│                                                                             │
│  Layer 8: Backend & Integration                                             │
│    ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────┐│
│    │ API Srv  │→│WS Gateway│→│ Bybit Adapter│→│ Data Cache   │→│Telegram  ││
│    └──────────┘ └──────────┘ └──────────────┘ └──────────────┘ │ Bot      ││
│                                                                  └──────────┘│
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        Monorepo (pnpm workspaces)                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                         │
│  │ pine-       │  │ frontend    │  │ backend     │                         │
│  │ framework   │←─│ (React+Vite)│←─│ (Express+WS)│                         │
│  │ (engine)    │  │             │  │             │                         │
│  └─────────────┘  └─────────────┘  └─────────────┘                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Specifications

#### 1. Parser Component
- **Responsibility**: Convert Pine Script v6 source code to tokens and parse tree
- **Input**: Pine Script v6 source code string
- **Output**: Abstract Syntax Tree (AST)
- **Key Features**:
  - Handles all Pine Script v6 language constructs including switch expressions, arrow syntax (=>), and type-inferred array.new_<type>() declarations
  - Version detection (`//@version=6`)
  - Syntax error reporting with line/column information
  - Supports all Pine script types: indicator, strategy, library

#### 2. Compiler Component
- **Responsibility**: Validate AST and produce executable representation
- **Input**: AST from Parser
- **Output**: Compiled script with type-checked IR (Intermediate Representation)
- **Key Features**:
  - Type checking and validation including switch expression branch type unification and array.new_<type>() type inference
  - Scope resolution
  - Variable declaration validation
  - Constant folding optimization
  - Produces optimized bytecode or IR

#### 3. Type System
- **Responsibility**: Manage Pine's type system with automatic coercion
- **Types Supported**:
  - Primitives: `int`, `float`, `bool`, `string`, `color`
  - Series: `series<int>`, `series<float>`, etc.
  - Collections: `array`, `map`
  - User-defined: type aliases
- **Key Features**:
  - Automatic type coercion following Pine rules
  - Series type semantics
  - `na` (not available) value handling; logical AND/OR treats na as false (Pine Script boolean semantics)
  - Type inference for array.new_<type>() returning array<elementType>
  - Generic array operations: size, first, last, shift, pop, push, unshift, insert, remove, contains, fill, set, get, sort, copy
  - Method dispatch on numeric IDs for line and label objects enabling chained operations

#### 4. Execution Engine
- **Responsibility**: Execute compiled Pine scripts bar-by-bar
- **Execution Model**:
  - Historical mode: process bars sequentially
  - Realtime mode: update calculations on new bar data
  - Rollback capability for realtime execution
- **Key Features**:
  - Maintains series state across executions
  - Implements Pine's series indexing (`close[1]`, etc.)
  - Variable scope management
  - Error recovery with rollback
  - Returns shapes (plotshape markers), fills (area between plots), strategyMarkers, lines (LineEntry), and labels (LabelEntry) as part of execution result
  - Supports named arguments forwarding to built-in functions
  - Auto-detects plot titles from variable names when no explicit title is provided
  - Maintains var/varip variable state across bars without resetting on re-declaration
  - Supports inclusive for-loop iteration (`for i = 0 to end` includes the `end` value)
  - Forwards named arguments (comment, stop, limit) to strategy.entry() and strategy.exit() builtins
  - Parses variable-length argument lists for strategy builtins to extract positional and named parameters
  - Incremental real-time bar execution via `executeRealtimeBar()` which processes a single new bar while preserving prior state
  - State snapshot management for rollback: `createSnapshot()` saves engine state before real-time updates, `rollbackToSnapshot()` restores on error
  - The engine instance is kept alive across real-time updates so that var/varip, series indices, and strategy positions persist between bars
  - Executes switch expressions with full conditional branching and local block scoping
  - Supports syminfo namespace as built-in read-only variables (tickerid, mintick, pointvalue, pricescale, currency)
  - Implements strict comparisons matching Pine Script: ta.crossover uses <= on prev bar, ta.crossunder uses >=, ta.pivothigh uses strict >, ta.pivotlow uses strict <
  - Generic array method execution: size, push, pop, shift, unshift, insert, remove, contains, fill, set, get, sort, copy
  - Method dispatch system for line.* and label.* calls on numeric object IDs returned by line.new() and label.new()
  - Per-bar color storage: plot color data and fill color data stored as separate arrays alongside output values
  - plot() builtin outputs a single continuous series key regardless of per-bar color variation (no splitting into per-color variants)
  - bgcolor data forwarded through execution result pipeline

#### 5. Data Engine
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

#### 6. Technical Analysis (TA) Engine
- **Responsibility**: Implement all ta.* functions with TradingView precision
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
  - Real ta.ema() using exponential moving average formula (prev * (1-k) + source * k)
  - ta.crossover() and ta.crossunder() with internal state tracking for proper detection
  - ta.sar() with correct 2-bar initialization (UP/DOWN detection from close vs prevClose), EP/AF tracking, and reversal logic
  - Per-call-site state isolation for ta.sma() and ta.ema() via call-site counters so multiple calls with different sources do not share internal buffers

#### 7. Request System
- **Responsibility**: Handle multi-symbol and multi-timeframe data access
- **Key Features**:
  - `request.security()` implementation
  - Lookahead bias prevention
  - Data alignment across different timeframes
  - Caching with invalidation strategy
  - Real-time update propagation

#### 8. Plot Engine
- **Responsibility**: Produce plot/shape/fill/marker data structures consumed by the Canvas Charting Library
- **Plot Functions**:
  - `plot()`: Line plots with styles (line, stepline, histogram, columns, area, areabr, circles, cross) — supports named arguments for color, linewidth, title; auto-detects title from variable names
  - `plotshape()`: Shape markers (arrowup, arrowdown, circle, square, diamond, triangleup, triangledown, cross, xcross) — produces shape data with bar index, position, and color for canvas rendering
  - `plotchar()`: Character markers with custom characters
  - `plotarrow()`: Directional arrows with colorup/colordown
  - `hline()`: Horizontal lines at price levels with linestyle (solid, dotted, dashed)
- **Background & Bar Coloring**:
  - `bgcolor()`: Color chart background with specified colors
  - `barcolor()`: Color chart candles/bars with specified colors
  - `fill()`: Fill area between two plots or hlines — produces fill polygon data for canvas rendering, accepts named `color` argument
- **Key Features**:
  - Style support (color, linewidth, transparency, offset, editable, show_last, display)
  - Z-ordering for overlapping plots
  - Visual fidelity matching TradingView
  - Support for all plot.style_* enums (line, stepline, histogram, columns, area, areabr, circles, cross)
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

#### 9. Drawing Engine
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
  - All copy, delete, set_*, get_* methods for each object type
  - Styling options (fill, border, text formatting)
  - Positioning and anchoring (xloc: bar_index, bar_time; yloc: price, abovebar, belowbar)
  - Extend modes (none, left, right, both)
  - Update/delete operations
  - Memory management for large numbers of objects
  - Enforcement of max_labels_count, max_lines_count, max_boxes_count, max_polylines_count limits
  - Canvas rendering of all objects at correct bar index and price level positions
  - Object position updates when chart is zoomed or panned

#### 8a. Canvas Charting Library
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
  │   ├── MarkerRenderer (shape markers: arrows, circles, squares, diamonds)
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
  └── InteractionHandler (mouse/touch events for zoom, pan, hover, price scale drag/zoom, double-click reset)
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
  - Vertical pan and zoom on price scale via click-and-drag on the price scale area
  - Double-click to reset to auto price range and fit content
  - Price range computation filters non-finite and near-zero plot values to prevent chart distortion
  - Price range clamped to at most 10x candle range to prevent excessive scaling when plot values exceed candle prices
  - Per-bar plot color rendering for line, stepline, histogram, columns styles
  - Per-bar fill color overlay segments on top of base fill polygon
  - Drawing line rendering (solid, dotted, dashed, extend modes: none/left/right/both)
  - Label rendering (rounded boxes, all label styles, configurable text/background/border colors)
  - ResizeObserver for responsive container handling
  - Event system: onCrosshairMove, onVisibleRangeChange, onResize, onPriceRangeChange
- **API**:
  - `createChart(container, options)` → chart instance
  - `chart.setCandles(data)`, `chart.setVolume(data)`
  - `chart.addPlotSeries(name, options)` → series handle
  - `chart.setMarkers(markers)`, `chart.setFills(fills)`, `chart.setLines(lines)`, `chart.setLabels(labels)`, `chart.setHLines(hlines)`, `chart.setDrawingLines(drawingLines)`
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

#### 10. Strategy Engine
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
  - strategy.commission.percent commission type support
  - getConfig() method for accessing strategy configuration
  - strategy.entry() and strategy.exit() accept stop, limit, and comment parameters for advanced order configuration
  - Entry marker naming: defaults to capitalized direction ("Long"/"Short"), overridden by comment parameter
  - Exit marker naming: defaults to "Exit {id}" format, overridden by comment parameter
  - Close marker naming: formatted as "Exit {name}" matching exit marker convention

#### 11. Plugin Registry
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

#### 12. Alert System
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
- **JSON File Persistence** (`backend/data/telegram.json`):
  - Single-file storage for all Telegram configuration and subscriptions — no database dependency
  - Schema: `{ botToken: string, subscribers: Array<{chatId, username, subscribedAt, alerts: [{id, title, enabled}]}>, settings: object }`
  - Auto-creates `backend/data/` directory and `telegram.json` with defaults on first launch
  - Synchronous atomic reads/writes with file-locking (via `proper-lockfile` or similar) to prevent concurrent write corruption
  - Reloads from disk on every read to support manual edits and external backup workflows
  - Lightweight JSON CRUD service (`JsonStore`) wrapping `fs.readFileSync`/`fs.writeFileSync` with validation

#### 13. Input and Configuration System
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

#### 14. Color System
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

#### 15. Script Declaration System
- **Responsibility**: Handle script type declarations and configuration
- **Script Types**:
  - `indicator()`: Configure script as indicator with overlay, max_labels_count, max_lines_count, max_boxes_count, max_polylines_count
  - `strategy()`: Configure script as strategy with order management parameters
  - `library()`: Configure script as reusable library
- **Key Features**:
  - Support for all indicator() parameters (title, shorttitle, overlay, format, precision, scale, max_labels_count, max_lines_count, max_boxes_count, max_polylines_count, max_bars_back, calc_on_every_tick, max_lines_left, max_labels_left, max_boxes_left, explicit_plot_zorder)
  - Support for all strategy() parameters (title, shorttitle, overlay, format, precision, scale, pyramiding, calc_on_every_tick, backtest_fill_limits_assumption, default_qty_type, default_qty_value, initial_capital, commission_type, commission_value, slippage, process_orders_on_close, close_entries_rule, margin_long, margin_short, max_boxes_count, max_lines_count, max_labels_count, risk_free_rate)
  - Script type validation and compatibility checking

#### 16. Frontend Web Application
- **Responsibility**: Provide interactive web-based interface for Pine Script development using a custom canvas-based charting library
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
  5. If the script returned `strategyMarkers` (indicating a strategy, not an indicator), a "View Backtest Results" button appears in the header area
  6. Clicking "View Backtest Results" opens a nearly full-screen popup (~90% viewport)
  7. The popup shows key metrics, equity/drawdown chart, and sortable trade list
  8. A settings gear button opens a compact overlay where the user can tweak strategy parameters (initial capital, commission, slippage, etc.) — these auto-load from the `strategy()` declaration
  9. Changing settings and clicking "Run Backtest" triggers a new backtest via the Backend
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
  - Settings overlay: compact popup within the main popup containing fields: initial capital, commission (value + type), slippage (value + type), default quantity (value + type), pyramiding, margin (long/short), start date, end date
  - Auto-extracts default values from `strategy()` declaration in the script source
  - Backtest runs asynchronously via `/api/backtest` with progress polling

#### 17. Backend API Server
- **Responsibility**: Bridge frontend and engine, serve market data, manage connections
- **Key Components**:
  - **REST API Server**: Express/Fastify HTTP server on port 8080
  - **WebSocket Gateway**: ws-based realtime data streaming
  - **Script Executor**: Invokes `pine-framework` engine for compilation and execution
  - **Session Manager**: Persists execution engine instances per WebSocket client for incremental real-time bar updates
  - **Data Cache**: In-memory LRU cache for recent OHLCV data
  - **Telegram Bot (Telegraf)**: Long-running Telegraf bot service for alert delivery, user subscriptions, command handling, and chart screenshot broadcasting
- **API Endpoints**:
  - `GET /api/ohlcv?symbol=BTCUSDT&interval=1m&limit=1000&end=<timestamp>` - Historical kline data (optional `end` param for lazy loading)
   - `POST /api/execute` - Compile and execute Pine Script code (returns outputs, shapes, fills, strategyMarkers, lines, labels, bgcolor, per-bar colors, barTimestamps); accepts optional `offset` param for incremental results
  - `GET /api/symbols` - List available trading symbols
  - `GET /api/status` - Server and connection status
- **WebSocket Protocol**:
  - Client sends: `{ type: "subscribe", topic: "kline.1m.BTCUSDT" }`
  - Client sends: `{ type: "unsubscribe", topic: "kline.1m.BTCUSDT" }`
  - Server sends: `{ type: "kline", data: { symbol, interval, open, high, low, close, volume, timestamp } }`
  - Client sends: `{ type: "execute", data: { source: "…" } }` — register a Pine Script for persistent execution
  - Server sends: `{ type: "connected", data: { connectionId } }`
  - Server sends: `{ type: "error", data: { message, code } }`
   - Server sends: `{ type: "execution_result", data: { outputs, shapes, fills, strategyMarkers, lines, labels, bgcolors, plotColors, fillColors, barTimestamps, barIndex } }` — updated script results after each new kline
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
  - On receiving a `kline` WebSocket message from Bybit, appends/updates the bar in the session's bar set and calls `executeRealtimeBar()` on the persisted engine
   - Pushes updated execution results to the frontend as `execution_result` WebSocket messages containing the full outputs, shapes, fills, strategyMarkers, lines, labels, bgcolors, per-bar colors, and barTimestamps
  - Accepts `offset` parameter in POST /api/execute to return only outputs for newly added bars during lazy loading
  - Accepts `end` timestamp parameter in GET /api/ohlcv for fetching historical bars before a given time point
  - Includes bgcolor data, per-bar plot colors, per-bar fill colors, line objects (DrawingLineData), and label objects (LabelData) in execution responses

#### 18. Bybit Data Adapter
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

#### 19. Telegram Bot Integration
- **Responsibility**: Send script alert notifications to a Telegram user via a Telegram Bot
- **Architecture**:
  ```
  Backend (Alert System) → Telegram Bot (HTTP API) → Telegram User
  ```
- **Configuration Storage**: Telegram Bot Token and Telegram Username stored in Database
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

#### 20. Database Layer
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

### Data Flow

#### 1. Script Loading and Compilation Flow
```
Frontend (Code Editor) → POST /api/execute → Backend → Parser → AST → Compiler → Type Checking → IR Generation → Executable
```

#### 2. Historical Execution Flow
```
Bybit REST API → Backend (Data Cache) → Frontend (OHLCV) → Backend (Pine Engine) → Series State → TA Engine → Plot Engine + Shape Engine + Fill Engine + Strategy Engine → Backend (outputs, shapes, fills, strategyMarkers) → Frontend (Chart Render)
```

#### 3. Realtime Execution Flow
```
Bybit WebSocket → Backend (WS Gateway)
  ├── Data Cache (update bar)
  ├── Frontend (WS Client) → Chart Update (candle refresh)
  └── Session Manager → Persisted Engine (executeRealtimeBar)
        → Updated outputs, shapes, fills, strategyMarkers
        → Backend (WS Gateway) → Frontend (WS Client)
        → Chart Overlay Update (indicators, markers, fills)
```

#### 4. Request Processing Flow
```
Script Request → Backend → Pine Engine (request.security()) → Bybit Adapter → Bybit REST API → Data Alignment → Script
```

#### 5. Strategy Execution Flow
```
Market Data → Backend → Strategy Engine → Order Generation (deferred to next bar open) → Position Management (reversal on opposite direction) → Performance Metrics → Strategy Markers → Backend (shapes, fills, strategyMarkers) → Frontend (Chart Render with markers, fills, shapes)
```

#### 6. Monorepo Package Dependency Flow
```
pine-framework (engine library)
    ↑ workspace dependency
    ├── frontend (React + Vite) ── imports engine for type definitions
    └── backend (Express + WS) ── imports engine for script execution
```

### Module Boundaries and Responsibilities

#### Language Processing Layer
- **Parser**: Language syntax to AST conversion
- **Compiler**: AST validation and IR generation
- **Type System**: Type checking and coercion
- **AST Walker**: Tree traversal and transformation

#### Execution Layer
- **Runtime**: Script execution environment
- **State Management**: Series and variable state
- **Scope Manager**: Variable scope handling
- **Error Handler**: Exception and rollback management

#### Data Layer
- **Data Engine**: OHLCV data management
- **Request System**: Multi-symbol data access
- **Cache Manager**: Data caching and invalidation
- **Alignment Engine**: Data alignment across timeframes

#### Analysis Layer
- **TA Engine**: Technical indicator calculations
- **Math Library**: Mathematical function implementations
- **Statistical Functions**: Statistical calculations
- **Optimization Engine**: Performance optimization

#### Rendering Layer
- **Plot Engine**: Basic plot rendering
- **Drawing Engine**: Object drawing
- **Renderer**: Final visual output
- **Layout Manager**: Visual element arrangement

#### Strategy Layer
- **Strategy Engine**: Order and position management
- **Backtest Engine**: Historical strategy testing
- **Performance Calculator**: Metrics calculation
- **Report Generator**: Result reporting

#### Extensibility Layer
- **Plugin Registry**: Plugin management
- **Interface Validator**: Plugin interface validation
- **Dependency Resolver**: Plugin dependency handling
- **Version Manager**: Plugin version compatibility

### Execution Lifecycle

#### 1. Initialization Phase
- Load Pine Script source code
- Parse and compile to IR
- Initialize execution context
- Set up data connections
- Configure rendering environment

#### 2. Historical Processing Phase
- For each historical bar (oldest to newest):
  - Update bar data
  - Execute script for current bar
  - Store series state
  - Calculate indicators
  - Generate plots and drawings
- Finalize historical state

#### 3. Realtime Processing Phase
- On new bar data:
  - Rollback to last confirmed state
  - Update with new bar data
  - Re-execute script
  - Update visualizations
  - Trigger alerts if conditions met
- Repeat for each realtime update

#### 4. Cleanup Phase
- Save final state
- Generate reports
- Clean up resources
- Log execution summary

### Rendering Architecture

#### 1. Visual Element Hierarchy
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

#### 2. Rendering Pipeline
```
Data Change / Interaction → Dirty Flag Set → requestAnimationFrame Callback
  → Clear Canvas → Apply Coordinate Transforms → Render Layers in Order
    → Background → Grid → Volume → Fills → Candles → HLines → Plots
    → Shapes → Strategy Markers → Drawings → Axes → Crosshair
  → Swap Buffers (double buffer) → Display
```

#### 3. Performance Optimization
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

### Plugin System Design

#### 1. Plugin Architecture
```
Plugin Interface → Plugin Registry → Discovery → Validation → Registration → Integration
```

#### 2. Plugin Types and Interfaces

**Function Plugin Interface:**
```typescript
interface FunctionPlugin {
  name: string;
  signature: FunctionSignature;
  implementation: FunctionImplementation;
  version: string;
  dependencies?: string[];
}
```

**Type Plugin Interface:**
```typescript
interface TypePlugin {
  name: string;
  typeDefinition: TypeDefinition;
  operations: TypeOperations;
  version: string;
}
```

**Renderer Plugin Interface:**
```typescript
interface RendererPlugin {
  name: string;
  renderType: string;
  renderFunction: RenderFunction;
  version: string;
}
```

#### 3. Plugin Lifecycle
1. **Discovery**: Scan plugin directories or registries
2. **Loading**: Load plugin module and metadata
3. **Validation**: Check interface compliance and dependencies
4. **Registration**: Register with appropriate subsystem
5. **Activation**: Make plugin available for use
6. **Deactivation**: Disable plugin if needed
7. **Unloading**: Remove plugin from memory

#### 4. Plugin Registry Features
- Runtime plugin discovery and loading
- Dependency resolution and conflict detection
- Version compatibility checking
- Hot-swapping capability
- Plugin isolation and sandboxing
- Security validation for third-party plugins

### Data Storage and Caching Strategies

#### 1. Data Storage Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                       Data Storage                          │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: In-Memory Cache (LRU/LFU)                        │
│    - Recent bars for fast access                            │
│    - Frequently accessed symbols                            │
│    - Computed indicators                                    │
│                                                             │
│  Layer 2: Memory-Mapped Files                               │
│    - Historical OHLCV data                                  │
│    - Optimized for sequential access                        │
│    - Efficient for millions of candles                      │
│                                                             │
│  Layer 3: Persistent Storage                                │
│    - Database for configuration & metadata (SQLite/PostgreSQL)│
│      - Telegram Bot Token and Telegram Username              │
│      - Per-alert Telegram notification preferences           │
│      - User settings and script configurations               │
│    - Parquet files for time series data                     │
│    - Compression for storage efficiency                     │
│                                                             │
│  Layer 4: External Data Sources                             │
│    - Real-time data feeds                                   │
│    - Market data providers                                  │
│    - REST APIs for historical data                          │
└─────────────────────────────────────────────────────────────┘
```

#### 2. Caching Strategies

**Time-Series Data Cache:**
- LRU (Least Recently Used) cache for recent bars
- Pre-fetching for sequential access patterns
- Batch loading for multi-timeframe requests

**Indicator Cache:**
- Cache computed technical indicators
- Invalidate on data updates
- Share cache across multiple scripts using same data

**Request Cache:**
- Cache results of `request.security()` calls
- Invalidate based on data freshness
- Support for different caching policies per request

#### 3. Memory Management
- Object pooling for frequent allocations
- Reference counting for shared resources
- Garbage collection for unused objects
- Memory limits per script execution
- Leak detection and prevention

### Error Handling and Recovery

#### 1. Error Classification

**Syntax Errors:**
- Parse errors during compilation
- Early detection with precise location information
- User-friendly error messages

**Runtime Errors:**
- Type errors during execution
- Out of bounds access
- Division by zero
- Invalid function arguments

**Data Errors:**
- Missing or corrupt data
- Data alignment issues
- Invalid data formats

**System Errors:**
- Memory allocation failures
- I/O errors
- Plugin loading failures

#### 2. Error Handling Strategy

**Compile-time Errors:**
- Fail fast with detailed diagnostics
- Suggest corrections when possible
- Continue with partial compilation for IDE support

**Runtime Errors:**
- Graceful degradation when possible
- Rollback to previous valid state
- Log errors for debugging
- Provide user-friendly error messages

**Data Errors:**
- Data validation on ingestion
- Fallback to alternative data sources
- Gap handling strategies
- User notification of data issues

#### 3. Recovery Mechanisms

**Rollback for Realtime Execution:**
- Save state before each realtime update
- Revert to saved state on error
- Continue with next update

**Checkpoint/Restore:**
- Periodic state checkpointing
- Resume from checkpoint after crash
- Progress persistence for long-running scripts

**Fallback Strategies:**
- Alternative calculation methods
- Simplified visualizations
- Default values for missing data

### Testing Architecture

#### 1. Testing Strategy

**Unit Tests:**
- Individual component testing
- Function-level correctness
- Edge case coverage
- Performance benchmarks

**Integration Tests:**
- Component interaction testing
- End-to-end script execution
- Data flow validation
- Plugin integration testing

**Compatibility Tests:**
- TradingView output comparison
- Numerical precision validation
- Visual rendering comparison
- Cross-version compatibility
- Real-world indicator compatibility: parse, compile, and execute full complex indicators from `test_indicators/` directory (e.g., TrendCraft ICT SwiftEdge) to validate production readiness

**Property-Based Tests:**
- Mathematical property verification
- Round-trip property testing
- Invariant preservation
- Random input testing

#### 2. Test Framework Components

**Test Runner:**
- Parallel test execution
- Test discovery and organization
- Result reporting and aggregation
- Coverage measurement

**Test Data Management:**
- Synthetic data generation
- Real market data samples
- Edge case data sets
- Performance test data sets

**Comparison Tools:**
- Numerical comparison with tolerance
- Visual diff tools
- Output validation against TradingView
- Regression detection

#### 3. Testing Categories

**Language Tests:**
- Parser correctness
- Compiler validation
- Type system behavior
- Execution semantics

**Analysis Tests:**
- TA function accuracy
- Mathematical precision
- Statistical correctness
- Performance benchmarks

**Rendering Tests:**
- Visual fidelity comparison
- Performance measurement
- Memory usage validation
- Cross-platform consistency

**Strategy Tests:**
- Backtesting correctness
- Order management validation
- Performance metric calculation
- Report generation accuracy

**Plugin Tests:**
- Interface compliance
- Integration testing
- Performance impact
- Security validation

### Performance Considerations

#### 1. Optimization Strategies

**Data Processing:**
- Vectorized operations for time series
- SIMD optimizations for mathematical functions
- Parallel processing for independent calculations
- Memory locality optimization

**Rendering:**
- Batched draw calls
- GPU acceleration for visual elements
- Level-of-detail rendering
- Incremental updates

**Execution:**
- JIT compilation for hot code paths
- Caching of intermediate results
- Lazy evaluation where applicable
- Memory pooling for frequent allocations

#### 2. Scalability Design

**Horizontal Scaling:**
- Script execution isolation
- Independent data processing pipelines
- Distributed caching
- Load balancing for multiple scripts

**Vertical Scaling:**
- Multi-threading for CPU-bound operations
- Memory optimization for large datasets
- GPU utilization for rendering
- Efficient I/O operations

**Resource Management:**
- Memory limits per script
- CPU time limits
- I/O bandwidth management
- Connection pooling for data sources

#### 3. Monitoring and Profiling

**Performance Metrics:**
- Execution time per bar
- Memory usage over time
- Cache hit rates
- Rendering frame rates

**Profiling Tools:**
- Execution trace collection
- Memory allocation tracking
- I/O operation monitoring
- Plugin performance impact measurement

**Optimization Feedback:**
- Hot spot identification
- Bottleneck detection
- Resource utilization analysis
- Optimization suggestions

### Security Considerations

#### 1. Plugin Security
- Sandboxed plugin execution
- Resource access controls
- Input validation for plugin functions
- Version verification and integrity checking

#### 2. Data Security
- Secure data transmission for external sources
- Input validation for user data
- Protection against injection attacks
- Secure storage for sensitive data

#### 3. Execution Security
- Script resource limits
- Protection against infinite loops
- Memory bounds checking
- Safe mathematical operations

### Frontend Architecture

#### 1. Frontend Component Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Application                      │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │  Web App     │ │ Code Editor  │ │  Canvas Chart        │ │
│  │  (React)     │ │ (Textarea→   │ │ (Custom HTML5 Canvas │ │
│  │              │ │  Monaco)     │ │  Charting Library)   │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │Error Console │ │State Manager │ │ WebSocket    │        │
│  │              │ │ (React Hooks)│ │ Client       │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

#### 2. Frontend Data Flow
```
User Input (Code) → Code Editor → POST /api/execute → Backend (Pine Engine)
                                    ↓
                              Visual Output → PineChart.setData() → Canvas Render Loop → Display
                                    ↓
                              Error Handler → Error Console
```

#### 3. Frontend-Backend Communication
- **REST API**: Script compilation/execution (`POST /api/execute`), historical data (`GET /api/ohlcv`), symbol list (`GET /api/symbols`)
- **WebSocket**: Realtime kline streaming, subscription management
- **Workspace Import**: Frontend imports `pine-framework` for type definitions and shared interfaces

#### 4. Frontend Features
- **Code Editor**: Textarea (MVP) → Monaco Editor with Pine Script syntax highlighting, auto-completion, error markers
- **Chart**: Custom Canvas Charting Library (section 8a) with candlestick rendering, volume, indicator overlays, shapes, fills, strategy markers, crosshair, zoom/pan
- **Error Console**: Real-time error display with source mapping
- **State Management**: React useState/useRef hooks
- **Responsive Design**: Mobile and desktop support

### Monorepo Architecture

#### 1. Package Structure
```
pine-framework/
├── pnpm-workspace.yaml         # Declares workspace packages
├── package.json                 # Root scripts (dev, build, test, lint)
├── pnpm-lock.yaml              # Single lockfile for all packages
├── tsconfig.json               # Base TypeScript config
│
├── src/                         # pine-framework engine library
│   ├── package.json             # Name: "pine-framework"
│   └── ...                      # Engine source code
│
├── frontend/                    # React frontend application
│   ├── package.json             # Name: "pine-framework-frontend"
│   ├── vite.config.ts
│   └── src/
│
└── backend/                     # Express backend server
    ├── package.json             # Name: "pine-framework-backend"
    └── src/
```

#### 2. Workspace Configuration
```yaml
# pnpm-workspace.yaml
packages:
  - "src"        # engine library
  - "frontend"   # React app
  - "backend"    # Express server
```

#### 3. Dependency Graph
```
pine-framework (engine)
    ↑ workspace:*
    ├── frontend ── uses engine types + API
    └── backend  ── uses engine for script execution + Bybit adapter
```

#### 4. Root Scripts
```json
{
  "scripts": {
    "dev": "concurrently \"pnpm --filter backend dev\" \"pnpm --filter frontend dev\"",
    "build": "pnpm --filter pine-framework build && pnpm --filter pine-framework-backend build && pnpm --filter pine-framework-frontend build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck"
  }
}
```

### Deployment and Operations

#### 1. Deployment Architecture

**Monorepo Development:**
- Single `pnpm install` at root installs all packages
- `pnpm dev` starts backend (port 8080) and frontend (port 3000) concurrently
- Frontend Vite proxy forwards `/api` and `/ws` to backend
- Engine library consumed via workspace protocol

**Production Deployment:**
- `pnpm build` builds all packages in dependency order
- Backend serves API endpoints on port 8080
- Frontend static files served by backend or CDN
- Docker container with Node.js runtime

**Server Deployment:**
- REST API for script execution
- WebSocket for realtime updates
- Load balancing and scaling
- High availability configuration

**Embedded Library:**
- C/C++ API for integration
- Language bindings (Python, JavaScript, etc.)
- Customizable components
- Reduced dependency footprint

#### 2. Configuration Management

**Application Configuration:**
- Performance tuning parameters
- Plugin directory locations
- Data source configurations
- Logging and monitoring settings

**Script Configuration:**
- Input parameter defaults
- Execution preferences
- Rendering options
- Alert configurations

#### 3. Monitoring and Maintenance

**Health Monitoring:**
- System resource usage
- Script execution status
- Data feed connectivity
- Plugin health checks

**Logging and Diagnostics:**
- Structured logging
- Performance metrics collection
- Error reporting and aggregation
- Audit trails for security

**Maintenance Operations:**
- Plugin updates
- Data cache management
- Performance optimization
- Backup and recovery procedures

### Backtest Engine Architecture

#### 1. Overview
The Backtest Engine extends the existing Strategy Engine to provide a complete historical simulation environment. It consumes Pine Script strategies, executes them over historical OHLCV data, simulates order lifecycle and broker conditions, and produces comprehensive performance analytics. It is designed as a layered system sitting above the existing execution runtime, data service, and broker simulator.

#### 2. Backtest System Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway + Job Queue                   │
│  - Accepts backtest jobs via REST                            │
│  - Manages job lifecycle (queued→running→completed→retrieved)│
│  - Supports concurrent backtests                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    Backtest Orchestrator                      │
│  - Receives job (script + config + date range)               │
│  - Fetches data from Data Service                            │
│  - Invokes Pine Runtime for strategy signal generation       │
│  - Runs Simulation Engine for order lifecycle                │
│  - Calculates performance metrics                            │
│  - Persists results (BacktestResult)                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
     ┌─────────────────┼─────────────────────┐
     ▼                 ▼                     ▼
┌──────────┐   ┌────────────────┐   ┌──────────────────┐
│ Data     │   │ Pine Runtime   │   │ Broker Simulator  │
│ Service  │   │ (Execution     │   │ (Order Manager,   │
│ (existing)│   │  Engine)      │   │  Fill Engine,     │
│          │   │                │   │  Margin Tracker)  │
└──────────┘   └────────────────┘   └──────────────────┘
                                            │
                                    ┌───────┴───────┐
                                    ▼               ▼
                            ┌────────────┐  ┌──────────────┐
                            │ Metrics    │  │ Report       │
                            │ Calculator │  │ Generator    │
                            └────────────┘  └──────────────┘
```

#### 3. Backtest Orchestrator
- **Responsibility**: Coordinate the full backtest lifecycle from job submission to result delivery
- **Key Features**:
  - Receives backtest job specification (script, symbol, timeframe, date range, config)
  - Fetches historical OHLCV data from the Data Service for the requested range
  - Invokes the Pine Runtime (existing Execution Engine) to compile and execute the strategy, capturing OrderRequest events
  - Pipes OrderRequest events into the Broker Simulator for order lifecycle management
  - After simulation, invokes the Metrics Calculator to compute performance statistics
  - Stores the completed BacktestResult for retrieval via REST API
  - Reports progress updates during long-running backtests

#### 4. Broker Simulator
- **Responsibility**: Simulate realistic broker conditions including order management, fills, margin, and fees

**4.1 Order Manager:**
- Maintains active order book: pending, working, and filled orders
- Processes OrderRequest events from the strategy engine
- Validates orders against account state (margin, pyramiding limits, position sizing rules)
- Tracks order lifecycle: pending → accepted → filled/cancelled/expired

**4.2 Fill Engine:**
- On each bar (or tick for intrabar mode), evaluates all active orders for fill conditions
- **Market orders**: Filled at next bar open + slippage (or immediately on intrabar tick)
- **Limit orders**: Filled when price crosses the limit level (for longs: low <= limit; for shorts: high >= limit)
- **Stop orders**: Filled when price breaches stop level (for longs: high >= stop; for shorts: low <= stop); converted to market order after trigger
- **Stop-limit orders**: Triggered like stop orders, then placed as limit orders
- Applies slippage adjustment to fill prices based on order type and configured slippage parameters
- Records fill price, fill time, and commission for each fill

**4.3 Margin Tracker:**
- Tracks initial and maintenance margin requirements
- On each bar, checks if equity falls below maintenance margin threshold
- If margin call triggered, liquidates positions at current market price
- Updates Account state: balance, equity, margin_used, free_margin

**4.4 Position Manager:**
- Maintains current positions (symbol, direction, quantity, avg_entry_price)
- Handles position opening, increasing, reducing, and closing
- Supports pyramiding: configurable maximum entries in same direction (0 = single entry, N = up to N entries)
- Handles position reversal: opposite-direction entry closes existing position first, then opens new position

**4.5 Commission & Slippage:**
- Commission types: percent of trade value, cash per contract, cash per order
- Slippage modes: fixed ticks, fixed points, percentage of price
- Configurable via strategy() declaration parameters

#### 5. Bar Processing Loop
```
for each bar in historical range (chronological):
    if multi-timeframe needed, align requested TF data via Request System
    execute Pine strategy on current bar (existing Execution Engine)
    after script execution, process pending OrderRequest events:
        for each OrderRequest:
            validate against account state (margin, pyramiding)
            if valid, register as PendingOrder in Order Manager
    advance simulated clock to bar close time
    check fill conditions for all active orders via Fill Engine
    apply fills, update positions, P&L, margin, equity
    record EquityPoint { time, equity, drawdown }
    expire orders past their validity (GTC, day orders)
    update progress percentage
```

#### 6. Intrabar Magnification (Bar Magnifier)
- When enabled, retrieve a lower-resolution data series (e.g., 1-minute bars for daily charts)
- Instead of using bar OHLC for fill decisions, iterate through lower-resolution sub-bars
- On each sub-bar, re-evaluate order fill conditions using the sub-bar's price range
- Entry/exit prices reflect the exact sub-bar price where fill conditions are met
- Produces more realistic fill prices than open-close bar granularity

#### 7. Performance Metrics Computation

**Trade Metrics** (per trade):
- Entry/exit time, price, size, direction
- P&L (gross and net of commission)
- Percent return
- Bars held (duration in bars)
- MAE (Maximum Adverse Excursion)
- MFE (Maximum Favorable Excursion)

**Portfolio Metrics:**
- Total Net Profit, Gross Profit, Gross Loss
- Profit Factor = Gross Profit / Gross Loss
- Percent Profitable (Win Rate) = Winning Trades / Total Trades × 100
- Average Trade = Net Profit / Number of Trades
- Average Winning Trade, Average Losing Trade
- Sharpe Ratio = (Mean(R) - Rf) / StdDev(R) — annualized, using daily equity returns
- Sortino Ratio = (Mean(R) - Rf) / DownsideDev(R) — only downside deviation
- Max Drawdown (absolute value and percentage)
- Max Drawdown Duration (longest period from peak to recovery)
- Average Bars in Trade
- Return on Initial Capital = Net Profit / Initial Capital × 100
- Buy & Hold Return (for comparison with strategy return)

**Calculation method:**
1. Collect all closed Trades from the simulation
2. Build equity curve from EquityPoint records
3. Compute daily returns from equity curve (EQ[t] / EQ[t-1] - 1)
4. Apply metric formulas to daily returns and trade list

#### 8. Data Models
```
Bar:             { time, open, high, low, close, volume }
OrderRequest:    { id, strategy_id, direction, qty, limit_price, stop_price, order_type, oca_group }
Order:           { id, request_id, status (pending|accepted|filled|cancelled|expired), fill_price, fill_time, commission, slippage }
Position:        { symbol, direction, quantity, avg_entry_price, current_price, unrealized_pnl }
Trade:           { entry_order_id, exit_order_id, direction, qty, entry_time, exit_time, entry_price, exit_price, gross_pnl, commission, net_pnl, return_pct, bars_held, mae, mfe }
Account:         { initial_capital, balance, equity, margin_used, free_margin, currency }
EquityPoint:     { time, equity, balance, drawdown_pct, drawdown_value }
BacktestResult:  { config, metrics, trades[], equity_curve[], orders[] }
```

#### 9. REST API Specification

**Submit Backtest:**
```
POST /api/backtest
Request: {
  "script": "//@version=6\nstrategy('My Strategy')\n...",
  "symbol": "BTCUSDT",
  "timeframe": "1D",
  "start_date": "2020-01-01",
  "end_date": "2023-01-01",
  "initial_capital": 10000,
  "commission_type": "percent",
  "commission_value": 0.1,
  "slippage": 1,
  "pyramiding": 0,
  "bar_magnifier": true,
  "inputs": { "fast_len": 12, "slow_len": 26 }
}
Response: { "job_id": "uuid" }
```

**Get Backtest Status:**
```
GET /api/backtest/{job_id}
Response: { "status": "queued|running|completed|failed", "progress": 85, "result_url": "/api/backtest/{job_id}/result" }
```

**Retrieve Result:**
```
GET /api/backtest/{job_id}/result
Response: {
  "metrics": { "net_profit": ..., "profit_factor": ..., "sharpe_ratio": ..., "max_drawdown_pct": ..., ... },
  "equity_curve": [{"time": "2020-01-01", "equity": 10000, "drawdown_pct": 0}, ...],
  "trades": [{ "entry_time": ..., "exit_time": ..., "pnl": ..., ... }],
  "orders": [{ "id": ..., "status": ..., "fill_price": ..., ... }]
}
```

#### 10. Broker Emulator Properties
- `commission_type`: "percent" | "cash_per_contract" | "cash_per_order"
- `commission_value`: number (percentage or absolute amount)
- `slippage`: number in ticks/points/percent (configurable mode)
- `initial_margin`: percentage (e.g., 50 for 2x leverage)
- `maintenance_margin`: percentage (e.g., 25)
- `default_qty_type`: "contracts" | "percent_of_equity" | "cash"
- `default_qty_value`: number
- `pyramiding`: 0 (no pyramiding), N (max N entries in same direction)
- `currency`: "USD" | "BTC" | etc.

#### 11. Testing Strategy
- Unit tests for fill logic (market, limit, stop, stop-limit)
- Unit tests for margin calculations and liquidation
- Unit tests for commission and slippage calculations
- Unit tests for each performance metric formula
- Integration tests: run standard Pine strategies (SMA crossover, etc.) and compare metrics to TradingView output within 0.1% tolerance
- Regression tests: curated library of scripts with known expected results
- Performance tests: backtest on 1M bars must complete within 10 seconds

#### 12. Deployment Considerations
- Pine runtime isolated in sandbox (WebAssembly or restricted process)
- Backtest workers scaled horizontally; message queue (RabbitMQ/Redis) for job distribution
- Results stored in time-series or document database (MongoDB/InfluxDB)
- Chart rendering via lightweight-charts or existing Canvas Charting Library

### Future Extensibility

#### 1. Language Evolution
- Pine Script version compatibility
- New language feature integration
- Backward compatibility maintenance
- Migration tooling

#### 2. Analysis Capabilities
- Additional technical indicators
- Machine learning integration
- Alternative data sources
- Custom analysis functions

#### 3. Visualization Features
- New plot types
- Advanced styling options
- Interactive features
- Export capabilities

#### 4. Platform Integration
- Additional deployment targets
- Cloud service integration
- Mobile platform support
- Desktop application enhancements

## Conclusion

This design provides a comprehensive architecture for building a production-grade Pine Script v6 Engine that maintains compatibility with TradingView while offering extensibility, performance, and scalability. The modular design allows for independent development of components, and the plugin architecture ensures the system can evolve with new features without modifying core code.

The system prioritizes:
1. **Correctness**: TradingView-compatible semantics and numerical precision
2. **Performance**: Efficient handling of large datasets and concurrent indicators
3. **Extensibility**: Plugin-based architecture for future growth
4. **Reliability**: Robust error handling and recovery mechanisms
5. **Usability**: Clear interfaces and comprehensive testing

This design serves as the foundation for implementation, with each component having well-defined responsibilities and interfaces to ensure maintainable, testable, and scalable development.