# Requirements Document

## Introduction

This specification defines requirements for building a Pine Script v6 compatible execution and rendering engine. The system is a production-grade alternative runtime that parses, executes, and renders Pine Script v6 programs with TradingView-like semantics. It must handle millions of candles, support hundreds of indicators, process realtime updates, and provide extensibility through a plugin architecture.

## Glossary

- **Pine_Script**: A domain-specific language for technical analysis on TradingView platform
- **AST (Abstract_Syntax_Tree)**: A tree representation of the syntactic structure of Pine Script code
- **Series**: Pine's time-series data type where each element corresponds to a historical bar
- **OHLCV**: Open, High, Low, Close, Volume data for financial instruments
- **Technical_Analysis**: Mathematical calculations on price/volume data to identify patterns
- **Execution_Engine**: Component that evaluates Pine Script code bar-by-bar
- **Rendering_Engine**: Component that produces visual output (plots, drawings, indicators)
- **Strategy_Engine**: Component that handles order execution, position management, and backtesting
- **Request_System**: Pine's mechanism for accessing multi-symbol and multi-timeframe data
- **TA_Engine**: Technical analysis function implementation (moving averages, oscillators, etc.)
- **Plugin_Registry**: Extensible system for adding new functions, types, and features
- **Monorepo**: A single repository containing multiple packages (engine, frontend, backend) managed via pnpm workspaces
- **Backend**: Node.js server that bridges the frontend and the Pine Script engine, serves OHLCV data, and manages WebSocket connections
- **Bybit**: Cryptocurrency exchange providing real-time and historical OHLCV market data via REST and WebSocket APIs

## Requirements

### Requirement 1: Language Parser and Compiler

**User Story:** As a Pine Script developer, I want to write Pine Script v6 code, so that it can be parsed and compiled into an executable representation.

#### Acceptance Criteria

1. THE Parser SHALL parse Pine Script v6 syntax including all language constructs
2. WHEN valid Pine Script code is provided, THE Parser SHALL produce a valid AST
3. WHEN invalid syntax is encountered, THE Parser SHALL produce descriptive error messages
4. THE Compiler SHALL validate type consistency across the entire program
5. WHERE different Pine Script versions exist, THE Parser SHALL detect version declarations
6. THE AST SHALL preserve all semantic information needed for execution
7. FOR ALL valid Pine Script programs, parsing then compilation SHALL produce an executable representation
8. THE Parser SHALL support named arguments in function calls (identified by `identifier = expression`, `colorType = expression`, or `stringType = expression`)
9. THE Parser SHALL support color, shape, location, strategy, indicator, and library token types as valid identifiers in member expressions

### Requirement 2: Pine Type System

**User Story:** As a Pine Script developer, I want to use Pine's type system, so that my code behaves consistently with TradingView.

#### Acceptance Criteria

1. THE Type_System SHALL support Pine primitive types (int, float, bool, string, color)
2. THE Type_System SHALL implement Series types for time-series data
3. THE Type_System SHALL support Pine's automatic type coercion rules
4. WHEN type errors occur, THE Type_System SHALL provide clear error messages
5. THE Type_System SHALL support Pine's array and map data structures
6. THE Type_System SHALL implement Pine's na (not available) value semantics
7. THE Type_System SHALL support user-defined types via type aliases

### Requirement 3: Execution Engine

**User Story:** As a Pine Script developer, I want my code to execute with TradingView-like semantics, so that indicators and strategies produce consistent results.

#### Acceptance Criteria

1. THE Execution_Engine SHALL execute Pine Script programs bar-by-bar
2. WHILE processing historical bars, THE Execution_Engine SHALL maintain series state
3. WHEN realtime bars arrive, THE Execution_Engine SHALL update calculations
4. IF execution errors occur, THEN THE Execution_Engine SHALL roll back to previous state
5. THE Execution_Engine SHALL support Pine's script re-execution on each new bar
6. THE Execution_Engine SHALL maintain variable scope across script execution
7. THE Execution_Engine SHALL implement Pine's series indexing behavior (close[1], etc.)
8. THE Execution_Engine SHALL return shapes, fills, and strategyMarkers as part of the execution result
9. THE Execution_Engine SHALL track and manage shapes (plotshape markers) across bar execution
10. THE Execution_Engine SHALL track and manage fills (filled areas between plots) across bar execution
11. THE Execution_Engine SHALL support named arguments forwarding to built-in functions
12. THE Execution_Engine SHALL auto-detect plot titles from variable names when no title is provided
13. THE Execution_Engine SHALL maintain var and varip variable state across bars without resetting on re-declaration
14. THE Execution_Engine SHALL support inclusive for-loop iteration (`for i = 0 to end` includes the `end` value)

### Requirement 4: Technical Analysis Functions

**User Story:** As a technical analyst, I want access to built-in TA functions, so that I can implement standard indicators.

#### Acceptance Criteria

1. THE TA_Engine SHALL implement all ta.* namespace functions (sma, ema, rsi, macd, etc.)
2. WHEN calculating indicators, THE TA_Engine SHALL match TradingView numerical precision
3. THE TA_Engine SHALL handle series input with appropriate lookback windows
4. WHERE functions have configurable parameters, THE TA_Engine SHALL accept parameter customization
5. THE TA_Engine SHALL optimize calculations for performance with large datasets
6. FOR ALL ta.* functions, output SHALL match TradingView results within acceptable tolerance
7. THE TA_Engine SHALL implement ta.sma() using a circular buffer with configurable lookback window, returning NA until sufficient data is accumulated
8. THE TA_Engine SHALL implement ta.ema() using the exponential moving average formula (prev * (1-k) + source * k) with proper initialization
9. THE TA_Engine SHALL implement ta.crossover() with internal state tracking to detect when source crosses above compare
10. THE TA_Engine SHALL implement ta.crossunder() with internal state tracking to detect when source crosses below compare

### Requirement 5: Multi-Symbol and Multi-Timeframe Data Access

**User Story:** As a Pine Script developer, I want to access data from multiple symbols and timeframes, so that I can implement complex analysis.

#### Acceptance Criteria

1. WHEN request.security() is called, THE Request_System SHALL fetch the specified data
2. THE Request_System SHALL support Pine's lookahead bias prevention
3. WHERE multiple symbols are requested, THE Request_System SHALL manage data alignment
4. THE Request_System SHALL cache historical data to optimize performance
5. WHEN realtime updates occur, THE Request_System SHALL propagate changes
6. THE Request_System SHALL handle data gaps and missing bars appropriately
7. THE Request_System SHALL support all Pine request.* functions and parameters

### Requirement 6: Plotting and Visualization

**User Story:** As a chart analyst, I want to visualize indicators and strategies on a realtime candle chart, so that I can interpret market data.

#### Acceptance Criteria

1. THE Plot_Engine SHALL render plots identical or visually close to TradingView
2. WHEN plot() is called, THE Plot_Engine SHALL draw series with specified styles (line, stepline, histogram, columns, area, areabr, circles, cross)
3. WHEN plotshape() is called, THE Plot_Engine SHALL render shapes/icons (arrowup, arrowdown, circle, square, diamond, triangleup, triangledown, cross, xcross, flag, labelup, labeldown) at specified locations (abovebar, belowbar, top, bottom, absolute)
4. WHEN plotchar() is called, THE Plot_Engine SHALL render characters/symbols at specified locations
5. WHEN plotarrow() is called, THE Plot_Engine SHALL render directional arrows with specified colors (colorup, colordown)
6. WHEN hline() is called, THE Plot_Engine SHALL render horizontal lines at specified price levels with linestyle options (solid, dotted, dashed)
7. WHEN bgcolor() is called, THE Plot_Engine SHALL color the chart background with specified colors
8. WHEN barcolor() is called, THE Plot_Engine SHALL color chart candles/bars with specified colors
9. WHEN fill() is called, THE Plot_Engine SHALL render filled area between two plots or hlines
10. THE Plot_Engine SHALL support all Pine plot styling options (color, linewidth, transparency, offset, editable, show_last, display)
11. THE Plot_Engine SHALL handle overlapping plots with proper z-ordering
12. THE Plot_Engine SHALL support size enums (tiny, small, normal, large, huge, auto)
13. THE Plot_Engine SHALL support all plot.style_* enums (line, stepline, histogram, columns, area, areabr, circles, cross)
14. THE Plot_Engine SHALL auto-detect plot titles from variable names when no explicit title is provided
15. THE Plot_Engine SHALL support named arguments for plot options (color, linewidth, title)
16. WHEN plotshape() is called, THE Plot_Engine SHALL render shapes as chart markers drawn directly on the Canvas at the correct bar position and price level
17. THE Plot_Engine SHALL filter null values from plot data before rendering to prevent chart errors
18. WHEN fill() is called, THE Plot_Engine SHALL render fill as an area series between two plot references with configurable colors
19. THE Plot_Engine SHALL support color, shape, and location namespace syntax (e.g., color.blue, shape.triangleup, location.abovebar)
20. THE Plot_Engine SHALL support the fill() builtin accepting named argument `color` for fill color specification

### Requirement 7: Drawing Objects

**User Story:** As a Pine Script developer, I want to draw objects on charts, so that I can mark significant events.

#### Acceptance Criteria

1. THE Drawing_Engine SHALL render line objects (line.new, line.copy, line.delete, line.set_*, line.get_*) with TradingView-like appearance and styling (color, style, width, extend, xloc)
2. THE Drawing_Engine SHALL render box objects (box.new, box.copy, box.delete, box.set_*, box.get_*) with fill and border options (bgcolor, border_color, border_style, border_width, text, text_color, text_size, text_halign, text_valign)
3. THE Drawing_Engine SHALL render label objects (label.new, label.copy, label.delete, label.set_*, label.get_*) with text formatting (color, style, textcolor, size, textalign, tooltip, xloc, yloc)
4. THE Drawing_Engine SHALL render table objects (table.new, table.cell, table.clear, table.delete, table.merge_cells, table.cell_set_*) with rows and columns (position, bgcolor, frame_color, frame_width, border_color, border_width)
5. THE Drawing_Engine SHALL render linefill objects (linefill.new, linefill.delete, linefill.set_color, linefill.get_line1, linefill.get_line2) between two lines
6. THE Drawing_Engine SHALL render polyline objects (polyline.new, polyline.delete) with multiple points (curved, closed, xloc, line_color, fill_color, line_style, line_width)
7. THE Drawing_Engine SHALL support chart.point objects (chart.point.new, chart.point.now, chart.point.from_index, chart.point.from_time, chart.point.copy) for coordinate positioning
8. THE Drawing_Engine SHALL support all Pine drawing styling and positioning options
9. THE Drawing_Engine SHALL enforce max_labels_count, max_lines_count, max_boxes_count, max_polylines_count limits
10. THE Drawing_Engine SHALL support all xloc modes (bar_index, bar_time)
11. THE Drawing_Engine SHALL support all yloc modes (price, abovebar, belowbar)
12. THE Drawing_Engine SHALL support all extend modes (none, left, right, both)

### Requirement 8: Strategy Execution

**User Story:** As a strategy developer, I want to backtest trading strategies and visualize order markers on the chart, so that I can evaluate performance.

#### Acceptance Criteria

1. THE Strategy_Engine SHALL execute Pine strategy code with order management
2. WHEN strategy.entry() is called, THE Strategy_Engine SHALL create orders and display entry markers on chart
3. WHEN strategy.order() is called, THE Strategy_Engine SHALL create orders and display order markers on chart
4. WHEN strategy.exit() is called, THE Strategy_Engine SHALL manage position exits and display exit markers on chart
5. WHEN strategy.close() is called, THE Strategy_Engine SHALL display closing markers on chart
6. WHEN strategy.close_all() is called, THE Strategy_Engine SHALL display closing markers on chart
7. WHEN strategy.cancel() is called, THE Strategy_Engine SHALL update displayed orders on chart
8. WHEN strategy.cancel_all() is called, THE Strategy_Engine SHALL update displayed orders on chart
9. THE Strategy_Engine SHALL calculate performance metrics (profit, drawdown, Sharpe ratio)
10. THE Strategy_Engine SHALL handle order fills with configurable slippage and commission
11. THE Strategy_Engine SHALL support all Pine strategy functions and parameters
12. THE Strategy_Engine SHALL provide backtesting reports with trade-by-trade analysis
13. WHEN strategy.entry() is called with an opposite direction to current position, THE Strategy_Engine SHALL reverse the position (close existing and open new in opposite direction)
14. THE Strategy_Engine SHALL defer market order fills to the next bar's open price for realistic backtesting
15. THE Strategy_Engine SHALL render exit markers with optional comment text on the chart
16. THE Strategy_Engine SHALL return strategy markers (entry, exit, close, order) as part of the execution result
17. THE Strategy_Engine SHALL support strategy.position_size builtin to query current position quantity
18. THE Strategy_Engine SHALL support strategy.commission.percent commission type
19. THE Strategy_Engine SHALL support strategy.close() with named arguments (id, comment)
20. THE Strategy_Engine SHALL support strategy.close_all() to close all open positions at once

### Requirement 9: Extensibility and Plugin Architecture

**User Story:** As a framework developer, I want to extend the engine without modifying core code, so that new features can be added independently.

#### Acceptance Criteria

1. THE Plugin_Registry SHALL allow registration of new built-in functions
2. THE Plugin_Registry SHALL allow registration of new types
3. THE Plugin_Registry SHALL allow registration of new rendering components
4. WHEN plugins are added, THE System SHALL integrate them without requiring engine modifications
5. THE Plugin_Registry SHALL validate plugin interfaces during registration
6. THE Plugin_Registry SHALL support dependency resolution between plugins
7. THE Plugin_Registry SHALL provide version compatibility checking

### Requirement 10: Performance and Scalability

**User Story:** As a production user, I want the engine to handle large datasets efficiently, so that I can analyze millions of candles.

#### Acceptance Criteria

1. THE Execution_Engine SHALL process millions of historical candles with acceptable memory usage
2. WHEN processing realtime data, THE Execution_Engine SHALL update within milliseconds
3. THE System SHALL support hundreds of concurrent indicators on the same chart
4. THE Data_Layer SHALL optimize OHLCV data storage and retrieval
5. THE Rendering_Engine SHALL render complex visualizations with smooth performance
6. THE System SHALL implement memory management to prevent leaks during long-running execution
7. THE System SHALL provide performance profiling tools to identify bottlenecks

### Requirement 11: Testing and Compatibility

**User Story:** As a quality assurance engineer, I want to verify engine correctness, so that it produces TradingView-compatible results.

#### Acceptance Criteria

1. THE Test_Framework SHALL include unit tests for all Pine language constructs
2. THE Test_Framework SHALL include integration tests for complete Pine scripts
3. WHEN comparing with TradingView, THE System SHALL produce identical results for test cases
4. THE Test_Framework SHALL include property-based tests for mathematical functions
5. THE Test_Framework SHALL include compatibility tests against TradingView output samples
6. THE Test_Framework SHALL test edge cases and error conditions
7. THE Test_Framework SHALL provide test coverage reporting
8. THE Test_Framework SHALL include complex script integration tests covering if/else chains, var persistence, for-loop accumulation, ternary expressions, math function chains, multi-plot outputs, and combined features
9. THE Test_Framework SHALL validate strategy engine behavior including market order fill deferral, position reversal, and marker generation

### Requirement 12: Input and Configuration System

**User Story:** As a Pine Script user, I want to configure indicators via input dialogs, so that I can customize analysis parameters.

#### Acceptance Criteria

1. THE Input_System SHALL support all Pine input types (integer, float, bool, string, color, symbol, timeframe)
2. WHEN input() is called, THE Input_System SHALL provide default values
3. THE Input_System SHALL validate input values against constraints
4. WHERE input groups exist, THE Input_System SHALL organize them logically
5. THE Input_System SHALL persist input values across script executions
6. THE Input_System SHALL support input tooltips and descriptions
7. THE Input_System SHALL handle input changes during realtime execution
8. THE Input_System SHALL support input.time() for timestamp-type inputs with default values

### Requirement 13: String and Time Functions

**User Story:** As a Pine Script developer, I want to manipulate strings and times, so that I can format output and work with temporal data.

#### Acceptance Criteria

1. THE String_Functions SHALL implement all Pine string operations (concatenation, formatting, parsing)
2. THE Time_Functions SHALL implement all Pine time operations (timestamp conversion, timezone handling)
3. WHEN working with dates, THE System SHALL support Pine's time semantics
4. THE System SHALL implement str.format() with TradingView-compatible formatting options
5. THE System SHALL handle time series alignment with different timezones
6. THE System SHALL support Pine's session and trading time calculations
7. THE System SHALL implement string-to-number and number-to-string conversions
8. THE System SHALL support timestamp() accepting either individual date components (year, month, day, hour, minute, second) or a date string
9. WHEN timestamp() is called with optional parameters, THE System SHALL default missing hour, minute, and second values to zero

### Requirement 14: Alert System

**User Story:** As a trader, I want to receive alerts based on Pine Script conditions and see alert conditions in the UI, so that I can be notified of trading opportunities.

#### Acceptance Criteria

1. THE Alert_System SHALL evaluate Pine alert conditions on each bar
2. WHEN alert() is called, THE Alert_System SHALL trigger notifications with specified frequency (once_per_bar, once_per_bar_close, all)
3. WHEN alertcondition() is called, THE Alert_System SHALL create alert conditions visible in the UI
4. THE Alert_System SHALL format alert messages with Pine's template syntax ({{close}}, {{open}}, {{high}}, {{low}}, {{time}}, {{interval}})
5. THE Alert_System SHALL prevent duplicate alerts within configurable time windows
6. THE Alert_System SHALL support multiple alert destinations (email, webhook, popup, etc.)
7. THE Alert_System SHALL log all alert events for auditing
8. THE Alert_System SHALL display alertcondition() in the indicator settings UI
9. THE Alert_System SHALL support alert message templates with variable substitution

### Requirement 15: Color System and Formatting

**User Story:** As a Pine Script developer, I want to use Pine's color system, so that I can create visually appealing indicators.

#### Acceptance Criteria

1. THE Color_System SHALL support all Pine color representations (hex, rgb, named colors)
2. THE Color_System SHALL implement Pine's color arithmetic and blending
3. WHEN colors are specified, THE System SHALL validate color values
4. THE System SHALL support Pine's color transparency (alpha channel)
5. THE System SHALL implement Pine's conditional color expressions
6. THE System SHALL support Pine's gradient and palette functions
7. THE System SHALL render colors consistently across different display systems
8. THE Color_System SHALL support color.new(color, transp) builtin for creating colors with specified transparency
9. THE Color_System SHALL support color namespace syntax (color.blue, color.red, color.green, etc.) resolving to hex color values

### Requirement 16: Script Declaration and Configuration

**User Story:** As a Pine Script developer, I want to declare my script type with configuration parameters, so that the engine knows how to render and execute my code.

#### Acceptance Criteria

1. WHEN indicator() is called, THE System SHALL configure script as an indicator with overlay, max_labels_count, max_lines_count, max_boxes_count, max_polylines_count parameters
2. WHEN strategy() is called, THE System SHALL configure script as a strategy with order management and visualization parameters
3. WHEN library() is called, THE System SHALL configure script as a reusable library
4. THE System SHALL support all indicator() parameters (title, shorttitle, overlay, format, precision, scale, max_labels_count, max_lines_count, max_boxes_count, max_polylines_count, max_bars_back, calc_on_every_tick, max_lines_left, max_labels_left, max_boxes_left, explicit_plot_zorder)
5. THE System SHALL support all strategy() parameters (title, shorttitle, overlay, format, precision, scale, pyramiding, calc_on_every_tick, backtest_fill_limits_assumption, default_qty_type, default_qty_value, initial_capital, commission_type, commission_value, slippage, process_orders_on_close, close_entries_rule, margin_long, margin_short, max_boxes_count, max_lines_count, max_labels_count, risk_free_rate)
6. THE System SHALL validate script type compatibility with available functions

### Requirement 17: Frontend Web Application with Canvas Charting

**User Story:** As a trader, I want a web-based frontend with a custom canvas-rendered candle chart and an interactive code editor, so that I have full control over all visual elements including shapes, fills, and strategy markers.

#### Acceptance Criteria

1. THE Frontend SHALL display a realtime candlestick chart rendered on an HTML5 Canvas element with OHLCV data fetched from the Backend
2. THE Frontend SHALL provide a button that opens a popup code editor
3. THE Frontend SHALL allow users to enter Pine Script v6 code in the editor
4. WHEN the editor is closed, THE Frontend SHALL send the script to the Backend for compilation and execution, then render the results on the chart
5. IF compilation errors occur, THE Frontend SHALL log errors in an error console/panel
6. IF runtime errors occur, THE Frontend SHALL log errors in an error console/panel
7. THE Frontend SHALL display error messages with line numbers and descriptions
8. THE Frontend SHALL update the chart in realtime as new data arrives via WebSocket
9. THE Frontend SHALL support zooming (mouse wheel, pinch) and panning (click-and-drag) on the chart
10. THE Frontend SHALL display chart legend with indicator names and values
11. THE Frontend SHALL provide timeframe and symbol selection controls
12. THE Frontend SHALL use WebSocket for realtime data streaming from the Backend
13. THE Frontend SHALL render all Pine Script visual outputs on the canvas (candlesticks, volume, plots, shapes, fills, strategy markers, hlines, drawing lines)
14. THE Frontend SHALL support multiple concurrent indicators on the same chart
15. THE Frontend SHALL provide smooth rendering performance with large datasets using requestAnimationFrame
16. THE Frontend SHALL support syntax highlighting in the code editor
17. THE Frontend SHALL provide auto-completion for Pine Script keywords and functions
18. THE Frontend SHALL save and load user scripts
19. THE Frontend SHALL render shapes (arrows, circles, squares, diamonds, triangles) as canvas-drawn markers at correct bar index and price level positions
20. THE Frontend SHALL render strategy entry/exit/close markers on the chart with directional arrows and color coding
21. THE Frontend SHALL render fill() as filled polygons between two plot lines with configurable colors and transparency
22. THE Frontend SHALL auto-focus chart to new symbol's price range on pair switch
23. THE Frontend SHALL filter out invalid data points (time=0, non-finite values) before rendering
24. THE Frontend SHALL auto-assign distinct colors to plot lines when not explicitly specified
25. THE Frontend SHALL parse plot metadata (color, linewidth) from output keys

### Requirement 18: Monorepo Project Structure

**User Story:** As a developer, I want a unified monorepo managed by pnpm workspaces, so that the engine, frontend, and backend are developed and built from a single repository with shared dependencies.

#### Acceptance Criteria

1. THE project SHALL use pnpm workspaces with a root `pnpm-workspace.yaml` declaring all packages
2. THE root `package.json` SHALL define workspace-level scripts (`dev`, `build`, `test`, `lint`) that orchestrate all packages
3. THE engine (`pine-framework`) SHALL be a workspace package exportable as a library
4. THE frontend SHALL declare `pine-framework` as a workspace dependency (`"pine-framework": "workspace:*"`)
5. THE backend SHALL declare `pine-framework` as a workspace dependency (`"pine-framework": "workspace:*"`)
6. THE root `pnpm-lock.yaml` SHALL be the single lockfile for the entire project
7. Running `pnpm install` at the root SHALL install all dependencies for all packages
8. Running `pnpm dev` at the root SHALL start both frontend and backend concurrently
9. Running `pnpm build` at the root SHALL build all packages in dependency order
10. Running `pnpm test` at the root SHALL run tests across all packages
11. Each package SHALL have its own `package.json` with package-specific scripts
12. No nested `pnpm-lock.yaml` or `node_modules` SHALL exist in subdirectories

### Requirement 19: Backend API Server

**User Story:** As a trader, I want a backend server that serves real market data and executes Pine Script code, so that the frontend can display accurate charts and indicators.

#### Acceptance Criteria

1. THE Backend SHALL expose a REST API for OHLCV historical data retrieval (`GET /api/ohlcv?symbol=BTCUSDT&interval=1m&limit=1000`)
2. THE Backend SHALL expose a WebSocket endpoint (`/ws`) for realtime candle streaming
3. THE Backend SHALL accept Pine Script code via `POST /api/execute`, compile and execute it using the `pine-framework` engine, and return plot/drawing results
4. THE Backend SHALL manage Bybit API connections and relay market data to connected clients
5. THE Backend SHALL handle multiple concurrent WebSocket clients
6. THE Backend SHALL support symbol and interval subscription/unsubscription via WebSocket messages
7. THE Backend SHALL cache recent OHLCV data to reduce Bybit API calls
8. THE Backend SHALL run on port 8080 by default (configurable via environment variable)
9. THE Backend SHALL be a workspace package within the monorepo
10. THE Backend SHALL gracefully handle Bybit API rate limits and connection failures
11. THE Backend SHALL log connection status and error events
12. THE Backend SHALL validate all incoming request parameters
13. THE Backend SHALL accept JSON request bodies up to 5MB in size
14. THE Backend SHALL return shapes, fills, and strategyMarkers in the POST /api/execute response
15. THE Backend SHALL handle non-JSON server responses gracefully without crashing
16. THE Backend SHALL validate WebSocket kline data before forwarding to clients (reject invalid timestamps, non-finite OHLC values)

### Requirement 20: Bybit Exchange Integration

**User Story:** As a trader, I want real market data from Bybit, so that I can analyze actual cryptocurrency price action with Pine Script indicators.

#### Acceptance Criteria

1. THE Bybit_Integration SHALL fetch historical OHLCV data from Bybit REST API (`/v5/market/kline`)
2. THE Bybit_Integration SHALL subscribe to realtime kline streams via Bybit WebSocket (`kline` topic)
3. THE Bybit_Integration SHALL support all Bybit candle intervals (1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d, 1w, 1M)
4. THE Bybit_Integration SHALL support all Bybit linear perpetual symbols (BTCUSDT, ETHUSDT, and others)
5. THE Bybit_Integration SHALL normalize Bybit data format to the engine's internal OHLCV format
6. THE Bybit_Integration SHALL handle Bybit WebSocket reconnection and heartbeat
7. THE Bybit_Integration SHALL rate-limit REST API calls to comply with Bybit limits
8. THE Bybit_Integration SHALL operate without API keys for public market data endpoints
9. THE Bybit_Integration SHALL be implemented as part of the Backend package
10. THE Bybit_Integration SHALL provide a data source adapter that implements the engine's `DataSource` interface

### Requirement 21: Canvas Charting Library

**User Story:** As a framework developer, I want a custom canvas-based charting library built into the project, so that we have full programmatic control over every pixel rendered on the chart — including candlesticks, volume, plots, shapes, fills, strategy markers, drawing objects, crosshair, axes, and grid — without depending on any third-party charting library.

#### Acceptance Criteria

**Core Canvas Rendering:**

1. THE Chart_Library SHALL render all chart elements on an HTML5 Canvas 2D context
2. THE Chart_Library SHALL use requestAnimationFrame for smooth, vsync-aligned rendering cycles
3. THE Chart_Library SHALL support devicePixelRatio-aware rendering for crisp display on HiDPI/Retina screens
4. THE Chart_Library SHALL implement a render loop that only redraws when state has changed (dirty flag pattern)

**Coordinate System and Layout:**

5. THE Chart_Library SHALL implement a coordinate transformation system mapping data space (bar index, price) to pixel space (x, y)
6. THE Chart_Library SHALL support a configurable chart layout with separate regions: main chart area, volume area (bottom 20%), and price scale area (right side)
7. THE Chart_Library SHALL implement a time scale (x-axis) that maps bar indices to pixel positions with configurable bar spacing (pixels per bar)
8. THE Chart_Library SHALL implement a price scale (y-axis) that maps price values to pixel positions with automatic tick spacing calculation
9. THE Chart_Library SHALL support multiple price scales (e.g., main price scale for candles, separate scale for volume)
10. THE Chart_Library SHALL calculate price scale bounds dynamically from visible data with padding margins
11. THE Chart_Library SHALL render price scale labels (price values) on the right side with configurable precision
12. THE Chart_Library SHALL render time scale labels (date/time) on the bottom with adaptive formatting based on timeframe

**Candlestick Rendering:**

13. THE Chart_Library SHALL render OHLCV candlesticks with body rectangles (open-close range) and wick lines (high-low range)
14. THE Chart_Library SHALL color candle bodies and wicks based on direction: green (#4caf50) for bullish (close >= open), red (#e94560) for bearish (close < open)
15. THE Chart_Library SHALL support bar coloring overrides from barcolor() script output
16. THE Chart_Library SHALL render candle body width as a percentage of bar spacing (default 70%)

**Volume Rendering:**

17. THE Chart_Library SHALL render volume bars in a dedicated bottom area (20% of chart height)
18. THE Chart_Library SHALL color volume bars semi-transparently matching the candle direction (green for up, red for down)
19. THE Chart_Library SHALL scale volume bar heights relative to the maximum volume in the visible range

**Line Plot Rendering:**

20. THE Chart_Library SHALL render line plots by drawing connected line segments between data points at their (barIndex, price) coordinates
21. THE Chart_Library SHALL support configurable line properties: color, width (1-4px), and style (solid, dotted, dashed)
22. THE Chart_Library SHALL implement dotted line style as a sequence of dots with configurable spacing
23. THE Chart_Library SHALL implement dashed line style as a sequence of dashes with configurable length and gap
24. THE Chart_Library SHALL support stepline rendering where each data point is drawn as a horizontal segment followed by a vertical segment
25. THE Chart_Library SHALL render histogram bars as vertical lines from a baseline to the data value
26. THE Chart_Library SHALL render area plots as filled polygons below the line with configurable fill color and transparency
27. THE Chart_Library SHALL render circle plots as small filled circles at each data point
28. THE Chart_Library SHALL render cross plots as small cross marks (+) at each data point
29. THE Chart_Library SHALL filter null values, breaking the line at gaps rather than connecting through nulls

**Shape Marker Rendering:**

30. THE Chart_Library SHALL render shape markers as vector-drawn icons at computed (barIndex, price) positions on the canvas
31. THE Chart_Library SHALL implement the following shapes: arrowUp, arrowDown, triangleUp, triangleDown, circle, square, diamond, cross, xcross
32. THE Chart_Library SHALL draw arrow shapes as triangular pointers with a stem line
33. THE Chart_Library SHALL draw diamond shapes as rotated squares using four line segments
34. THE Chart_Library SHALL draw xcross shapes as two crossing diagonal lines
35. THE Chart_Library SHALL position markers abovebar or belowbar based on the location parameter, offset from the candle high/low by a configurable margin
36. THE Chart_Library SHALL support text labels rendered alongside shape markers

**Fill Area Rendering:**

37. THE Chart_Library SHALL render fills as filled polygons between two line series data sets
38. THE Chart_Library SHALL compute the fill polygon by connecting the upper line forward and the lower line backward, forming a closed path
39. THE Chart_Library SHALL apply configurable fill color with alpha transparency to the polygon
40. THE Chart_Library SHALL clip fill polygons to the visible chart area to prevent rendering outside bounds

**Strategy Marker Rendering:**

41. THE Chart_Library SHALL render strategy entry markers as colored arrows below the bar (long=green arrowUp, short=red arrowDown)
42. THE Chart_Library SHALL render strategy exit markers as colored arrows above the bar (long exit=red arrowDown, short exit=blue arrowUp)
43. THE Chart_Library SHALL render strategy close markers with distinct styling from entry/exit markers
44. THE Chart_Library SHALL support text labels on strategy markers showing the entry name or comment
45. THE Chart_Library SHALL skip rendering cancel and cancel_all type markers

**Horizontal Line Rendering (hline):**

46. THE Chart_Library SHALL render horizontal lines across the full visible width at a specified price level
47. THE Chart_Library SHALL support line styles: solid, dotted, dashed
48. THE Chart_Library SHALL render hlines on a layer above candlesticks but below plot lines

**Crosshair:**

49. THE Chart_Library SHALL render a crosshair cursor following the mouse position with a vertical line through the hovered bar and a horizontal line at the hovered price
50. THE Chart_Library SHALL display a data window tooltip showing OHLCV values and indicator values for the hovered bar
51. THE Chart_Library SHALL snap the vertical crosshair line to the nearest bar center
52. THE Chart_Library SHALL render price and time labels on the axes at the crosshair position

**Grid:**

53. THE Chart_Library SHALL render a grid of horizontal lines at price scale tick intervals
54. THE Chart_Library SHALL render a grid of vertical lines at time scale major tick intervals
55. THE Chart_Library SHALL use subtle, low-opacity colors for grid lines (e.g., #2a2a4e)

**Interaction — Zoom and Pan:**

56. THE Chart_Library SHALL support horizontal zoom via mouse scroll wheel, adjusting the bar spacing (pixels per bar) centered on the cursor position
57. THE Chart_Library SHALL support horizontal zoom via pinch gesture on touch devices
58. THE Chart_Library SHALL support horizontal panning via click-and-drag on the chart area
59. THE Chart_Library SHALL support vertical zoom/pan on the price scale via mouse drag on the price scale area
60. THE Chart_Library SHALL implement momentum-based inertial scrolling for smooth pan deceleration
61. THE Chart_Library SHALL enforce minimum and maximum bar spacing limits (e.g., 2px to 100px per bar)

**Viewport Management:**

62. THE Chart_Library SHALL maintain a viewport state tracking the visible range (first visible bar index, bar count)
63. THE Chart_Library SHALL only render bars that fall within the visible viewport plus a small overscan buffer on each side
64. THE Chart_Library SHALL implement fitContent() to automatically adjust the viewport to show all available data
65. THE Chart_Library SHALL support scrollTo(barIndex) to center the view on a specific bar
66. THE Chart_Library SHALL support scrollToDate(timestamp) to center the view on a specific time

**Performance:**

67. THE Chart_Library SHALL use double buffering (offscreen canvas) to prevent flickering during redraws
68. THE Chart_Library SHALL batch canvas draw calls by style (color, lineWidth) to minimize state changes
69. THE Chart_Library SHALL support rendering 1000+ candles at 60fps on modern hardware
70. THE Chart_Library SHALL use path batching for line plots (single beginPath/stroke per style group instead of per-segment)
71. THE Chart_Library SHALL only redraw when state is dirty (data changed, viewport changed, or interaction occurred)

**Resize and Responsiveness:**

72. THE Chart_Library SHALL handle container resize via ResizeObserver, updating canvas dimensions and re-rendering
73. THE Chart_Library SHALL support configurable chart padding and margins
74. THE Chart_Library SHALL automatically adjust layout when the container size changes

**Data Binding:**

75. THE Chart_Library SHALL accept candlestick data as an array of {time, open, high, low, close, volume} objects
76. THE Chart_Library SHALL accept plot data as arrays of {time, value} with null gaps
77. THE Chart_Library SHALL accept shape markers as arrays of {time, position, shape, color, text}
78. THE Chart_Library SHALL accept fill definitions as {from, to, color} referencing plot series names
79. THE Chart_Library SHALL accept strategy markers as arrays of {type, name, direction, timestamp, color, comment}
80. THE Chart_Library SHALL accept drawing lines as arrays of {points: [{time, price}], color, width, style}
81. THE Chart_Library SHALL accept horizontal line definitions as {price, color, style}

**API Design:**

82. THE Chart_Library SHALL expose a `createChart(container, options)` factory function returning a chart instance
83. THE Chart_Library SHALL expose `chart.setCandles(data)` to update candlestick data
84. THE Chart_Library SHALL expose `chart.setVolume(data)` to update volume data
85. THE Chart_Library SHALL expose `chart.addPlotSeries(name, options)` returning a series handle for setting data
86. THE Chart_Library SHALL expose `chart.setMarkers(markers)` to set shape and strategy markers
87. THE Chart_Library SHALL expose `chart.setFills(fills)` to define fill areas between plot series
88. THE Chart_Library SHALL expose `chart.setLines(lines)` to set drawing lines
89. THE Chart_Library SHALL expose `chart.setHLines(hlines)` to set horizontal lines
90. THE Chart_Library SHALL expose `chart.removeSeries(name)` to remove a plot series
91. THE Chart_Library SHALL expose `chart.timeScale()` returning an object with `fitContent()`, `scrollTo()`, and `scrollToDate()` methods
92. THE Chart_Library SHALL expose `chart.applyOptions(options)` for runtime configuration changes
93. THE Chart_Library SHALL expose `chart.remove()` for cleanup and teardown
94. THE Chart_Library SHALL emit events: `onCrosshairMove`, `onVisibleRangeChange`, `onResize`

**Styling and Theming:**

95. THE Chart_Library SHALL support configurable background color, text color, grid color, and border colors via options
96. THE Chart_Library SHALL support a dark theme by default (background #1a1a2e, text #e0e0e0, grid #2a2a4e, border #0f3460)
97. THE Chart_Library SHALL support configurable font family and size for axis labels and tooltips
19. THE Frontend SHALL be a workspace package within the monorepo, importing `pine-framework` as a workspace dependency
20. THE Frontend SHALL NOT contain its own pnpm-lock.yaml or node_modules; all dependencies shall be managed by the root workspace