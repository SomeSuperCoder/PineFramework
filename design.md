# Design Document: Pine Script v5/v6 Engine

## Overview

The Pine Script v5/v6 Engine is a production-grade alternative runtime that dynamically detects the declared Pine Script version (`//@version=5` or `//@version=6`), parses, executes, and renders programs with TradingView-like semantics. This design document outlines the architecture, components, data flow, and implementation strategies for building a complete Pine Script v5 and v6 compatible system.

### Research Findings

Key insights from Pine Script v6 and TradingView architecture research:

1. **Pine Script v5 Language Features**: Mature version with well-established syntax, type system, and built-in functions; widely used by existing TradingView scripts
2. **Pine Script v6 Language Features**: Latest version includes enums, dynamic data requests, runtime logging, tighter type system, and syntax refinements over v5
3. **Version Detection**: The `//@version=N` directive at the top of a script declares the version; the engine must parse this before selecting grammar rules
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
│                     Pine Script v5/v6 Engine                                 │
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
│  │ (v5/v6 eng)│  │             │  │             │                         │
│  └─────────────┘  └─────────────┘  └─────────────┘                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Specifications

#### 1. Parser Component
- **Responsibility**: Convert Pine Script v5 or v6 source code to tokens and parse tree
- **Input**: Pine Script v5 or v6 source code string
- **Output**: Abstract Syntax Tree (AST)
- **Key Features**:
  - Dynamic version detection from `//@version=N` directive (supports N=5 and N=6)
  - Automatically selects v5 or v6 grammar based on detected version
  - Handles all Pine Script v5 language constructs (original syntax, `plot()` conventions, type system)
  - Handles all Pine Script v6 language constructs including switch expressions, arrow syntax (=>), and type-inferred array.new_<type>() declarations
  - Version detection (`//@version=5` or `//@version=6`)
  - Syntax error reporting with line/column information
  - Supports all Pine script types: indicator, strategy, library
  - Indentation-aware else-binding: `parseIfStatement(baseColumn?)` ensures `else` clauses bind to the `if` at the same indentation level. For standalone `if`, `baseColumn` = the `if` keyword's column. For `else if`, `baseColumn` = the `else` keyword's column (passed recursively). An `else` is only consumed when `elseToken.span.start.column >= baseColumn`
  - Supports `const` keyword for constant variable declarations (v6)
  - Maintains separate grammar rule sets for v5 and v6 to handle syntax differences (e.g., v5's `plot()` parameter ordering vs v6's variadic arguments)

#### 2. Compiler Component
- **Responsibility**: Validate AST and produce executable representation
- **Input**: AST from Parser (v5 or v6)
- **Output**: Compiled script with type-checked IR (Intermediate Representation)
- **Key Features**:
  - Type checking and validation including switch expression branch type unification and array.new_<type>() type inference (v6)
  - Version-aware type checking: applies v5 looser coercion rules or v6 stricter rules based on detected version
  - Scope resolution
  - Variable declaration validation
  - Constant folding optimization
  - Produces optimized bytecode or IR

#### 3. Type System
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
  - Type inference for array.new_<type>() returning array<elementType> (v6)
  - Generic array operations: size, first, last, shift, pop, push, unshift, insert, remove, contains, fill, set, get, sort, copy
  - Method dispatch on numeric IDs for line and label objects enabling chained operations
  - Version-aware coercion: v5 allows implicit int→float and float→int in some contexts; v6 enforces stricter type boundaries

#### 4. Execution Engine
- **Responsibility**: Execute compiled Pine scripts bar-by-bar (v5 and v6)
- **Execution Model**:
  - Historical mode: process bars sequentially
  - Realtime mode: update calculations on new bar data
  - Rollback capability for realtime execution
- **Key Features**:
  - Version-aware execution: dispatches built-in functions to v5 or v6 implementations based on detected version
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
  - Incremental real-time bar execution via `executeRealtimeBar()` which processes a single new bar while preserving prior state; primarily used for the initial `totalBars === 0` edge case
  - State snapshot management for rollback: `createSnapshot()` saves engine state before real-time updates, `rollbackToSnapshot()` restores on error
  - The engine instance is kept alive across real-time updates so that var/varip, series indices, and strategy positions persist between bars
  - Executes switch expressions with full conditional branching and local block scoping
  - Switch-as-expression returns matched case body result: `executeSwitchStatement()` tracks `lastResult` through the matched case/default body loop and returns it, enabling arrow-syntax switch (`"EMA" => expr`) to return computed values instead of NA
  - Supports syminfo namespace as built-in read-only variables (tickerid, mintick, pointvalue, pricescale, currency)
  - Implements strict comparisons matching Pine Script: ta.crossover uses <= on prev bar, ta.crossunder uses >=, ta.pivothigh uses strict >, ta.pivotlow uses strict <
  - Generic array method execution: size, push, pop, shift, unshift, insert, remove, contains, fill, set, get, sort, copy
  - Method dispatch system for line.* and label.* calls on numeric object IDs returned by line.new() and label.new()
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
  - `ta.hma(source, length)`: Hull Moving Average implemented via WMA-based algorithm with per-call-site buffer isolation (`hmaBuffers` map keyed by `hma_${len}_${hmaCallIndex}`). Maintains `half` (half-length WMA), `full` (full-length WMA), and `diff` (sqrt-length WMA of 2*half - full) buffers. Returns NA until sufficient data is accumulated. `hmaCallIndex` reset each bar.
  - `plotchar(series, title, char, location, color, ...)`: Character marker builtin that produces `ShapeEntry` objects with unicode char, location handling (abovebar/belowbar/absolute), and color. Supports unicode characters (▲, ▼, ◆, etc.).
  - `plotcandle(open, high, low, close, color, ...)`: Candle color override builtin that stores body color into `barColorData` array for candle body rendering.
  - `display` namespace: `display.data_window`, `display.pane`, `display.none` resolved as builtin constants via `executeMemberExpression()`. When `display` is `none` or `0`, the plot is suppressed.
  - `plot()` variadic arguments: accepts `(...allArgs)` with positional args separated from trailing namedArgs object. Reads color from `positionalArgs[2]`, linewidth from `[3]`, style from `[4]`, display from `[11]`. Named args override positional when both present. Pushes `positionalArgs[0]` (the series) to output, not the `value` parameter.
  - `fill()` variadic arguments: accepts `(...allArgs)` with positional args separated from trailing namedArgs. Reads `top_color` from `positionalArgs[4]` and `bottom_color` from `positionalArgs[5]`. Stores one color per bar in `fillColorData` for per-bar segment rendering.
  - `ta.change(source)`: Returns the difference between current and previous source values (source - source[1]). Per-call-site state tracking via `changeCallIndex` and `changePrevValues` arrays. Returns NA on first call. State reset each bar.
  - `box.new(left, top, right, bottom, border_color, bgcolor)`: Creates box drawing objects stored in `boxes` Map. Returns numeric ID. BoxEntry includes left, top, right, bottom coordinates and border/background colors.
  - Comparison operators (>, <, >=, <=): Compiler infers `BOOL_TYPE` instead of `FLOAT_TYPE` for comparison expressions, matching Pine Script semantics where comparisons produce boolean results.
  - `strategy.entry()` namedArgs qty: Extracts `qty` from named arguments when not provided as a positional argument, supporting `strategy.entry("Long", "long", qty=0.1)` syntax.

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
  - ta.atr(length) with per-key state tracking, true range calculation, and warmup period (returns NA until sufficient bars accumulated)
  - ta.hma(source, length) using WMA-based Hull Moving Average with per-call-site buffer isolation (half, full, diff buffers), returning NA until sufficient data

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
  - strategy.exit() allows creation when position is flat but pending market entry exists (entry+exit on same bar support)

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
  - color.from_gradient(value, minVal, maxVal, bottomColor, topColor) for linear RGB interpolation between two colors

#### 15. Script Declaration System
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

#### 16. Frontend Web Application
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
  - Settings panel: initially shown before results, containing fields: initial capital, commission (value + type), slippage (value + type), default quantity (value + type), pyramiding, margin (long/short), date range (days back input with toggle to begin/end date picker)
  - Settings are read-only until the first backtest has run; after the first run, settings become editable
  - Settings persist across sessions and page reloads (stored in localStorage or backend)
  - Auto-extracts default values from `strategy()` declaration in the script source
  - Backtest runs asynchronously via `/api/backtest` with progress polling

#### 17. Backend API Server
- **Responsibility**: Bridge frontend and engine, serve market data, manage connections (v5 and v6)
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
  - **Confirm field threading**: The `confirm` property from Bybit V5 kline WebSocket messages is parsed (`d.confirm === 'true'`) and threaded through the execution pipeline — forwarded to `ScriptSession.appendOrUpdateBar()` as the `confirmed` parameter, which controls whether the bar is treated as a confirmed close (`setFormingCandle(false)`) or a forming tick (`setFormingCandle(true)`)

#### 19. Telegram Bot Integration
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
  │
  └── reexecuteForTopic(topic, bar, confirmed)
        │
        │ prune stale (closed) WS connections
        │
        └── for EACH subscriber with an active ScriptSession:
              ├── ScriptSession.appendOrUpdateBar(bar, confirmed)
              │     │
              │     ├── if confirmed && timestamp <= lastConfirmedTimestamp
              │     │     → dedup: FormingCandleManager.tick(bar), isConfirmed=false → alerts SUPPRESSED
              │     │
              │     ├── if confirmed && timestamp > lastConfirmedTimestamp
              │     │     → FormingCandleManager.confirm(bar), isConfirmed=true → alerts GENERATED
              │     │     (dedup via recentAlertKeys Set before Telegram dispatch)
              │     │
              │     └── if !confirmed (forming tick)
              │           → FormingCandleManager.tick(bar), isConfirmed=false → alerts SUPPRESSED
              │
              ├── execution_result sent to WS client (plots, shapes, fills, etc.)
              │
              └── if isConfirmed && tgActive && hasTriggers
                    → check recentAlertKeys Set → if duplicate, suppress
                    → telegramService.sendAlertToSubscribers() for each trigger
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
- On new bar (period rollover):
  - Rollback to last confirmed state
  - Append new bar data and execute script for the new bar
  - Store series state and update visualizations
- On forming-candle tick (same bar, intra-bar update):
  - Update last bar's OHLCV values in-place
  - Execute script for only the last bar (no historical reprocessing)
  - Push updated indicator values for the forming candle to the frontend
  - Trigger alerts if conditions met
  - Repeat for each tick/kline update within the candle's lifetime
- Repeat for each realtime update
- **FormingCandleManager delegation**: `ScriptSession` delegates forming candle operations to `FormingCandleManager` for tick/confirm lifecycle management, barTimestamps padding, and output conversion

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
- Real-world indicator compatibility: parse, compile, and execute full complex indicators from `test_indicators/` directory (e.g., TrendCraft ICT SwiftEdge, volatility-trail) to validate production readiness
- Debug Pine script methodology: create debug versions of indicators that output intermediate values (hull, upperBand, lowerBand, trail, prevTrail, trend) for bar-by-bar tracing
- Indentation-aware else-binding validation: tests verify that inner `if` blocks do not steal `else` clauses from outer `if` statements at shallower indentation levels

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
├── package.json                 # Root package: "pine-framework" (engine library)
├── pnpm-lock.yaml              # Single lockfile for all packages
├── tsconfig.json               # Base TypeScript config
│
├── src/                         # Engine source code (part of root package)
│   └── ...
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
  - "frontend"   # React app
  - "backend"    # Express server
# Note: engine library is the root package, not a workspace member
```

#### 3. Dependency Graph
```
pine-framework (root package — engine library)
    ↑ workspace:*
    ├── frontend ── uses engine types + API
    └── backend  ── uses engine for script execution + Bybit adapter
```

#### 4. Root Scripts
```json
{
  "scripts": {
    "dev": "concurrently \"pnpm --filter pine-framework-backend dev\" \"pnpm --filter pine-framework-frontend dev\"",
    "build": "pnpm --filter pine-framework run build:lib && pnpm --filter pine-framework-backend run build && pnpm --filter pine-framework-frontend run build",
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js",
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

### Indicator Pane Architecture

#### 1. Overview
In TradingView, the `overlay` parameter in `indicator()` determines whether an indicator renders on the main price chart (`overlay=true`) or in a separate pane below (`overlay=false`, the default). Non-overlay indicators like MACD, RSI, and Stochastic have their own Y-axis scale and are displayed below the main chart.

#### 2. Data Flow
```
Script Declaration (indicator(..., overlay=false))
  → Parser: scriptArgs parsed
  → Compiler: overlay extracted into CompiledScript.overlay
  → Engine: overlay included in ExecutionResult.overlay
  → Backend: overlay included in API/WebSocket response
  → Frontend: plots separated into overlay[] vs indicator[] arrays
  → PineChart: non-overlay plots rendered in separate indicator pane with own price scale
```

#### 3. IR Changes
```
CompiledScript {
  ...existing fields...
  overlay: boolean  // NEW: extracted from indicator() declaration args
}
```

#### 4. Layout Changes (LayoutManager)
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

#### 5. PineChart Changes
- `updatePriceRange()` splits into `updateOverlayPriceRange()` and per-pane `updateIndicatorPriceRange(paneId)`
- Each non-overlay indicator's plots use its own pane's coordinate space for `priceToPixel()`
- LineRenderer, AreaRenderer, and HLineRenderer accept a target pane's Y coordinates
- Separate price scale rendering for each indicator pane via `AxisRenderer.renderIndicatorScale(paneIndex)`
- `recalculateLayout()` detects overlay count changes (new plot series added/removed) and triggers `resize()` to re-allocate pane space across all panes
- Canvas clipping via `ctx.save()`/`ctx.clip()`/`ctx.restore()` restricts candlestick and overlay plot rendering to the `chartArea` and volume rendering to the `volumeArea`, preventing visual bleed-through into indicator panes below
- **Indicator Pane Autoscale on Scroll**: When the viewport changes (scroll, pan, or zoom), each indicator pane recomputes its visible price range from the min/max of its indicator values within the current visible bar range. The autoscale fires after every `onVisibleRangeChange` event. For each indicator pane, the engine filters the output series to only bars within the visible range, computes `min`/`max`, and applies a small vertical padding margin (e.g., 5%). This replaces the previous static price range and forces a re-render of the pane's Y-axis and plot positions. Manual price range overrides are ignored for indicator panes — they always autoscale.

### Dynamic Indicator Management Architecture

#### 1. Overview
The Dynamic Indicator Management system allows users to add and remove multiple indicators from the chart without touching the script bank. Each running indicator is tracked with metadata (script ID, name, overlay flag, execution session) and displayed with labels in the appropriate location — overlay indicators in the top-left corner of the main chart, pane indicators in the top-left corner of their respective panes.

#### 2. Data Model
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
  addIndicator(scriptId, source, overlay) → RunningIndicator,
  removeIndicator(id) → void,
  removeAllByScriptId(scriptId) → void,  // cascade delete when script removed from bank
  getOverlayIndicators() → RunningIndicator[],
  getPaneIndicators() → RunningIndicator[],
  findIndicatorByScriptId(scriptId) → RunningIndicator | null
}
```

#### 3. Backend Changes
- **ScriptSession per Indicator**: Each running indicator gets its own `ScriptSession` with its own compiled engine instance, enabling independent real-time re-execution
- **Multi-Session WebSocket**: The backend maintains multiple active `ScriptSession` instances per WebSocket client (one per running indicator), each independently processing kline updates
- **Execution Response Enhancement**: Each `execution_result` message includes the indicator's `id`, `name`, and `overlay` flag so the frontend can route outputs to the correct pane
- **Remove Indicator API**: `DELETE /api/indicators/:id` stops the execution session for a specific indicator and cleans up its state
- **Persistence**: Running indicator list persisted to `backend/data/indicators.json` (same `JsonStore` infrastructure as scripts.json and telegram.json). On backend startup, rehydrate in-memory state from the file. On add/remove, write through to disk.
- **Auto-Remove Cascade**: When `DELETE /api/scripts/:id` is called, the backend iterates the running indicators list, stops execution sessions for any indicators referencing that scriptId, removes them from the persisted list, and notifies connected WebSocket clients via a `indicator_removed` message

#### 4. Frontend State Management
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

#### 5. Overlay Indicator Labels (Main Chart Top-Left)
- **Location**: Fixed position in the top-left corner of the main chart area, overlaid on top of candlesticks
- **Layout**: Vertical list of labels, each containing the indicator name and a small delete (×) button
- **Rendering**: Canvas-drawn semi-transparent background pills with text, positioned below the chart legend
- **Interaction**: Click delete button → calls `removeIndicator(id)` → clears plots/fills/shapes from chart, stops execution session
- **Visual Design**:
  ```
  ┌─────────────────────────┐
  │  SMA (20)          [×]  │  ← overlay indicator label
  │  EMA (50)          [×]  │  ← overlay indicator label
  │  Bollinger Bands   [×]  │  ← overlay indicator label
  └─────────────────────────┘
  ```

#### 6. Indicator Pane Labels (Per-Pane Top-Left)
- **Location**: Top-left corner of each indicator pane (below main chart)
- **Layout**: Single label per pane with indicator name and unplot button
- **Rendering**: Canvas-drawn within the pane's clipped region
- **Interaction**: Click unplot button → calls `removeIndicator(id)` → clears pane plots, removes pane if empty
- **Visual Design**:
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

#### 7. Multi-Indicator Rendering Pipeline (Simplified)
```
For each rendering cycle (triggered by scriptResult or indicatorResults change):
  1. Collect all plot titles from all results (main + indicators)
  2. Call addPlotSeries for each title — idempotent, returns existing handle if already present
  3. Remove any plot series whose title is not in the collected set (stale indicators)
  4. Repeat for fills and shapes
  5. On indicator remove: pane is cleared by the add-all-remove-stale loop; pane removal if empty is triggered by LayoutManager
```

No per-indicator key-tracking refs (`activeKeysRef`, `keyToTitlesRef`, `prevIndicatorResultsRef`) are used. The rendering is entirely driven by the merged set of current result titles in a flat pass. Indicator forming-candle updates use the `formingCandle` flag (same heuristic as the main script).

#### 8. Interaction with Existing Systems
- **Script Bank**: Running indicators reference scripts by `scriptId` — removing from chart does NOT affect the script bank entry
- **Code Editor**: The editor's "Run" button can add a new indicator to the chart or replace the currently running indicator (configurable)
- **Real-Time Updates**: Each running indicator independently receives kline updates via its own ScriptSession
- **Indicator Pane Autoscale**: Each indicator pane continues to autoscale independently based on its indicator's output values

### Progressive Indicator Computation Architecture

#### 1. Overview
The Progressive Indicator Computation system replaces the previous "compute everything upfront" model with a lazy/progressive architecture. Indicators are computed only for the currently visible viewport (plus lookback seed data) rather than the entire dataset. As the user scrolls, indicator values are computed in small batches, making the experience feel hyper-smooth and continuous — as if the values were always there.

#### 2. Key Concepts

- **Lookback Period**: Each indicator requires a certain number of seed candles before its first valid output (e.g., 20 for a 20-period EMA). The system determines the maximum lookback across all running indicators and pre-loads that many candles before the visible range.
- **Visible Viewport**: The set of candle indices currently visible in the chart canvas. Only this range plus lookback needs computation.
- **Progressive Batches**: When the user scrolls to reveal new candles, the system computes indicator values in small batches (e.g., 10–50 candles per batch) to avoid frame drops.
- **Interruptible Computation**: In-flight batch computation can be cancelled if the user scrolls to a different region; the new region takes priority.
- **Instant Catch-Up**: If progressive loading falls behind (user scrolls faster than computation), the missing range is computed immediately in a single high-priority pass.

#### 3. Pipeline

```
1. Initial Load:
   a. Determine max lookback L across all running indicators
   b. Load L + visibleRange candles from data source
   c. Compute indicator values for visibleRange using L seed bars
   d. Render computed values on chart

2. Scroll (backward or forward):
   a. Detect newly visible candles outside the computed range
   b. Enqueue a progressive computation batch for those candles
   c. Compute in small batches (10-50 candles) across animation frames
   d. Append/prepend results to the indicator data arrays
   e. Re-render chart with updated data

3. Priority Queue:
   - Immediate priority: forming candle tick updates
   - High priority: user-scrolled-to region (instant catch-up if needed)
   - Low priority: pre-compute regions near the viewport (prefetching)

4. Realtime Forming Candle:
   a. On each market tick or kline update: recompute indicator values for index 0 (forming candle) only
   b. Merge new values into the indicator data array
   c. Trigger chart re-render for the forming candle region

5. Indicator Add/Remove:
   a. On add: determine lookback, load seed data, compute visible range
   b. On remove: clear data, cancel any in-flight computation for that indicator
```

#### 4. Lookback Seed Data Management

For each indicator, the system tracks:
- **Required seed count**: The maximum period used by any built-in or custom function (e.g., `ta.sma(close, 20)` → seed count = 20)
- **Current seed buffer**: The pre-visible candle data loaded for this indicator
- **Is seeded**: Whether enough data has been loaded to produce a valid first output

When computing a batch, the system ensures the first computed bar has access to its seed bars. If the visible range shifts to include bars that are not yet seeded, the system loads additional historical data from the backend before computing.

#### 5. Interruptible Batch Queue

```
BatchQueue:
  - pending: Batch[] (ordered by position, oldest first)
  - inProgress: Batch | null
  - priority: 'immediate' | 'scroll' | 'prefetch'

  enqueue(range, priority):
    - Cancel any inProgress batch with lower priority
    - Dequeue pending batches that overlap with the new range
    - Add new batch to front of queue

  processNext():
    - If inProgress is not null, skip (wait for completion)
    - Dequeue highest-priority pending batch
    - Compute indicator values for batch range
    - Merge results into indicator data arrays
    - Trigger chart re-render
```

#### 6. Frontend Integration

- **ChartComponent** watches `onVisibleRangeChange` to detect viewport shifts
- On viewport change: compute which bars are new (outside current computed range), enqueue progressive computation
- **useChartData** stores per-indicator computed data arrays with metadata (computed range, seed state, isStale)
- **useIndicatorData** is a new hook managing the progressive computation lifecycle for all running indicators
- The rendering pipeline (add all, remove stale) remains unchanged — it consumes the computed arrays from useIndicatorData

#### 7. Backend Integration

- Backend exposes a `GET /api/bars?range={fromIndex,toIndex}&symbol={symbol}&timeframe={timeframe}` endpoint for fetching raw OHLCV bar data by index range
- Indicator computation can happen either on the backend (for complex indicators) or on the frontend (for simple indicators) — the architecture supports both via a computation worker abstraction
- Seed data is fetched once during indicator add and cached; subsequent scroll-based computations reuse the same data source

### Index-Based Renderer Positioning

#### 1. Overview
All chart renderers (LineRenderer, AreaRenderer) use direct index-based positioning instead of time-based `findBarIndex()` matching. Since plot data and candle data maintain a 1:1 index correspondence in the data pipeline, using the data index directly as the bar index eliminates O(n²) time-based scanning and prevents visual discontinuities during forming candle updates.

#### 2. Index-Based Rendering
- **LineRenderer**: For each plot data point at index `i`, uses `i` directly as the bar index for pixel positioning via `indexToPixel(i)`
- **AreaRenderer**: Same approach — fill polygon vertices use data index `i` directly as the bar index
- **No findBarIndex()**: The time-based `findBarIndex(candles, time)` helper is NOT used for plot rendering; it was removed to prevent O(n²) performance and visual discontinuities

#### 3. Why Index-Based Over Time-Based
- **1:1 correspondence guarantee**: Plot data and candle data are always the same length in the data pipeline; each plot data point at index `i` corresponds to the candle at the same index
- **No index drift**: The data pipeline ensures candle data and indicator data are aligned by construction — no time-matching needed
- **Forming candle support**: When forming candle data is appended to existing data arrays, the 1:1 correspondence is preserved by design
- **Performance**: Eliminates O(n²) time-based scanning per render cycle
- **Simplicity**: Direct index access is simpler and more predictable than time-based matching

### Forming Candle Lifecycle Management

#### 1. Overview
The `FormingCandleManager` module encapsulates the forming candle lifecycle management (tick processing, confirm processing, barTimestamps padding) to separate it from the main `ScriptSession` logic. This improves separation of concerns and makes the forming candle computation easier to test and maintain.

#### 2. Module Interface
```typescript
class FormingCandleManager {
  constructor(engine: ExecutionEngine, bars: Bar[], barTimestamps: number[])
  
  tick(bar: Bar): FormingCandleResult
  confirm(bar: Bar): FormingCandleResult
  toOutputs(result: ExecutionResult): ScriptOutputs
  toFormingCandleOutputs(result: ExecutionResult): ScriptOutputs
  getBarTimestamps(): number[]
}
```

#### 3. Responsibilities
- **tick()**: Process intra-bar updates (forming candle ticks)
- **confirm()**: Process bar close (confirmed bar)
- **toOutputs()**: Convert computation results to the output format for confirmed bars
- **toFormingCandleOutputs()**: Convert computation results to the output format for forming candle updates
- **barTimestamps padding**: Ensure barTimestamps includes uncommitted new bars for correct time alignment

#### 4. Integration with ScriptSession
The `ScriptSession` delegates forming candle operations to the `FormingCandleManager`:
```typescript
class ScriptSession {
  private formingCandleManager: FormingCandleManager
  
  tick(bar: Bar): ScriptOutputs {
    this.engine.setFormingCandle(true)
    const result = this.formingCandleManager.tick(bar)
    return this.formingCandleManager.toFormingCandleOutputs(result)
  }
  
  confirm(bar: Bar): ScriptOutputs {
    this.engine.setFormingCandle(false)
    const result = this.formingCandleManager.confirm(bar)
    return this.formingCandleManager.toOutputs(result)
  }
}
```

### Forming Candle Color Updates

#### 1. Overview
The forming candle computation must produce correct bgcolor, fillColorData, and plotColors diffs. Previously, these diffs were computed before restoring the pre-execution state, resulting in empty diffs because the restored state matched the snapshot. The fix moves the restoration to AFTER diff computation.

#### 2. Diff Computation Order
```
1. Execute script for forming candle
2. Compute bgcolor diff (newBgcolorData vs this.bgcolorData)
3. Compute fillColorData diff (newFillColorData vs this.fillColorData)
4. Compute plotColors diff (newPlotColors vs this.plotColors)
5. Restore pre-execution state (barTimestamps, outputSeriesLength)
6. Apply diffs to the forming candle result
```

#### 3. Why This Order Matters
- Before the fix: restoration happened at step 1, making all diffs perpetually empty (restored state matched snapshot)
- After the fix: restoration happens at step 5, so diffs capture actual changes during forming candle execution
- This ensures bgcolor, fill, and plot color changes are correctly reflected on the forming candle

### Chart Viewport Auto-Fit on Initial Load

#### 1. Overview
When the chart first loads, there is a race condition between WebSocket kline data and REST API historical data. WebSocket ticks can arrive before the REST response, causing the chart to render a single candle before the full dataset loads. This creates a brief flash of one large candle that quickly snaps to the full view.

#### 2. Race Condition Timeline
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

#### 3. Fix: Two-Part Solution

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

#### 4. Result
- Chart shows a blank/loading state briefly, then renders all historical candles at once
- No flash of a single large candle
- WebSocket updates begin only after historical data is loaded
- Viewport automatically fits to show all available data

### Dark Theme Architecture

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
- **CSS**: `frontend/src/index.css` — all CSS custom properties and class-based colors updated
- **Canvas renderers**: `AxisRenderer` background fill (`#0d0d18`), `CrosshairRenderer` tooltip/crosshair backgrounds (`rgba(15,15,35,0.95)` / `rgba(12,12,30,0.95)`)
- **React components**: Inline `style` objects in `BacktestPanel`, `BacktestResults`, `CodeEditor`, `ErrorConsole`, `StrategyResultsPopup`, `TelegramConfigPanel` updated to match

#### 3. Design Rationale
The darker background (`#0d0d18` vs `#1a1a2e`) increases contrast between candlestick bodies (green `#4caf50` / red `#e94560`) and the chart background, making price action easier to read during extended analysis sessions.

### Auto-Scale Toggle Architecture

#### 1. Overview
An auto-scale toggle in the footer bar allows users to switch between automatic price range computation (default) and manual price range control. When auto-scale is active, manual price range operations (drag, Shift+scroll) are blocked.

#### 2. Data Flow
```
App.tsx (autoScale state, default: true)
  → Footer bar toggle button
  → ChartComponent (forceAutoScale prop)
  → useEffect syncs to PineChart.setForceAutoScale()
  → LayoutManager.forceAutoScale flag
  → InteractionHandler checks flag before price range operations
```

#### 3. LayoutManager Integration
- `LayoutManager` gains a `forceAutoScale: boolean` flag (default `true`)
- `setManualPriceRange()` — no-op when `forceAutoScale` is true
- `zoomPrice()` — no-op when `forceAutoScale` is true
- `panPrice()` — no-op when `forceAutoScale` is true
- `setForceAutoScale(v: boolean)` — sets the flag
- `isForceAutoScale()` — returns current state

#### 4. PineChart Integration
- `PineChart.setForceAutoScale(v)` delegates to `layout.setForceAutoScale(v)`
- Called from `ChartComponent` via useEffect when `forceAutoScale` prop changes

#### 5. Footer Bar UI
- positioned between `<main>` and `<ErrorConsole>` in `App.tsx`
- CSS class: `.footer-bar` with dark theme styling
- Toggle button: `.auto-scale-toggle` with green background when active, dim when inactive

### Scroll Re-Execution with Boundary Recomputation

#### 1. Overview
When the user scrolls backward to load older candles, the frontend fetches them via `fetchOlderOHLCV` and re-executes the active script on the combined bar set. The key challenge is that indicator values at the boundary between old and new data may be incorrect without recomputation — the first `maxLookback` bars of the previous batch need to be recomputed with access to the newly loaded older context bars.

#### 2. execBars Construction
```typescript
// In fetchOlderOHLCV:
const contextBars = previousBars.slice(-maxLookback); // last N bars from previous batch
const execBars = [...newBars, ...contextBars];         // chronological: new first, context after
```
- `newBars`: the freshly fetched older bars (not yet in `ohlcvDataRef`)
- `contextBars`: the last `maxLookback` bars from the previous batch (for indicator warm-up)
- execBars are chronological — the engine processes them bar-by-bar in order
- Context bars are NOT added to `ohlcvDataRef.current` — they are execution-only

#### 3. prependIndicatorResult Boundary Recomputation
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

#### 4. Why Not Just Prepend
Simply prepending new indicator data to the old data would leave the boundary incorrect — the first few bars of the old batch were computed without access to the now-available older context bars. Boundary recomputation ensures the transition is seamless.

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

### Script Bank Architecture

#### 1. Overview
The Script Bank provides persistent storage and management for Pine Script programs. Users can create, update, delete, and select scripts from a centralized bank, with the active script selection persisted across restarts.

#### 2. Data Model
```
ScriptEntry: {
  id: string (UUID),
  name: string,
  source: string (Pine Script code),
  scriptType: "indicator" | "strategy" | "library",
  createdAt: number (timestamp),
  updatedAt: number (timestamp)
}

ScriptBankData: {
  scripts: ScriptEntry[],
  activeScriptId: string | null
}
```

#### 3. Storage
- Single JSON file at `backend/data/scripts.json`
- Same `JsonStore` infrastructure used for `telegram.json`
- Auto-creates directory and file with defaults on first launch
- Schema: `{ scripts: [], activeScriptId: null }`

#### 4. Backend API Endpoints
```
GET    /api/scripts                  → List all scripts
POST   /api/scripts                  → Create a new script { name, source }
GET    /api/scripts/:id              → Get a single script
PUT    /api/scripts/:id              → Update script { name?, source? }
DELETE /api/scripts/:id              → Delete a script (auto-removes running indicators referencing it)
PUT    /api/scripts/active           → Set active script { scriptId }
GET    /api/scripts/active           → Get active script (full entry + source)

GET    /api/indicators               → List running indicators on chart
POST   /api/indicators               → Add running indicator { scriptId, name, overlay }
DELETE /api/indicators/:id           → Remove running indicator from chart
```

#### 5. Frontend Components
- **CodeEditor (Unified)**: The sole interface for script management and editing
  - Dropdown at top listing all saved scripts by name
  - Textarea for editing Pine Script source code
  - "New Script" button creates a blank script with default template
  - "Delete" button removes the currently selected script
  - Auto-saves source changes on every edit (debounced) without re-executing the chart
  - "Add" button adds the current script as a new indicator to the chart (appends to running indicators, does NOT replace existing ones)
  - Script name auto-extracted from `strategy("Name", ...)` or `indicator("Name", ...)` in source
  - On open, loads the currently running script's source (not the last-edited script)
- **ScriptBankPanel**: REMOVED — superseded by the unified CodeEditor dropdown

#### 6. Integration with Existing Flow
- On app load, fetch active script from `GET /api/scripts/active`
- If active script exists, load its source into the code editor (but do NOT auto-execute)
- On app load, fetch running indicators from `GET /api/indicators` and re-execute each on the chart
- When user opens the editor, the currently running script is shown by default
- When user switches scripts via dropdown, source loads but chart does NOT re-execute
- When user edits source, changes auto-save to backend but chart does NOT re-execute
- When user clicks "Add", the source is added as a new indicator to the chart (appended, not replaced) and persisted to the running indicators list
- Script name is auto-extracted from the source via regex on `strategy()` or `indicator()` first argument
- The "currently running" script ID is stored separately from the "selected in editor" script ID
- When a script is deleted from the bank, all running indicators referencing it are automatically removed from the chart and the persisted indicator list

### AI Agent Integration and File-Based Storage Architecture

#### 1. Overview
The AI Agent Integration system enables external AI coding agents to create indicators and strategies by writing `.pine` files directly to a designated scripts directory. The system automatically detects these files and syncs them into the Script Bank database, making AI-generated scripts immediately available in the editor without manual import.

#### 2. Architecture Overview
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AI Agent Integration                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐    │
│  │  AI Coding Agent │────→│  Scripts Directory│────→│  File Watcher    │    │
│  │  (External)      │     │  (backend/data/   │     │  (chokidar)      │    │
│  │                  │     │   scripts/)       │     │                  │    │
│  └──────────────────┘     └──────────────────┘     └──────────────────┘    │
│                                                                             │
│         ┌─────────────────────────────────────────────────────────────┐     │
│         │                    Sync Engine                              │     │
│         │  - File → Database sync (on file change)                   │     │
│         │  - Database → File sync (on API change)                    │     │
│         │  - Conflict resolution                                     │     │
│         │  - Filename sanitization                                   │     │
│         └─────────────────────────────────────────────────────────────┘     │
│                                     │                                       │
│                                     ▼                                       │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐    │
│  │  Script Bank     │←────│  Scripts.json    │←────│  .pine Files     │    │
│  │  Database        │     │  Manifest        │     │  (Individual)    │    │
│  └──────────────────┘     └──────────────────┘     └──────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 3. File System Structure
```
backend/data/
├── scripts.json                    # Manifest: maps filenames to metadata
├── indicators/                     # Optional subdirectory for indicators
│   ├── sma_crossover.pine
│   └── rsi_divergence.pine
├── strategies/                     # Optional subdirectory for strategies
│   ├── mean_reversion.pine
│   └── momentum_breakout.pine
└── libraries/                      # Optional subdirectory for libraries
    └── math_utils.pine
```

#### 4. Data Model

**File-Based Script Entry:**
```typescript
interface FileScriptEntry {
  id: string;                    // UUID or hash-based ID
  filename: string;              // Sanitized filename (e.g., "sma_crossover.pine")
  name: string;                  // Human-readable name (e.g., "SMA Crossover")
  source: string;                // Complete Pine Script source code
  scriptType: "indicator" | "strategy" | "library";
  filePath: string;              // Relative path from backend/data/scripts/
  createdAt: number;             // Timestamp
  updatedAt: number;             // Timestamp
  checksum: string;              // MD5/SHA256 of source for change detection
}
```

**Scripts Directory Manifest:**
```typescript
interface ScriptsManifest {
  scripts: FileScriptEntry[];
  lastSyncAt: number;            // Last sync timestamp
  version: number;               // Manifest version for migration
}
```

#### 5. Sync Engine

**5.1 File → Database Sync:**
- File watcher detects `.pine` file creation/modification/deletion
- On creation:
   1. Read file content
   2. Validate Pine Script syntax (basic parse check)
   3. Auto-detect script type from `indicator()`, `strategy()`, or `library()` calls
   4. Extract script name from declaration
   5. Generate unique ID (SHA256 hash of filename + first 100 chars of source)
   6. Register in `scripts.json` manifest
   7. Register in Script Bank database via API
- On modification:
   1. Read updated content
   2. Validate syntax
   3. Update `updatedAt` timestamp
   4. Recompute checksum
   5. Update manifest and database
- On deletion:
   1. Remove from manifest
   2. Remove from Script Bank database
   3. Stop any running indicators using this script

**5.1a Full Sync (Startup / Manual):**
- The `FileSyncEngine.fullSync()` method runs on backend startup and on-demand via `POST /api/scripts/files/sync`
- Iterates every `.pine` file in the scripts directory (walking subdirectories recursively) and compares against the manifest
- For each file:
  - **New** (not in manifest): creates manifest entry + ScriptStore entry (same logic as file creation above)
  - **Changed** (mismatched checksum): updates manifest + ScriptStore with new content/timestamp
  - **Unchanged** (matching checksum): if the ScriptStore entry is missing (e.g., after restart), repopulates it — this is critical for database consistency after a full restart
  - **Stale** (in manifest but file missing): removes manifest entry
- After all files are processed, any manifest entries whose files no longer exist are purged

**5.2 Database → File Sync:**
- When script is created via API (`POST /api/scripts`):
  1. Generate sanitized filename from script name
  2. Write `.pine` file to scripts directory
  3. Create manifest entry
- When script is updated via API (`PUT /api/scripts/:id`):
  1. Update corresponding `.pine` file
  2. Update manifest entry
- When script is deleted via API (`DELETE /api/scripts/:id`):
  1. Delete corresponding `.pine` file
  2. Remove manifest entry

**5.3 Conflict Resolution:**
- Last-write-wins for simultaneous API and file changes
- File watcher events are debounced (100ms) to batch rapid changes
- API writes acquire a file lock before writing
- Checksum comparison prevents unnecessary updates

#### 6. Filename Sanitization Rules
1. Convert to lowercase
2. Replace spaces with underscores
3. Remove special characters except hyphens and underscores
4. Truncate to 64 characters (excluding extension)
5. Append numeric suffix for conflicts: `my_script.pine` → `my_script_1.pine`
6. Preserve UTF-8 characters for international names

#### 7. File Watcher Implementation
- Use `chokidar` library for cross-platform file system watching
- Watch `backend/data/scripts/**/*.pine` recursively
- Events: `add`, `change`, `unlink`, `addDir`, `unlinkDir`
- Debounce events by 100ms to batch rapid changes
- Log all file operations for auditing
- Handle watcher errors gracefully (permission issues, etc.)

#### 8. REST API Extensions

**File Metadata Endpoints:**
```
GET    /api/scripts/files                  → List all scripts with file metadata
GET    /api/scripts/files/:id              → Get file metadata for a script
GET    /api/scripts/files/:id/content      → Get raw file content
POST   /api/scripts/files/sync             → Force sync from filesystem
GET    /api/scripts/files/status           → Get sync status and last sync time
```

**Response Format:**
```json
{
  "id": "abc123",
  "filename": "sma_crossover.pine",
  "name": "SMA Crossover",
  "scriptType": "indicator",
  "filePath": "indicators/sma_crossover.pine",
  "size": 1024,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z",
  "checksum": "a1b2c3d4e5f6..."
}
```

#### 9. AI Agent Integration Workflow

**Step 1: Agent creates script file**
```bash
# AI agent writes .pine file
echo "//@version=6
indicator('Custom RSI Divergence')
// ... script code ..." > backend/data/scripts/indicators/rsi_divergence.pine
```

**Step 2: File watcher detects change**
- File watcher triggers `add` event
- Sync Engine reads file content
- Validates syntax
- Extracts metadata

**Step 3: Script registered in database**
- Creates entry in `scripts.json`
- Registers via Script Bank API
- Script appears in editor dropdown

**Step 4: User loads script**
- User selects script from dropdown
- Source loads into editor
- User can execute on chart

#### 10. Bulk Import Support
- Drop multiple `.pine` files in scripts directory
- File watcher processes each file sequentially
- Progress logged for each file
- Errors logged but don't block other files
- Summary report available via `/api/scripts/files/status`

#### 11. Error Handling
- Invalid syntax: file is skipped, error logged, file remains in directory
- Filename conflict: numeric suffix appended automatically
- File watcher failure: falls back to manual sync via API
- Database write failure: file remains, retry on next sync
- Permission errors: logged, file skipped

### Built-In Test Indicators

#### Overview

The `test_indicators/` directory contains production-ready Pine Script indicator files that are loaded at startup and made available in the script editor as built-in, uneditable, undeletable resources. These serve as reference implementations and allow quick validation of the engine's capabilities. Users can only run them on the chart — they cannot modify or remove them.

#### Architecture

- **Static assets**: Scripts live in `test_indicators/` as `.pine` files
- **Backend API**: A dedicated endpoint `GET /api/scripts/built-in` serves the list of built-in indicators; the built-in router is registered **before** the generic scripts router to prevent the `/:id` catch-all from swallowing built-in requests
- **Frontend**: Built-in indicators appear in a "Built-In Tests" optgroup in the script editor dropdown
- **Execution**: Built-in scripts use the same execution path as user scripts
- **Immutability**: Built-in scripts are not synced to manifest, cannot be edited, and cannot be deleted

#### API Design

```
GET /api/scripts/built-in
Response: Array<{
  id: string,           // "builtin_<filename>"
  name: string,         // Extracted from indicator("...")/strategy("...") source; falls back to basename
  source: string,       // Full script source
  type: "indicator" | "strategy"
}>
```

The `extractNameFromContent(source)` helper parses the `indicator("Name")` or `strategy("Name")` declaration via regex `/\b(?:indicator|strategy|library)\s*\(\s*["']([^"']+)["']/` to extract the human-readable name from source, falling back to the filename's basename if no match is found.

#### Frontend Behavior

- Built-in scripts fetched on startup alongside user scripts via `Promise.all([fetch('/api/scripts'), fetch('/api/scripts/built-in')])`
- Stored in a separate `builtInScripts` state array and mirrored in a `builtInScriptsRef` ref (the ref prevents stale closure / dependency cycles in `loadScript`)
- The `loadScript` callback checks the built-in scripts ref first; if the target ID matches a built-in, it sets source directly from memory rather than making an API call
- Displayed under a `"Built-In Tests"` `<optgroup>` in the script dropdown, with user scripts in a separate `"My Scripts"` optgroup
- Active built-in script shows a type badge (indicator → amber, strategy → green) and a `"Built-In"` label below the editor header
- **Delete button**: shown only when a user script is selected (`currentScript &&`); hidden for built-in scripts (no need to disable — the button simply does not render)
- **Action buttons**: New, Add (Ctrl+Enter), and Close buttons are always visible regardless of whether any scripts exist — the empty state only shows when both user and built-in lists are empty
- **Editor**: textarea is `readOnly` with darker background (`#151520`), dimmer text (`#999`), and `not-allowed` cursor for built-in scripts
- **Auto-select on empty state**: when no user scripts exist, the first built-in script is loaded on startup (source set directly from fetched data, not via the ref-based `loadScript`, to avoid stale-ref timing issues)
- **Delete fallback**: after deleting the last user script, the editor selects the first built-in script rather than showing the default template
- Built-in scripts NOT synced to manifest or file storage

#### Script ID Convention

Built-in script IDs follow the pattern `builtin_<filename>` (e.g., `builtin_macd`, `builtin_trendcraft-ict-swiftedge`) to distinguish them from user scripts.

#### Security Considerations

- Built-in scripts are read-only at the API level
- No write/delete endpoints for built-in scripts
- Source validation on load to prevent malformed scripts

#### 12. Security Considerations
- Scripts are executed in sandboxed environment (existing)
- File paths validated to prevent directory traversal
- File size limits enforced (max 1MB per script)
- Rate limiting on sync operations
- Audit logging for all file operations

### Quick Indicator/Strategy Adder

#### 1. Overview
The Quick Adder provides a fast, keyboard-driven way to add indicators and strategies to the chart without opening the full code editor. It is a small, centered popup overlay accessible via a footer bar button or the "/" keyboard shortcut.

#### 2. UI Layout
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

#### 3. Component Architecture
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

#### 4. Data Flow
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

#### 5. Keyboard Shortcuts
- `/` — Open quick adder (when not focused on input/textarea)
- `ESC` — Close quick adder
- Arrow keys — Navigate script list (optional enhancement)
- `Enter` — Add highlighted script (optional enhancement)

#### 6. Integration with Existing Systems
- **IndicatorManager**: Uses existing `addIndicator()` method — no new backend APIs needed
- **Script Bank**: Reads from existing `GET /api/scripts` and `GET /api/scripts/built-in` endpoints
- **Footer Bar**: New button placed alongside the existing auto-scale toggle
- **Code Editor**: The quick adder is an alternative entry point — does NOT replace the code editor's "Add" button

### CLI Backtest Tool for Multi-Symbol Strategy Validation

#### 1. Overview
The CLI Backtest Tool enables AI agents (and human developers) to validate trading strategies across multiple trading pairs from the command line, without requiring the web server to be running. It runs the same Pine Script strategy against historical data for several symbols, aggregates the results, computes cross-pair statistics, and produces an overfitting risk assessment. This is the primary mechanism for AI agents to iteratively refine merged indicator strategies.

#### 2. System Architecture
```
┌──────────────────────────────────────────────────────────────┐
│                     CLI Entry Point                           │
│  Parses arguments: script, timeframe, symbols, date range,   │
│  strategy config, output path                                │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│                  Multi-Symbol Runner                          │
│  Iterates over symbols list, runs backtest per symbol        │
│  Reports progress, handles per-symbol failures               │
└──────────┬───────────────────────────────────┬───────────────┘
           │                                   │
┌──────────▼──────────────┐  ┌─────────────────▼──────────────┐
│   Per-Symbol Backtest   │  │   Result Aggregator             │
│   (reuses existing      │  │   - Computes cross-pair stats   │
│    execution pipeline)  │  │   - Coefficient of variation    │
│   1. Fetch OHLCV bars   │  │   - Overfitting risk score      │
│   2. Parse + compile    │  │   - Best/worst pair             │
│   3. ExecuteEngine.run  │  │   - Median/mean/percentiles     │
│   4. Extract metrics    │  └────────────────────────────────┘
└─────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────────┐
│                      Output Formatter                        │
│  - JSON file (machine-readable, for agent consumption)      │
│  - Human-readable summary table (stdout)                    │
└─────────────────────────────────────────────────────────────┘
```

#### 3. CLI Interface
```
pine-backtest <script.pine> [options]

Options:
  --timeframe <tf>        Timeframe: 1,3,5,15,30,60,120,240,D,W,M (default: 60)
  --symbols <list>        Comma-separated symbols (default: BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT)
  --days-back <n>         Lookback period in days (default: varies by timeframe)
  --start-date <date>     Start date YYYY-MM-DD (overrides --days-back)
  --end-date <date>       End date YYYY-MM-DD
  --output <path>         Write JSON results to file
  --initial-capital <n>   Starting capital (default: 10000)
  --commission <n>        Commission value (default: 0)
  --slippage <n>          Slippage value (default: 0)
  --default-qty <n>       Default order quantity (default: 1)
  --pyramiding <n>        Max pyramiding entries (default: 0)
```

The `--days-back` default varies by timeframe to prevent memory issues with smaller timeframes that generate more bars per day:

| Timeframe | Default Days Back |
|-----------|-------------------|
| 1m        | 3                 |
| 3m        | 7                 |
| 5m        | 14                |
| 15m       | 45                |
| 30m       | 90                |
| 60m       | 180               |
| 120m      | 365               |
| 240m      | 730               |
| D/W/M     | 1825              |

The tool resolves script paths from both the current working directory and the monorepo root, allowing scripts to be specified as `backend/data/scripts/strategies/name.pine` when run from any workspace directory. It can be invoked via `pnpm run backtest` from the monorepo root.

#### 4. Multi-Symbol Runner
- **Sequential execution** — runs one symbol at a time to avoid API rate limits on Bybit
- **Progress reporting** — prints `[2/5] Backtesting ETHUSDT...` to stderr
- **Per-symbol error handling** — catches compilation errors, data fetch failures, and execution errors per symbol, logs them, and continues with remaining symbols
- **Skip on failure** — failed symbols are excluded from cross-pair aggregation

#### 5. Overfitting Detection
The tool computes an overfitting risk score based on the consistency of performance across diverse symbols:

```
overfitting_risk = coefficient_of_variation(net_profits)
  < 0.5  → LOW risk (consistent across pairs)
  0.5-1.5 → MODERATE risk (some variance)
  > 1.5  → HIGH risk (likely overfitted)
```

Additional signals:
- **Best-pair / worst-pair ratio** — if best pair is 5x+ worse than worst, high overfit risk
- **Negative correlation** — if some pairs are profitable while others are unprofitable, the strategy may be curve-fitted
- **Win rate consistency** — large variance in win rates across symbols indicates overfitting

#### 6. Output Format
```json
{
  "script": "strategy_name.pine",
  "timeframe": "60",
  "dateRange": { "start": "2026-04-14", "end": "2026-07-13" },
  "symbols": [
    {
      "symbol": "BTCUSDT",
      "status": "completed",
      "metrics": {
        "netProfit": 1250.45,
        "netProfitPercent": 12.5,
        "profitFactor": 1.82,
        "maxDrawdownPercent": 8.3,
        "winRate": 58.3,
        "sharpeRatio": 1.45,
        "totalTrades": 42,
        "buyHoldReturn": 5.2
      }
    },
    {
      "symbol": "SOLUSDT",
      "status": "failed",
      "error": "Compilation error: Line 15 - undeclared identifier"
    }
  ],
  "crossPairSummary": {
    "avgNetProfitPercent": 8.7,
    "medianProfitFactor": 1.65,
    "coefficientOfVariation": 0.42,
    "overfittingRisk": "LOW",
    "bestPair": "BTCUSDT",
    "worstPair": "ETHUSDT",
    "successfulSymbols": 4,
    "failedSymbols": 1
  }
}
```

#### 7. Human-Readable Output
```
═══════════════════════════════════════════════════════════════
  Backtest Results: rsi_bollinger_strategy.pine (1h, 90 days)
═══════════════════════════════════════════════════════════════
  Symbol       Net PnL%   PF     MaxDD%   WinRate  Trades  Sharpe
  ─────────────────────────────────────────────────────────────
  BTCUSDT      +12.50%    1.82   8.30%    58.3%    42      1.45
  ETHUSDT       +5.20%    1.45  12.10%    52.1%    38      0.92
  SOLUSDT      +15.30%    2.10   6.50%    61.2%    35      1.88
  BNBUSDT       +1.80%    1.12  15.20%    48.9%    44      0.35
  XRPUSDT       +8.80%    1.55   9.80%    55.0%    40      1.12
  ─────────────────────────────────────────────────────────────
  Average       +8.72%    1.61   10.38%   55.1%    40      1.14
  CV of PnL:    0.42  |  Overfitting Risk: LOW
  Best: SOLUSDT (+15.30%)  |  Worst: BNBUSDT (+1.80%)
═══════════════════════════════════════════════════════════════
```

#### 8. Agent Iteration Workflow
The intended workflow for AI agents:
1. Merge indicators into a strategy (per merge-indicators-to-strategy.md)
2. Run `pine-backtest strategy.pine --output results.json`
3. Parse the JSON output
4. If overfitting risk is HIGH or performance is poor:
   a. Identify the weakest-performing symbols
   b. Adjust strategy input parameters (e.g., RSI length, threshold levels)
   c. Re-run the backtest
   d. Compare results to the previous run
5. Repeat until overfitting risk is LOW and cross-pair performance is acceptable
6. Save the final optimized strategy

#### 9. Integration with Existing Systems
- **Execution Engine**: Reuses `parse()`, `compile()`, `ExecutionEngine`, and `createSeries` from `pine-framework`
- **Bybit Data Source**: Reuses the existing `fetchBars()` function from the backtest route for OHLCV data
- **Strategy Engine**: Reuses `strategyEngine.getTrades()` and `strategyEngine.getMetrics()` for result extraction
- **Backtest Route Logic**: Mirrors the execution pipeline from `backend/src/routes/backtest.ts` but runs synchronously in a CLI context (no job queue, no REST)
- **No server required**: The CLI tool operates independently of the web server

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