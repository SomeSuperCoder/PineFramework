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
10. THE Parser SHALL support switch expressions with all Pine v6 semantics including local block scoping, arrow syntax (=>), and conditional branching
11. THE Parser SHALL support type-inferred array declarations (array.new_<type>() returning array<elementType>)

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
8. THE Type_System SHALL support generic array operations (size, first, last, shift, pop, push, unshift, insert, remove, contains, fill, set, get, sort, copy)
9. THE Type_System SHALL support method dispatch on numeric IDs for line and label objects enabling chained operations (e.g., lin.shift().delete(), line.get_x2(lin.first()))

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
15. THE Execution_Engine SHALL support incremental real-time bar execution via executeRealtimeBar() that processes a single new bar while preserving prior execution state
16. THE Execution_Engine SHALL maintain execution state snapshots across real-time bar updates to enable rollback on errors
17. WHEN a new bar is processed via executeRealtimeBar(), THE Execution_Engine SHALL return updated outputs (plots, shapes, fills, strategyMarkers) reflecting the current bar state
18. THE Execution_Engine SHALL execute switch expressions with full conditional branching and local block scoping
19. THE Execution_Engine SHALL support the syminfo namespace (tickerid, mintick, pointvalue, pricescale, currency) as built-in read-only variables
20. THE Execution_Engine SHALL treat logical AND/OR with na operands as false (Pine Script boolean semantics) instead of propagating na
21. THE Execution_Engine SHALL implement strict comparisons for ta.crossover (prev src <= prev cmp) and ta.crossunder (prev src >= prev cmp) and strict inequality for ta.pivothigh (>) and ta.pivotlow (<) to match TradingView semantics
22. THE Execution_Engine SHALL return line and label entries (LineEntry, LabelEntry) as part of the execution result alongside shapes, fills, and strategyMarkers
23. THE Execution_Engine SHALL dispatch line.* and label.* method calls on numeric IDs returned by line.new() and label.new(), supporting delete, get_*, and set_* methods via method dispatch
24. THE Execution_Engine SHALL compute indicator values for the currently forming (live) candle on every real-time tick or kline update, updating only the last bar's output without reprocessing historical bars, so that indicators track intra-bar price action in real time

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
11. THE TA_Engine SHALL implement ta.sar() with correct 2-bar initialization, parabolic SAR EP/AF tracking, and reversal logic matching TradingView
12. THE TA_Engine SHALL use per-call-site state isolation for ta.sma() and ta.ema() so multiple calls with different source series (e.g., ta.sma(high, 20) and ta.sma(low, 20)) do not share internal buffers

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
2. THE Plot_Engine SHALL support all plot.style_* enums (line, stepline, histogram, columns, area, areabr, circles, cross)
3. THE Plot_Engine SHALL support all size enums (tiny, small, normal, large, huge, auto)
4. THE Plot_Engine SHALL support all location enums (abovebar, belowbar, top, bottom, absolute)
5. THE Plot_Engine SHALL filter null values from plot data before rendering to prevent chart errors
6. THE Plot_Engine SHALL auto-detect plot titles from variable names when no explicit title is provided
7. THE Plot_Engine SHALL support named arguments for all plot functions
8. THE Plot_Engine SHALL support color, shape, and location namespace syntax (e.g., color.blue, shape.triangleup, location.abovebar)

**plot() — Display a series on the chart:**
9. WHEN plot(series, title, color, linewidth, style, trackprice, histbase, offset, join, editable, show_last, display) is called, THE Plot_Engine SHALL render the series with the specified parameters
10. THE Plot_Engine SHALL support style parameter values: line, stepline, histogram, columns, area, areabr, circles, cross
11. THE Plot_Engine SHALL support trackprice parameter to display a horizontal price line at the last value
12. THE Plot_Engine SHALL support histbase parameter to set the baseline for histogram and columns styles
13. THE Plot_Engine SHALL support offset parameter to shift the plot horizontally by a number of bars
14. THE Plot_Engine SHALL support join parameter to connect circles and cross style points with lines

**plotshape() — Display shapes/icons on bars:**
15. WHEN plotshape(series, title, style, location, color, offset, text, textcolor, editable, size, show_last, display) is called, THE Plot_Engine SHALL render shape markers at the specified locations
16. THE Plot_Engine SHALL support style values: shape.arrowup, shape.arrowdown, shape.circle, shape.square, shape.diamond, shape.triangleup, shape.triangledown, shape.cross, shape.xcross, shape.flag, shape.labelup, shape.labeldown
17. THE Plot_Engine SHALL position shapes at abovebar (above high), belowbar (below low), top, bottom, or absolute price levels
18. THE Plot_Engine SHALL render text labels alongside shapes when the text parameter is provided

**plotchar() — Display characters on bars:**
19. WHEN plotchar(series, title, char, location, color, offset, text, textcolor, editable, size, show_last, display) is called, THE Plot_Engine SHALL render characters at the specified locations
20. THE Plot_Engine SHALL render the char parameter as a text glyph at the computed bar/price position
21. THE Plot_Engine SHALL support unicode characters and custom symbols in the char parameter

**plotarrow() — Display directional arrows:**
22. WHEN plotarrow(series, title, colorup, colordown, offset, minheight, maxheight, editable, show_last, display) is called, THE Plot_Engine SHALL render directional arrows
23. THE Plot_Engine SHALL render upward arrows (colorup) for positive series values and downward arrows (colordown) for negative values
24. THE Plot_Engine SHALL scale arrow height between minheight and maxheight based on series magnitude

**hline() — Create horizontal lines:**
25. WHEN hline(price, title, color, linestyle, linewidth, editable, display) is called, THE Plot_Engine SHALL render a horizontal line at the specified price level across the full visible chart width
26. THE Plot_Engine SHALL support linestyle values: solid, dotted, dashed

**bgcolor() — Color chart background:**
27. WHEN bgcolor(color, offset, editable, show_last, title, display) is called, THE Plot_Engine SHALL color the chart background for bars where the color condition is truthy
28. THE Plot_Engine SHALL support conditional coloring where different bars have different background colors

**barcolor() — Color chart candles/bars:**
29. WHEN barcolor(color, offset, editable, show_last, title, display) is called, THE Plot_Engine SHALL override candle body colors for bars where the color condition is truthy
30. THE Plot_Engine SHALL color both the candle body and wick when barcolor is applied

**fill() — Fill area between plots or hlines:**
31. WHEN fill(plot1, plot2, color, title, editable, fillgaps) is called, THE Plot_Engine SHALL render a filled area between two plot series or hlines
32. THE Plot_Engine SHALL support the fillgaps parameter to control whether gaps in data are filled or skipped
33. THE Plot_Engine SHALL render fills as semi-transparent polygons with the specified color
34. THE Plot_Engine SHALL support the style parameter on plot() to render circles, cross, histogram, columns, stepline, and areabr visual styles
35. THE Plot_Engine SHALL maintain each plot as a single continuous series even when color varies per bar (no splitting into per-color variant series)
36. THE Plot_Engine SHALL support per-bar plot colors and per-bar fill colors, storing them as separate color data arrays alongside output values for fine-grained visual rendering
37. THE Plot_Engine SHALL pass bgcolor data through the execution result pipeline for chart background rendering

### Requirement 7: Drawing Objects

**User Story:** As a Pine Script developer, I want to draw objects on charts, so that I can mark significant events.

#### Acceptance Criteria

**label — Text labels on the chart:**
1. THE Drawing_Engine SHALL support label.new(x, y, text, xloc, yloc, color, style, textcolor, size, textalign, tooltip) to create text labels
2. THE Drawing_Engine SHALL support label.copy(id) to duplicate an existing label
3. THE Drawing_Engine SHALL support label.delete(id) to remove a label
4. THE Drawing_Engine SHALL support label.set_x(id, x), label.set_y(id, y), label.set_xy(id, x, y) to reposition labels
5. THE Drawing_Engine SHALL support label.set_text(id, text) to change label text
6. THE Drawing_Engine SHALL support label.set_color(id, color) to change label background color
7. THE Drawing_Engine SHALL support label.set_textcolor(id, color) to change label text color
8. THE Drawing_Engine SHALL support label.set_size(id, size) to change label size
9. THE Drawing_Engine SHALL support label.set_style(id, style) to change label style (label.style_none, label.style_label_up, label.style_label_down, label.style_label_left, label.style_label_right, label.style_label_center, label.style_label_lower_left, label.style_label_lower_right, label.style_label_upper_left, label.style_label_upper_right, label.style_square, label.style_diamond, label.style_circle, label.style_cross)
10. THE Drawing_Engine SHALL support label.set_tooltip(id, tooltip) to change tooltip text
11. THE Drawing_Engine SHALL support label.set_textalign(id, align) to change text alignment
12. THE Drawing_Engine SHALL support label.set_xloc(id, xloc) to change x positioning mode (bar_index, bar_time)
13. THE Drawing_Engine SHALL support label.set_yloc(id, yloc) to change y positioning mode (price, abovebar, belowbar)
14. THE Drawing_Engine SHALL support label.get_x(id), label.get_y(id), label.get_text(id) to read label properties

**line — Drawing lines on the chart:**
15. THE Drawing_Engine SHALL support line.new(x1, y1, x2, y2, xloc, extend, color, style, width) to create lines
16. THE Drawing_Engine SHALL support line.copy(id) to duplicate an existing line
17. THE Drawing_Engine SHALL support line.delete(id) to remove a line
18. THE Drawing_Engine SHALL support line.set_x1(id, x), line.set_x2(id, x), line.set_y1(id, y), line.set_y2(id, y) to change individual coordinates
19. THE Drawing_Engine SHALL support line.set_xy1(id, x, y), line.set_xy2(id, x, y) to change point coordinates
20. THE Drawing_Engine SHALL support line.set_color(id, color), line.set_style(id, style), line.set_width(id, width) to change line appearance
21. THE Drawing_Engine SHALL support line.set_extend(id, extend) to change extension mode (none, left, right, both)
22. THE Drawing_Engine SHALL support line.set_xloc(id, xloc) to change coordinate system
23. THE Drawing_Engine SHALL support line.get_x1(id), line.get_x2(id), line.get_y1(id), line.get_y2(id) to read coordinates
24. THE Drawing_Engine SHALL support line.get_price(id, x) to get the line's price value at a specific bar

**box — Rectangles on the chart:**
25. THE Drawing_Engine SHALL support box.new(left, top, right, bottom, border_color, border_width, border_style, extend, xloc, bgcolor, text, text_color, text_size, text_halign, text_valign, text_wrap, text_font_family) to create rectangles
26. THE Drawing_Engine SHALL support box.copy(id) to duplicate an existing box
27. THE Drawing_Engine SHALL support box.delete(id) to remove a box
28. THE Drawing_Engine SHALL support box.set_left(id, left), box.set_top(id, top), box.set_right(id, right), box.set_bottom(id, bottom) to change edges
29. THE Drawing_Engine SHALL support box.set_lefttop(id, left, top), box.set_rightbottom(id, right, bottom) to change corner positions
30. THE Drawing_Engine SHALL support box.set_bgcolor(id, color), box.set_border_color(id, color), box.set_border_width(id, width), box.set_border_style(id, style) to change appearance
31. THE Drawing_Engine SHALL support box.set_text(id, text), box.set_text_color(id, color), box.set_text_size(id, size), box.set_text_halign(id, align), box.set_text_valign(id, align) to change text properties
32. THE Drawing_Engine SHALL support box.set_extend(id, extend) to change extension mode
33. THE Drawing_Engine SHALL support box.get_left(id), box.get_top(id), box.get_right(id), box.get_bottom(id) to read coordinates

**polyline — Multi-point lines (Pine v6):**
34. THE Drawing_Engine SHALL support polyline.new(points, curved, closed, xloc, line_color, fill_color, line_style, line_width) to create polylines/polygons
35. THE Drawing_Engine SHALL support polyline.delete(id) to remove a polyline
36. THE Drawing_Engine SHALL render curved polylines using bezier interpolation when curved=true
37. THE Drawing_Engine SHALL close the path when closed=true, creating a polygon

**linefill — Fill between two lines:**
38. THE Drawing_Engine SHALL support linefill.new(line1, line2, color) to create a filled area between two line objects
39. THE Drawing_Engine SHALL support linefill.delete(id) to remove a linefill
40. THE Drawing_Engine SHALL support linefill.set_color(id, color) to change fill color
41. THE Drawing_Engine SHALL support linefill.get_line1(id), linefill.get_line2(id) to get the referenced lines

**table — Floating data tables:**
42. THE Drawing_Engine SHALL support table.new(position, columns, rows, bgcolor, frame_color, frame_width, border_color, border_width) to create floating tables
43. THE Drawing_Engine SHALL support table.cell(id, column, row, text, width, height, text_color, text_size, bgcolor, tooltip, text_halign, text_valign) to create or update cells
44. THE Drawing_Engine SHALL support table.clear(id) to clear all cells
45. THE Drawing_Engine SHALL support table.delete(id) to remove a table
46. THE Drawing_Engine SHALL support table.merge_cells(id, start_column, start_row, end_column, end_row) to merge cell ranges
47. THE Drawing_Engine SHALL support table.cell_set_text(id, column, row, text), table.cell_set_bgcolor(id, column, row, color), table.cell_set_text_color(id, column, row, color), table.cell_set_text_size(id, column, row, size), table.cell_set_width(id, column, row, width), table.cell_set_height(id, column, row, height), table.cell_set_tooltip(id, column, row, tooltip), table.cell_set_text_halign(id, column, row, align), table.cell_set_text_valign(id, column, row, align) for individual cell property updates
48. THE Drawing_Engine SHALL render tables as overlay elements positioned at top, middle, or bottom of the chart in left, center, or right positions

**chart.point — Coordinate positioning objects:**
49. THE Drawing_Engine SHALL support chart.point.new(x, y) to create coordinate points
50. THE Drawing_Engine SHALL support chart.point.now() to create a point at the current bar
51. THE Drawing_Engine SHALL support chart.point.from_index(bar_index) to create a point from a bar index
52. THE Drawing_Engine SHALL support chart.point.from_time(timestamp) to create a point from a timestamp
53. THE Drawing_Engine SHALL support chart.point.copy(point) to duplicate a point

**Drawing object management:**
54. THE Drawing_Engine SHALL enforce max_labels_count, max_lines_count, max_boxes_count, max_polylines_count limits
55. THE Drawing_Engine SHALL support all xloc modes (bar_index, bar_time)
56. THE Drawing_Engine SHALL support all yloc modes (price, abovebar, belowbar)
57. THE Drawing_Engine SHALL support all extend modes (none, left, right, both)
58. THE Drawing_Engine SHALL render all drawing objects on the canvas at the correct bar index and price level positions
59. THE Drawing_Engine SHALL update drawing object positions when the chart is zoomed or panned
60. THE Drawing_Engine SHALL wire line.new() and label.new() through the full execution pipeline: engine creates LineEntry/LabelEntry data returned in execution result, backend serializes and forwards it, frontend renders drawing lines and labels on the canvas chart at correct bar index and price level positions
61. THE Drawing_Engine SHALL support na() function calls on drawing object IDs (returns true if the object handle is na)
62. THE Drawing_Engine SHALL render drawing lines on the canvas as solid, dotted, or dashed line segments between coordinate points with configurable color, width, and extend modes
63. THE Drawing_Engine SHALL render labels on the canvas as styled rectangular boxes with rounded corners, background color, border, and configurable text properties at the specified bar index and price level

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
21. THE Strategy_Engine SHALL support strategy.entry() with comment, stop, and limit parameters in addition to existing parameters
22. THE Strategy_Engine SHALL support strategy.exit() with comment, stop, and limit parameters in addition to existing parameters
23. WHEN strategy.entry() is called, THE Strategy_Engine SHALL default the entry marker name to "Long" for long entries and "Short" for short entries when no comment is provided
24. WHEN strategy.entry() is called with a comment parameter, THE Strategy_Engine SHALL use the comment text as the entry marker name
25. WHEN strategy.exit() is called, THE Strategy_Engine SHALL format the exit marker name as "Exit {name}" by default
26. WHEN strategy.exit() is called with a comment parameter, THE Strategy_Engine SHALL use the comment text as the exit marker name instead of the default format
27. THE Strategy_Engine SHALL support named arguments (comment, stop, limit) for strategy.entry() and strategy.exit() calls
28. WHEN strategy.close() is called, THE Strategy_Engine SHALL format the close marker name as "Exit {name}" matching the exit marker convention

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
10. THE Test_Framework SHALL include real-world indicator compatibility tests that parse, compile, and execute full complex indicators from `test_indicators/` directory to ensure production readiness

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
2. WHEN alert() is called, THE Alert_System SHALL trigger notifications with the specified frequency
3. WHEN alertcondition() is called, THE Alert_System SHALL create named alert conditions visible in the UI
4. THE Alert_System SHALL format alert messages with Pine's template syntax ({{close}}, {{open}}, {{high}}, {{low}}, {{time}}, {{interval}})
5. THE Alert_System SHALL prevent duplicate alerts within configurable time windows
6. THE Alert_System SHALL support multiple alert destinations (email, webhook, popup, etc.)
7. THE Alert_System SHALL log all alert events for auditing
8. THE Alert_System SHALL display alertcondition() in the indicator settings UI

**alert() — Trigger immediate alerts:**
9. WHEN alert(message, alert_freq) is called, THE Alert_System SHALL trigger an alert with the specified message text
10. THE Alert_System SHALL support alert_freq values: alert.freq_once_per_bar, alert.freq_once_per_bar_close, alert.freq_all, alert.freq_max_per_bar
11. THE Alert_System SHALL support template variables in message: {{plot_0}}, {{plot_1}}, {{plot_2}}, etc. for referencing plot values
12. THE Alert_System SHALL support template variables: {{close}}, {{open}}, {{high}}, {{low}}, {{volume}}, {{time}}, {{interval}}
13. THE Alert_System SHALL render alert markers on the chart at the bar where the alert triggered

**alertcondition() — Create alert conditions for UI:**
14. WHEN alertcondition(condition, title, message) is called, THE Alert_System SHALL register a named alert condition
15. THE Alert_System SHALL render alert condition names in the indicator's alert settings panel
16. THE Alert_System SHALL support multiple alertcondition() calls per script, each with a unique title

**Telegram Bot Notifications (Telegraf):**
17. THE Alert_System SHALL deliver alert messages to Telegram users via a bot powered by the Telegraf library (v4+, Bot API v7.1 compatible)
18. THE Telegram_Bot SHALL use Telegraf's `Telegraf` class for long-polling or webhook-based update delivery
19. WHEN a Pine Script alert condition triggers, THE Telegram_Bot SHALL format the alert message and send it to configured Telegram chat IDs via `ctx.telegram.sendMessage()`
20. THE Telegram_Bot SHALL support sending rich alert messages including MarkdownV2-formatted text with OHLCV values, indicator values, and plot references using Telegraf's `replyWithMarkdownV2()`
21. THE Telegram_Bot SHALL support sending chart screenshots with alert messages via `ctx.telegram.sendPhoto()` with the current chart canvas as a buffer
22. THE Telegram_Bot SHALL provide a `/start` and `/help` command handler via `bot.command()` for user onboarding and available command listing
23. THE Telegram_Bot SHALL support a `/subscribe` command to register a chat for automatic alert delivery, storing subscriptions persistently in `backend/data/telegram.json`
24. THE Telegram_Bot SHALL support a `/unsubscribe` command to remove a chat from the alert delivery list
25. THE Telegram_Bot SHALL run as a long-running service integrated with the Backend, using `bot.launch()` with graceful `SIGINT`/`SIGTERM` shutdown via `bot.stop()`
26. THE Telegram_Bot SHALL integrate Telegraf's middleware system (`bot.use()`) for logging, rate-limiting, and authorization checks before command execution
27. THE Telegram_Bot SHALL persist all configuration and subscriptions in a single `backend/data/telegram.json` file using synchronous reads/writes with file-locking to prevent corruption
28. THE `backend/data/telegram.json` file SHALL use a schema with top-level keys: `botToken`, `subscribers` (array of `{chatId, username, subscribedAt, alerts: [{id, title, enabled}]}`), and `settings` (extensible object for future preferences)
29. THE Telegram_Bot SHALL create the `backend/data/` directory and `telegram.json` file automatically on first launch if they do not exist, initializing with sensible defaults (empty subscribers, no token)
30. THE Telegram_Bot SHALL reload the JSON file from disk on each read to support manual edits and external backup/restore workflows

**SOCKS5 Proxy for Telegram Bot:**
31. THE Telegram_Bot SHALL route all Telegram Bot API connections through a SOCKS5 proxy
32. THE Telegram_Bot SHALL read SOCKS5 proxy configuration (host, port, username, password) from the `proxy` key in the `settings` object of `backend/data/telegram.json`
33. THE Telegram_Bot SHALL expose SOCKS5 proxy settings via REST API endpoints `GET /api/settings/telegram/proxy` and `PUT /api/settings/telegram/proxy`
34. THE Frontend SHALL provide a SOCKS5 proxy configuration UI in the Telegram settings panel with fields for host, port, username, and password
35. WHEN no SOCKS5 proxy is configured, THE Telegram_Bot SHALL connect directly to the Telegram Bot API (backward compatible)

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
4. WHEN the user clicks Run in the editor, THE Frontend SHALL send the script to the Backend for compilation and execution, then render the results on the chart
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
26. WHEN new candle data arrives via WebSocket, THE Frontend SHALL automatically trigger script re-execution with the updated bar set
27. THE Frontend SHALL store the last submitted script code in memory for automatic re-execution on new data
28. THE Frontend SHALL update indicator overlays (plots, shapes, fills, strategy markers) on the chart automatically when new execution results arrive via WebSocket

**Strategy Results Popup:**
29. WHEN the user clicks Run and the script returned strategy markers (indicating a strategy, not an indicator), THE Frontend SHALL display a "View Backtest Results" button on the chart
30. WHEN the user clicks "View Backtest Results", THE Frontend SHALL open a nearly full-screen popup overlay (centered, ~90% viewport) showing the strategy backtest results
31. THE Strategy Results popup SHALL use default settings auto-extracted from the strategy() declaration (initial_capital, commission_value, slippage, pyramiding, default_qty_value, default_qty_type, margin_long, margin_short)
32. THE Strategy Results popup SHALL provide a settings button (gear icon) that opens a compact settings overlay within the popup for tweaking strategy parameters
33. WHEN the user modifies settings and clicks "Run Backtest", THE Frontend SHALL send a backtest request to the Backend with the updated parameters
34. THE Backend SHALL run the backtest asynchronously, returning progress updates and a final result with metrics, trades, and equity curve
35. THE Strategy Results popup SHALL display key performance metrics (net profit, win rate, profit factor, Sharpe, max drawdown, Sortino, total trades, commission), an equity/drawdown chart, and a sortable trade list

**Lazy Loading and Re-Execution:**
36. THE Frontend SHALL support lazy loading of historical OHLCV data when scrolling the chart backwards, fetching older bars on demand from the Backend via an `end` timestamp parameter
37. WHEN the user scrolls near the start of loaded data (less than 50 bars remaining), THE Frontend SHALL automatically fetch the next batch of older bars and prepend them to the chart
38. THE Frontend SHALL maintain scroll position when prepending historical data by adjusting the viewport offset, preventing visual scroll jump or teleportation
39. THE Frontend SHALL batch candle data and indicator updates into a single React render cycle to prevent visual flicker during lazy loading
40. THE Frontend SHALL automatically re-execute the active Pine Script when the symbol or timeframe changes, ensuring indicators compute against the correct bar set

**Indicator Alignment and Stale Session Guards:**
41. THE Backend SHALL include `barTimestamps` (a number array of timestamps parallel to the output arrays) in both REST `/api/execute` and WebSocket `execution_result` responses, so the frontend can time-align plots independently of `ohlcvDataRef`
42. THE Frontend SHALL use `barTimestamps` from the execution response when constructing plot data, falling back to `ohlcvData` timestamps only when `barTimestamps` is unavailable — making plot data self-describing regardless of `ohlcvDataRef` divergence
43. THE Frontend SHALL validate output array length against both `barTimestamps.length` (when present) and `ohlcvData.length` (with ±1 tolerance for kline timing) in `handleExecutionResult()`, rejecting stale WebSocket session results whose output count mismatches the frontend's candle count
44. WHEN a new `execute` command arrives via WebSocket, THE Backend SHALL nullify the old `ScriptSession` before creating a new one, preventing the prior session from continuing to emit kline-driven `execution_result` messages with outdated bar counts

**Lines, Labels, and Per-Bar Rendering:**
45. THE Frontend SHALL render drawing lines (created via line.new()) on the canvas chart at correct bar index and price level positions with configurable color, width, style, and extend modes
46. THE Frontend SHALL render labels (created via label.new()) on the canvas chart as styled rectangular boxes with configurable background color, text, border, and position
47. THE Frontend SHALL render per-bar plot colors for line, stepline, histogram, and columns styles when the script supplies per-bar color data
48. THE Frontend SHALL render per-bar fill color overlays on top of the base fill polygon when the script supplies per-bar fill color data

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
17. THE Backend SHALL include a `comment` field in each strategy marker object returned in the POST /api/execute response
18. THE Backend SHALL persist the execution engine instance per WebSocket client session so that incremental real-time bar updates can be applied without re-parsing or re-compiling
19. WHEN a new kline arrives via the Bybit WebSocket, THE Backend SHALL automatically re-execute the active script's execution engine with the updated bar data using incremental mode
20. THE Backend SHALL push updated execution results (plots, shapes, fills, strategyMarkers) to the corresponding WebSocket client as a new message type `execution_result`
21. THE Backend SHALL support WebSocket message type `execution_result` containing the full updated script outputs so the frontend can refresh indicator overlays without re-fetching
22. THE Backend SHALL accept an `offset` parameter in POST /api/execute to return only output for newly added bars, reducing payload size during lazy loading while the engine still processes all bars internally for state continuity
23. THE Backend SHALL include bgcolor data in POST /api/execute and WebSocket execution_result responses
24. THE Backend SHALL include per-bar plot color data and per-bar fill color data in execution responses for fine-grained canvas rendering
25. THE Backend SHALL include line objects (LineEntry mapped to DrawingLineData) and label objects (LabelData) in execution responses for canvas rendering
26. THE Backend SHALL extend GET /api/ohlcv to accept an `end` timestamp parameter for fetching bars older than a given time point (lazy loading)

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
30. THE Chart_Library SHALL render per-bar plot colors for line, stepline, histogram, and columns styles when supplied as per-point color data alongside the value array

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
41. THE Chart_Library SHALL draw per-bar fill color overlay segments on top of the base fill polygon when per-bar color data is supplied, enabling fine-grained color control across bars
42. THE Chart_Library SHALL not apply additional globalAlpha reduction beyond the color's own alpha channel to prevent fill segments from becoming invisible

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

**Drawing Line and Label Rendering:**

49. THE Chart_Library SHALL render drawing lines (line.new objects) as line segments between coordinate points with configurable color, width (1-4px), and style (solid, dotted, dashed)
50. THE Chart_Library SHALL support extend modes for drawing lines (none, left, right, both) extending the line beyond endpoint coordinates
51. THE Chart_Library SHALL render labels (label.new objects) as rounded rectangular boxes with configurable background color, text color, border, font size, and text alignment
52. THE Chart_Library SHALL support all label styles (label_up, label_down, label_left, label_right, label_center, square, diamond, circle, cross) with correct visual rendering

**Crosshair:**

53. THE Chart_Library SHALL render a crosshair cursor following the mouse position with a vertical line through the hovered bar and a horizontal line at the hovered price
54. THE Chart_Library SHALL display a data window tooltip showing OHLCV values and indicator values for the hovered bar
55. THE Chart_Library SHALL snap the vertical crosshair line to the nearest bar center
56. THE Chart_Library SHALL render price and time labels on the axes at the crosshair position

**Grid:**

57. THE Chart_Library SHALL render a grid of horizontal lines at price scale tick intervals
58. THE Chart_Library SHALL render a grid of vertical lines at time scale major tick intervals
59. THE Chart_Library SHALL use subtle, low-opacity colors for grid lines (e.g., #2a2a4e)

**Interaction — Zoom and Pan:**

60. THE Chart_Library SHALL support horizontal zoom via mouse scroll wheel, adjusting the bar spacing (pixels per bar) centered on the cursor position
61. THE Chart_Library SHALL support horizontal zoom via pinch gesture on touch devices
62. THE Chart_Library SHALL support horizontal panning via click-and-drag on the chart area
63. THE Chart_Library SHALL support vertical zoom/pan on the price scale via mouse drag on the price scale area
64. THE Chart_Library SHALL implement momentum-based inertial scrolling for smooth pan deceleration
65. THE Chart_Library SHALL enforce minimum and maximum bar spacing limits (e.g., 2px to 100px per bar)

**Viewport Management:**

66. THE Chart_Library SHALL maintain a viewport state tracking the visible range (first visible bar index, bar count)
67. THE Chart_Library SHALL only render bars that fall within the visible viewport plus a small overscan buffer on each side
68. THE Chart_Library SHALL implement fitContent() to automatically adjust the viewport to show all available data
69. THE Chart_Library SHALL support scrollTo(barIndex) to center the view on a specific bar
70. THE Chart_Library SHALL support scrollToDate(timestamp) to center the view on a specific time
71. THE Chart_Library SHALL maintain a price range with two modes: auto (computed from visible candles and plots) and manual (set by user interaction)
72. THE Chart_Library SHALL support vertical zoom on the price scale via mouse scroll wheel while holding Shift, adjusting the visible price range centered on the cursor
73. THE Chart_Library SHALL support vertical pan and zoom on the price scale via mouse drag on the price scale area, adjusting the visible price range
74. THE Chart_Library SHALL reset to auto price range and fit content on double-click, restoring automatic price range computation
75. THE Chart_Library SHALL filter non-finite and near-zero plot values when computing the auto price range to prevent chart distortion
76. THE Chart_Library SHALL clamp the auto price range to at most 10 times the candle price range to prevent excessive vertical scaling when plot values far exceed candle prices
77. THE Chart_Library SHALL support prepending bars to the data set with automatic viewport adjustment (adjustForPrepend) to prevent scroll position jump when older bars are loaded
78. THE Chart_Library SHALL provide beginUpdate/endUpdate batch update API to defer rendering until multiple indicator updates are complete, ensuring all visual elements update in a single frame

**Performance:**

79. THE Chart_Library SHALL use double buffering (offscreen canvas) to prevent flickering during redraws
80. THE Chart_Library SHALL batch canvas draw calls by style (color, lineWidth) to minimize state changes
81. THE Chart_Library SHALL support rendering 1000+ candles at 60fps on modern hardware
82. THE Chart_Library SHALL use path batching for line plots (single beginPath/stroke per style group instead of per-segment)
83. THE Chart_Library SHALL only redraw when state is dirty (data changed, viewport changed, or interaction occurred)

**Resize and Responsiveness:**

84. THE Chart_Library SHALL handle container resize via ResizeObserver, updating canvas dimensions and re-rendering
85. THE Chart_Library SHALL support configurable chart padding and margins
86. THE Chart_Library SHALL automatically adjust layout when the container size changes

**Data Binding:**

87. THE Chart_Library SHALL accept candlestick data as an array of {time, open, high, low, close, volume} objects
88. THE Chart_Library SHALL accept plot data as arrays of {time, value} with null gaps
89. THE Chart_Library SHALL accept shape markers as arrays of {time, position, shape, color, text}
90. THE Chart_Library SHALL accept fill definitions as {from, to, color} referencing plot series names
91. THE Chart_Library SHALL accept strategy markers as arrays of {type, name, direction, timestamp, color, comment}
92. THE Chart_Library SHALL accept drawing lines as arrays of {points: [{time, price}], color, width, style}
93. THE Chart_Library SHALL accept drawing labels as arrays of {time, price, text, color, textcolor, style, size}
94. THE Chart_Library SHALL accept horizontal line definitions as {price, color, style}
95. THE Chart_Library SHALL accept per-bar plot color data and per-bar fill color data alongside value arrays

**API Design:**

96. THE Chart_Library SHALL expose a `createChart(container, options)` factory function returning a chart instance
97. THE Chart_Library SHALL expose `chart.setCandles(data)` to update candlestick data
98. THE Chart_Library SHALL expose `chart.setVolume(data)` to update volume data
99. THE Chart_Library SHALL expose `chart.addPlotSeries(name, options)` returning a series handle for setting data
100. THE Chart_Library SHALL expose `chart.setMarkers(markers)` to set shape and strategy markers
101. THE Chart_Library SHALL expose `chart.setFills(fills)` to define fill areas between plot series
102. THE Chart_Library SHALL expose `chart.setLines(lines)` to set drawing lines
103. THE Chart_Library SHALL expose `chart.setLabels(labels)` to set drawing labels
104. THE Chart_Library SHALL expose `chart.setHLines(hlines)` to set horizontal lines
105. THE Chart_Library SHALL expose `chart.removeSeries(name)` to remove a plot series
106. THE Chart_Library SHALL expose `chart.timeScale()` returning an object with `fitContent()`, `scrollTo()`, and `scrollToDate()` methods
107. THE Chart_Library SHALL expose `chart.applyOptions(options)` for runtime configuration changes
108. THE Chart_Library SHALL expose `chart.remove()` for cleanup and teardown
109. THE Chart_Library SHALL emit events: `onCrosshairMove`, `onVisibleRangeChange`, `onResize`, `onPriceRangeChange`

**Styling and Theming:**

110. THE Chart_Library SHALL support configurable background color, text color, grid color, and border colors via options
111. THE Chart_Library SHALL support a dark theme by default (background #1a1a2e, text #e0e0e0, grid #2a2a4e, border #0f3460)
112. THE Chart_Library SHALL support configurable font family and size for axis labels and tooltips

**Frontend Requirements:**

113. THE Frontend SHALL be a workspace package within the monorepo, importing `pine-framework` as a workspace dependency
114. THE Frontend SHALL NOT contain its own pnpm-lock.yaml or node_modules; all dependencies shall be managed by the root workspace

### Requirement 22: Strategy Backtest Engine

**User Story:** As a strategy developer, I want a full backtest engine that simulates order lifecycle, broker conditions, and produces comprehensive performance analytics, so that I can evaluate and optimize trading strategies against historical data.

#### Acceptance Criteria

**FR-1: Pine Script Backtest Compatibility**

1. THE Backtest_Engine SHALL parse and execute Pine Script v5/v6 strategy code using the existing execution runtime
2. THE Backtest_Engine SHALL respect strategy-specific parameters: `initial_capital`, `default_qty_value`, `default_qty_type`, `currency`, `pyramiding`, `commission_type/value`, `slippage`, `margin_long/short`
3. THE Backtest_Engine SHALL support multi-timeframe data via `request.security()` within backtest execution
4. THE Backtest_Engine SHALL emit `OrderRequest` events from strategy.*() functions instead of placing orders directly

**FR-2: Data Management for Backtesting**

5. THE Backtest_Engine SHALL ingest OHLCV data from CSV, REST API, and database sources
6. THE Backtest_Engine SHALL align timeframes (1m, 5m, 15m, 1h, 4h, 1D, 1W, 1M) for multi-timeframe strategies
7. THE Backtest_Engine SHALL handle missing data with forward-fill and gap handling
8. THE Backtest_Engine SHALL support user-configurable extended session data

**FR-3: Backtesting Engine Core**

9. THE Backtest_Engine SHALL process bars chronologically, executing strategy logic on each bar close
10. THE Backtest_Engine SHALL maintain state for all active orders, positions, margin, and equity
11. THE Backtest_Engine SHALL support intrabar order execution (bar magnifier) using lower-resolution data for sub-bar fills
12. THE Backtest_Engine SHALL allow backtesting from a user-defined date range with start/end dates

**FR-4: Order & Execution Simulation**

13. THE Backtest_Engine SHALL support order types: market, limit, stop, stop-limit
14. THE Backtest_Engine SHALL simulate order lifecycle: placement, acceptance, fill, expiry, cancellation
15. THE Backtest_Engine SHALL implement fill logic based on bar OHLC (intrabar) or bar close (next bar)
16. THE Backtest_Engine SHALL account for commission (per trade, per contract, percentage)
17. THE Backtest_Engine SHALL implement slippage model: fixed ticks/percentage, limit-order slippage, market-order slippage
18. THE Backtest_Engine SHALL support margin trading with initial and maintenance margin checks; liquidate positions when equity falls below maintenance margin
19. THE Backtest_Engine SHALL support pyramiding with configurable maximum entries in same direction
20. THE Backtest_Engine SHALL support trade size calculation: fixed contracts, percentage of equity, fixed cash amount

**FR-5: Performance Metrics**

21. THE Backtest_Engine SHALL compute Net Profit, Gross Profit, Gross Loss, Profit Factor
22. THE Backtest_Engine SHALL compute Sharpe Ratio and Sortino Ratio (annualized, using daily equity returns)
23. THE Backtest_Engine SHALL compute Max Drawdown (absolute and percentage) and Max Drawdown Duration
24. THE Backtest_Engine SHALL compute Average Trade (net profit per trade), Win Rate (percent profitable), Average Bars in Trade
25. THE Backtest_Engine SHALL provide per-trade statistics: entry/exit time, price, size, direction, P&L, percent return, bars held, MAE/MFE
26. THE Backtest_Engine SHALL generate equity curve (time series of equity and drawdown)
27. THE Backtest_Engine SHALL generate monthly returns heatmap

**FR-6: Visualization & Reporting**

28. THE Backtest_Engine SHALL overlay entry/exit markers on the price chart (using existing strategy marker rendering)
29. THE Backtest_Engine SHALL display equity curve and drawdown chart below the main price chart
30. THE Backtest_Engine SHALL provide an interactive results view with zoom, pan, and date range selection
31. THE Backtest_Engine SHALL export backtest reports as PDF, HTML, and CSV
32. THE Backtest_Engine SHALL provide a sortable trade list table with per-trade statistics

**FR-7: User Interface / API**

33. THE Backtest_Engine SHALL expose a Web-based configuration panel for strategy settings and broker emulator properties
34. THE Backtest_Engine SHALL expose a REST API to submit backtest jobs: `POST /api/backtest`
35. THE Backtest_Engine SHALL expose a REST API to query backtest job status: `GET /api/backtest/{job_id}`
36. THE Backtest_Engine SHALL expose a REST API to retrieve backtest results: `GET /api/backtest/{job_id}/result`
37. THE Backtest_Engine SHALL support real-time backtest progress with progress indicator via polling or WebSocket

**Non-Functional Requirements**

38. A single backtest on 1 million bars SHALL complete within 10 seconds (via JIT or transpilation to native code)
39. Fill simulation SHALL match TradingView's documented fill assumptions within 0.1% tolerance
40. THE Backtest_Engine SHALL support concurrent backtests via job queue
41. THE Backtest_Engine SHALL implement plugin architecture for broker models, metrics, and data sources
42. THE Backtest_Engine SHALL sandbox script execution to prevent malicious code

**Data Models**

43. THE Backtest_Engine SHALL implement `Bar` data model: { time, open, high, low, close, volume }
44. THE Backtest_Engine SHALL implement `OrderRequest` model: { id, strategy_id, direction, qty, limit_price, stop_price, order_type, oca_group }
45. THE Backtest_Engine SHALL implement `Order` model: { id, request, status (pending/filled/cancelled), fill_price, fill_time, commission }
46. THE Backtest_Engine SHALL implement `Position` model: { symbol, direction, quantity, avg_entry_price, unrealized_pnl }
47. THE Backtest_Engine SHALL implement `Trade` model: { entry_order, exit_order, pnl, return, duration, mae, mfe }
48. THE Backtest_Engine SHALL implement `Account` model: { initial_capital, balance, equity, margin_used, free_margin }
49. THE Backtest_Engine SHALL implement `EquityPoint` model: { time, equity, drawdown }
50. THE Backtest_Engine SHALL implement `BacktestResult` model: { config, metrics, trades[], equity_curve[], orders[] }

**Order Fill Logic**

51. Market orders SHALL fill immediately at the next available price (next bar open plus slippage)
52. Limit orders SHALL fill when price crosses the limit level (longs: low <= limit; shorts: high >= limit)
53. Stop orders SHALL fill when price breaches the stop level (longs: high >= stop; shorts: low <= stop), converted to market after trigger
54. Stop-limit orders SHALL trigger like stop orders, then be placed as limit orders
55. Intrabar magnification SHALL resolve fill prices using lower-resolution bar data instead of bar OHLC only

**Broker Emulator Properties**

56. Commission SHALL be configurable via `commission_type` (percent, cash per contract, cash per order) and `commission_value`
57. Slippage SHALL be configurable in ticks, points, or percent
58. Margin SHALL be configurable via `initial_margin_rate` and `maintenance_margin_rate`; liquidation at `maintenance_margin_rate * position_value`
59. Default quantity SHALL support `contracts`, `percent_of_equity`, and `cash` modes
60. Currency SHALL be configurable for P&L denomination (e.g., USD)

**REST API Specification**

61. `POST /api/backtest` SHALL accept `{ script, symbol, timeframe, start_date, end_date, initial_capital, commission_type, commission_value, slippage, pyramiding, bar_magnifier, inputs }` and return `{ job_id }`
62. `GET /api/backtest/{job_id}` SHALL return `{ status (running/completed/failed), progress (0-100), result_url }`
63. `GET /api/backtest/{job_id}/result` SHALL return `{ metrics, equity_curve, trades, orders }`

### Requirement 23: Telegram Notification System and Persistent Storage

**User Story:** As a trader, I want to receive Telegram bot notifications when script alerts fire on the chart, and I want to choose which alerts trigger notifications, so that I stay informed of trading opportunities without being overwhelmed.

#### Acceptance Criteria

**Telegram Bot Integration:**

1. WHEN a script alert is triggered during chart rendering, THE Telegram_System SHALL send a notification message to the configured Telegram user via a Telegram Bot
2. THE Telegram_System SHALL format alert messages with alert message text, script name, symbol, timeframe, and timestamp
3. THE Telegram_System SHALL support sending notifications for both `alert()` and `alertcondition()` trigger events
4. THE Telegram_System SHALL handle Telegram API errors gracefully (rate limits, network failures) without disrupting chart rendering or script execution
5. THE Telegram_System SHALL provide a configuration UI to set the Telegram Bot Token and Telegram Username

**Alert Selection:**

6. THE Telegram_System SHALL allow users to enable/disable Telegram notifications per individual alert condition (per `alertcondition()` title or `alert()` call site)
7. THE Telegram_System SHALL display a toggle control for each alert in the indicator settings UI to select which alerts are sent to Telegram
8. BY DEFAULT, all alerts SHALL have Telegram notifications enabled
9. WHEN an alert is disabled from Telegram, THE Telegram_System SHALL still evaluate and fire the alert locally (display on chart) but SHALL NOT send the Telegram notification

**Persistent Storage:**

10. THE Database SHALL be introduced to store persistent configuration data
11. THE Database SHALL store the Telegram Bot Token and Telegram Username securely
12. THE Database SHALL store per-alert Telegram notification preferences (which alerts are enabled/disabled for Telegram)
13. THE Database SHALL persist data across application restarts
14. THE Database SHALL support read and write operations from both the Backend and the Frontend configuration UI