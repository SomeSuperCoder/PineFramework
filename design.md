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
│    ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────────┐             │
│    │ API Srv  │→│WS Gateway│→│ Bybit Adapter│→│ Data Cache   │             │
│    └──────────┘ └──────────┘ └──────────────┘ └──────────────┘             │
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
  - Handles all Pine Script v6 language constructs
  - Version detection (`//@version=6`)
  - Syntax error reporting with line/column information
  - Supports all Pine script types: indicator, strategy, library

#### 2. Compiler Component
- **Responsibility**: Validate AST and produce executable representation
- **Input**: AST from Parser
- **Output**: Compiled script with type-checked IR (Intermediate Representation)
- **Key Features**:
  - Type checking and validation
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
  - `na` (not available) value handling
  - Type inference

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
  - Returns shapes (plotshape markers), fills (area between plots), and strategyMarkers as part of execution result
  - Supports named arguments forwarding to built-in functions
  - Auto-detects plot titles from variable names when no explicit title is provided
  - Maintains var/varip variable state across bars without resetting on re-declaration
  - Supports inclusive for-loop iteration (`for i = 0 to end` includes the `end` value)
  - Forwards named arguments (comment, stop, limit) to strategy.entry() and strategy.exit() builtins
  - Parses variable-length argument lists for strategy builtins to extract positional and named parameters
  - Incremental real-time bar execution via `executeRealtimeBar()` which processes a single new bar while preserving prior state
  - State snapshot management for rollback: `createSnapshot()` saves engine state before real-time updates, `rollbackToSnapshot()` restores on error
  - The engine instance is kept alive across real-time updates so that var/varip, series indices, and strategy positions persist between bars

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
  - Indicators: `bb`, `atr`, `adx`, etc.
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
  - Support for all plot.style_* enums
  - Support for size enums (tiny, small, normal, large, huge, auto)
  - Support for location enums (abovebar, belowbar, top, bottom, absolute)
  - Support for all Pine plot parameters
  - Auto-detection of plot titles from variable names
  - Named arguments support for all plot functions
  - Null value filtering before rendering
  - Color, shape, and location namespace syntax support

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
  ├── Viewport (visible range, zoom, pan state)
  ├── LayoutManager (chart area, volume area, price scale, time scale regions)
  ├── Renderers
  │   ├── CandlestickRenderer (OHLCV bodies + wicks)
  │   ├── VolumeRenderer (volume histogram bars)
  │   ├── LineRenderer (line, stepline, dotted, dashed styles)
  │   ├── AreaRenderer (fill between plots)
  │   ├── MarkerRenderer (shape markers: arrows, circles, squares, diamonds)
  │   ├── CharRenderer (text characters on bars)
  │   ├── ArrowRenderer (directional arrows for plotarrow)
  │   ├── HLineRenderer (horizontal lines)
  │   ├── BarColorRenderer (bar color overrides)
  │   ├── BackgroundRenderer (background color fills)
  │   ├── DrawingLineRenderer (drawing lines)
  │   ├── BoxRenderer (drawing boxes/rectangles)
  │   ├── LabelRenderer (drawing labels with text)
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
  - ResizeObserver for responsive container handling
  - Event system: onCrosshairMove, onVisibleRangeChange, onResize, onPriceRangeChange
- **API**:
  - `createChart(container, options)` → chart instance
  - `chart.setCandles(data)`, `chart.setVolume(data)`
  - `chart.addPlotSeries(name, options)` → series handle
  - `chart.setMarkers(markers)`, `chart.setFills(fills)`, `chart.setLines(lines)`, `chart.setHLines(hlines)`
  - `chart.removeSeries(name)`
  - `chart.timeScale()` → { fitContent(), scrollTo(), scrollToDate() }
  - `chart.applyOptions(options)`, `chart.remove()`
  - Events: onCrosshairMove, onVisibleRangeChange, onResize, onPriceRangeChange
- **Rendering Layers** (back to front):
  1. Background (bgcolor)
  2. Grid lines
  3. Volume bars
  4. Fill areas (polygons between plots)
  5. Candlesticks
  6. Bar color overrides (barcolor)
  7. Horizontal lines (hline)
  8. Line plots (line, stepline, circles, cross, histogram, columns)
  9. Area plots (area, areabr)
  10. Drawing lines (line.new objects)
  11. Boxes (box.new objects)
  12. Polylines (polyline.new objects)
  13. Linefills (linefill.new objects)
  14. Shape markers (plotshape)
  15. Character markers (plotchar)
  16. Directional arrows (plotarrow)
  17. Drawing labels (label.new objects)
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
  - Multiple output destinations (email, webhook, popup, etc.)
  - Alert logging and auditing
  - Display alertcondition() in indicator settings UI
  - Alert markers rendered on chart at trigger bar

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

#### 17. Backend API Server
- **Responsibility**: Bridge frontend and engine, serve market data, manage connections
- **Key Components**:
  - **REST API Server**: Express/Fastify HTTP server on port 8080
  - **WebSocket Gateway**: ws-based realtime data streaming
  - **Script Executor**: Invokes `pine-framework` engine for compilation and execution
  - **Session Manager**: Persists execution engine instances per WebSocket client for incremental real-time bar updates
  - **Data Cache**: In-memory LRU cache for recent OHLCV data
- **API Endpoints**:
  - `GET /api/ohlcv?symbol=BTCUSDT&interval=1m&limit=1000` - Historical kline data
  - `POST /api/execute` - Compile and execute Pine Script code (returns outputs, shapes, fills, strategyMarkers)
  - `GET /api/symbols` - List available trading symbols
  - `GET /api/status` - Server and connection status
- **WebSocket Protocol**:
  - Client sends: `{ type: "subscribe", topic: "kline.1m.BTCUSDT" }`
  - Client sends: `{ type: "unsubscribe", topic: "kline.1m.BTCUSDT" }`
  - Server sends: `{ type: "kline", data: { symbol, interval, open, high, low, close, volume, timestamp } }`
  - Client sends: `{ type: "execute", data: { source: "…" } }` — register a Pine Script for persistent execution
  - Server sends: `{ type: "connected", data: { connectionId } }`
  - Server sends: `{ type: "error", data: { message, code } }`
  - Server sends: `{ type: "execution_result", data: { outputs, shapes, fills, strategyMarkers, barIndex } }` — updated script results after each new kline
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
  - On receiving a `kline` WebSocket message from Bybit, appends/updates the bar in the session's bar set and calls `executeRealtimeBar()` on the persisted engine
  - Pushes updated execution results to the frontend as `execution_result` WebSocket messages containing the full outputs, shapes, fills, and strategyMarkers

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
│    - SQLite for metadata                                    │
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