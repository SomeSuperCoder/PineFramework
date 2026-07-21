# Implementation Tasks (Preserved from legacy tasks.md)

**Status**: All 144 tasks completed
**Source**: Recovered from legacy tasks.md (3846 lines)
**Note**: Tasks marked with `*` were optional for MVP. All are now complete.

## Overview

This document preserves the complete implementation task list from the project's development history. The tasks document the incremental build-out of the Pine Script v5/v6 engine across 8 layers, monorepo restructuring, backend/frontend implementation, and ongoing feature enhancements. All tasks are marked complete.

## Tasks

- [x] 1. Setup project structure and core infrastructure
  - Create TypeScript project with proper build configuration
  - Set up testing framework (Jest/TypeScript)
  - Configure linting and code formatting
  - Define package.json with dependencies

- [x] 2. Implement language processing layer
  - [x] 2.1 Create Pine Script parser
    - Define Pine Script v6 grammar using ANTLR or custom parser
    - Implement tokenizer for Pine Script v6 syntax
    - Build AST data structures for all Pine constructs
    - Handle version detection (`//@version=6`)
  - [x] 2.2 Implement Pine Script compiler
    - Create type checking system for Pine types
    - Implement scope resolution and variable declaration validation
    - Build intermediate representation (IR) generation
    - Add syntax error reporting with line/column info
  - [x] 2.3 Implement Pine type system
    - Define TypeScript interfaces for Pine primitive types (int, float, bool, string, color)
    - Implement Series type with time-series semantics
    - Build type coercion system following Pine rules
    - Add `na` (not available) value handling
  - [x] 2.4 Write unit tests for parser and compiler
    - Test parsing of all Pine Script language constructs
    - Validate compiler type checking and error reporting
  - [x] 2.5 Write basic integration tests
    - Test parse-compile pipeline end-to-end
    - Validate error handling and edge cases

- [x] 3. Checkpoint - Language layer validation
  - Verify parser handles all Pine constructs
  - Confirm compiler type checking passes known patterns
  - Validate error messages are descriptive

- [x] 4. Implement execution layer
  - [x] 4.1 Create execution engine
    - Implement bar-by-bar execution loop
    - Build series state management across bars
    - Create scope and variable management
    - Implement series indexing (`close[1]`, etc.)
  - [x] 4.2 Implement built-in functions
    - Implement basic math functions (abs, sqrt, min, max, etc.)
    - Implement comparison and logical operators
    - Add Pine-specific built-ins (na, nz, etc.)
    - Create `plot()` function for output generation
  - [x] 4.3 Implement execution result types
    - Define output structures (shapes, fills, markers)
    - Create execution context and state tracking
  - [x] 4.4 Write unit tests for execution engine
    - Test bar-by-bar execution correctness
    - Validate built-in function outputs
  - [x] 4.5 Write integration tests
    - Test complete execution pipeline
    - Validate series semantics

- [x] 5. Checkpoint - Execution layer validation
  - Verify execution produces correct outputs
  - Confirm series semantics match expectations
  - Validate error handling and edge cases

- [x] 6. Implement data layer
  - [x] 6.1 Create data engine
    - Implement OHLCV data structures
    - Build data loading and caching
    - Handle data gaps and missing values
  - [x] 6.2 Implement request system
    - Build `request.security()` infrastructure
    - Implement multi-symbol data access
    - Handle data alignment across timeframes
  - [x] 6.3 Write unit tests for data layer
    - Test data loading and caching
    - Validate request system behavior
  - [x] 6.4 Write integration tests for data layer
    - Test data flow through engine
    - Validate multi-symbol access
  - [x] 6.5 Test edge cases
    - Empty data handling
    - Gap handling
    - Missing symbol behavior

- [x] 7. Implement analysis layer (Technical Analysis Engine)
  - [x] 7.1 Implement core TA functions
    - Moving averages (sma, ema, wma, etc.)
    - Oscillators (rsi, stoch, macd, etc.)
    - Volatility indicators (atr, bb, kc, etc.)
    - Volume indicators (obv, vwap, etc.)
  - [x] 7.2 Implement advanced TA functions
    - Statistical functions (correlation, covariance, stdev)
    - Pattern recognition
    - Custom indicator support
  - [x] 7.3 Write unit tests for TA functions
    - Test each function individually
    - Validate numerical precision
  - [x] 7.4 Write integration tests
    - Test TA functions in execution pipeline
    - Validate combined indicator usage
  - [x] 7.5 Performance tests
    - Benchmark TA function execution time
    - Test with large datasets

- [x] 8. Checkpoint - Data and analysis layer validation
  - Verify data loading and caching works
  - Confirm TA functions produce correct outputs
  - Validate multi-symbol data access

- [x] 9. Implement input and configuration system
  - [x] 9.1 Implement input types
    - `input.int()`, `input.float()`, `input.bool()`, `input.string()`
    - `input.color()`, `input.symbol()`, `input.timeframe()`
    - `input.source()`, `input.session()`
  - [x] 9.2 Build configuration management
    - Input parameter parsing
    - Default value handling
    - Constraint validation
  - [x] 9.3 Implement persistence
    - Save/load input configurations
    - Version-aware input handling
  - [x] 9.4 Write unit tests for input system
    - Test all input types
    - Validate constraint enforcement
  - [x] 9.5 Write integration tests
    - Test inputs in execution pipeline
    - Validate configuration persistence

- [x] 10. Implement rendering layer (Plot Engine)
  - [x] 10.1 Create plot engine
    - Implement `plot()` with line style
    - Support plot styles (line, histogram, columns, area, stepline, circles, cross)
    - Handle plot colors, transparency, and styling
  - [x] 10.2 Implement shape and fill engine
    - Implement `plotshape()` with shape types
    - Implement `fill()` between plots
    - Implement `hline()` for horizontal lines
  - [x] 10.3 Implement drawing engine
    - Lines (`line.new`, `line.set_*`, `line.delete`)
    - Labels (`label.new`, `label.set_*`, `label.delete`)
    - Boxes (`box.new`, `box.set_*`, `box.delete`)
    - Tables (`table.new`, `table.cell`, `table.set_*`, `table.delete`)
    - Polylines (`polyline.new`, `polyline.delete`)
    - Linefills (`linefill.new`, `linefill.set_*`, `linefill.delete`)
  - [x] 10.4 Writing unit tests for rendering
    - Test plot output generation
    - Validate shape and fill data structures
  - [x] 10.5 Write integration tests
    - Test plot engine in full execution pipeline
  - [x] 10.6 Implement visual overlay support
    - Support overlay mode rendering
    - Handle z-ordering for overlapping plots
  - [x] 10.7 Implement color system
    - Color constants (red, green, blue, etc.)
    - Color manipulation (`color.new()`, `color.rgb()`)
    - Transparency and blending
  - [x] 10.8 Write rendering tests
    - Visual output comparison
    - Color handling validation

- [x] 11. Checkpoint - Input and rendering layer validation
  - Verify input system processes all types correctly
  - Confirm plot engine generates correct visual output
  - Validate drawing objects

- [x] 12. Implement strategy layer
  - [x] 12.1 Create strategy engine
    - Implement `strategy.entry()`, `strategy.exit()`, `strategy.close()`, `strategy.cancel()`
    - Build position management
    - Implement order tracking
  - [x] 12.2 Implement backtesting engine
    - Historical strategy execution
    - Performance metrics calculation (net profit, Sharpe ratio, drawdown, etc.)
    - Trade logging and reporting
  - [x] 12.3 Write unit tests for strategy engine
    - Test order management
    - Validate position tracking
  - [x] 12.4 Write integration tests for strategy
    - Test strategy in full execution pipeline
  - [x] 12.5 Write backtesting tests
    - Validate metrics calculation
    - Test with sample strategies
  - [x] 12.6 Performance tests
    - Benchmark strategy execution
    - Test with large backtest datasets

- [x] 13. Implement extensibility layer (Plugin Architecture)
  - [x] 13.1 Create plugin registry
    - Define plugin interfaces
    - Build plugin discovery and loading
  - [x] 13.2 Implement plugin types
    - Function plugins
    - Type plugins
    - Renderer plugins
    - Data source plugins
  - [x] 13.3 Write unit tests for plugin system
    - Test plugin registration and loading
    - Validate plugin lifecycle
  - [x] 13.4 Write integration tests
    - Test plugin integration with engine
    - Validate plugin isolation

- [x] 14. Checkpoint - Strategy and extensibility layer validation
  - Verify strategy execution and backtesting work
  - Confirm plugin system loads and integrates correctly

- [x] 15. Implement performance optimization and scaling
  - [x] 15.1 Optimize data processing
    - Cache popular indicator calculations
    - Optimize OHLCV data access patterns
  - [x] 15.2 Optimize execution
    - Reduce memory allocation overhead
    - Implement efficient series storage
  - [x] 15.3 Write performance benchmarks
    - Measure execution time per bar
    - Track memory usage patterns
  - [x] 15.4 Scaling tests
    - Test with 10,000+ bars
    - Test with 100+ concurrent indicators

- [x] 16. Implement comprehensive testing framework
  - [x] 16.1 Set up automated test infrastructure
    - Configure CI pipeline configurations
    - Set up coverage reporting
  - [x] 16.2 Write property-based tests
    - Mathematical property verification
    - Round-trip testing
  - [x] 16.3 Write compatibility tests
    - TradingView output comparison framework
    - Cross-version compatibility tests

- [x] 17. Checkpoint - Performance and testing validation
  - Verify performance meets targets
  - Confirm test coverage is comprehensive
  - Validate compatibility test framework

- [x] 18. Integration and system wiring
  - [x] 18.1 Wire all layers together
    - Create engine facade/API
    - Build script loading pipeline (source → parse → compile → execute)
    - Implement data flow from data source through rendering
  - [x] 18.2 Write end-to-end integration tests
    - Full pipeline validation
    - Real-world script execution
  - [x] 18.3 System validation
    - End-to-end script execution test
    - Verify all layers work together
  - [x] 18.4 Documentation
    - API documentation
    - Usage examples

- [x] 19. Final checkpoint - Complete system validation
  - Run full test suite
  - Validate all checkpoints pass
  - Confirm system meets requirements

- [x] 20. Implement Script Declaration System
  - [x] 20.1 Implement `indicator()` declaration
    - Support all parameters (title, shorttitle, overlay, format, precision, scale)
    - Handle max_labels_count, max_lines_count, max_boxes_count, max_polylines_count
    - Support explicit_plot_zorder
  - [x] 20.2 Implement `strategy()` declaration
    - Support all strategy parameters (pyramiding, initial_capital, commission, slippage, etc.)
    - Handle default_qty_type, default_qty_value, close_entries_rule

- [x] 21. Build Canvas Charting Library
  - [x] 21.1 Create basic chart structure (PineChart class)
  - [x] 21.2 Implement CoordinateSystem (data↔pixel transforms)
  - [x] 21.3 Implement Viewport management (visible range, zoom, pan)
  - [x] 21.4 Implement LayoutManager (chart area, volume area, price scale, time scale)
  - [x] 21.5 Implement CandlestickRenderer (OHLCV bodies + wicks)
  - [x] 21.6 Implement VolumeRenderer (volume histogram bars)
  - [x] 21.7 Implement LineRenderer (line, stepline, dotted, dashed styles)
  - [x] 21.8 Implement AreaRenderer (fill between plots)
  - [x] 21.9 Implement MarkerRenderer (arrow up/down, circle, square, diamond, cross)
  - [x] 21.10 Implement GridRenderer (price/time grid lines)
  - [x] 21.11 Implement AxisRenderer (price scale labels, time scale labels)
  - [x] 21.12 Implement CrosshairRenderer (crosshair + tooltip)
  - [x] 21.13 Implement InteractionHandler (mouse/touch events for zoom, pan, hover)
  - [x] 21.14 Implement performance features (double buffering, dirty flag, RAF loop)
  - [x] 21.15 Implement HLineRenderer (horizontal lines)
  - [x] 21.16 Implement CharRenderer (text characters on bars)
  - [x] 21.17 Implement ArrowRenderer (directional arrows)
  - [x] 21.18 Implement BarColorRenderer (bar color overrides)
  - [x] 21.19 Implement BackgroundRenderer (background color fills)
  - [x] 21.20 Implement DrawingLineRenderer (drawing lines with extend modes)
  - [x] 21.21 Implement BoxRenderer (drawing boxes/rectangles)
  - [x] 21.22 Implement LabelRenderer (drawing labels with text, all styles)
  - [x] 21.23 Implement TableRenderer (floating data tables)
  - [x] 21.24 Implement PolylineRenderer (multi-point lines)
  - [x] 21.25 Implement LineFillRenderer (fill between two lines)
  - [x] 21.26 Implement StrategyMarkerRenderer (entry/exit/close markers)
  - [x] 21.27 Implement AlertMarkerRenderer (alert trigger markers)

- [x] 22. Checkpoint - Canvas Charting Library validation
  - Complete wire all drawing/alert builtins into execution engine
  - [x] 22.1 Wire all drawing/alert builtins into execution engine
    - label.*, line.*, box.*, polyline.*, linefill.*, table.*, chart.point.*, alert

- [x] 23. Restructure project as pnpm monorepo
  - [x] 23.1 Create pnpm-workspace.yaml
  - [x] 23.2 Restructure root as engine library package
  - [x] 23.3 Create backend workspace package
  - [x] 23.4 Create frontend workspace package
  - [x] 23.5 Configure build order and dev scripts

- [x] 24. Checkpoint - Monorepo validation
  - Verify workspace dependency resolution
  - Confirm build order is correct

- [x] 25. Implement Backend API Server
  - [x] 25.1 Create Express server with REST API
  - [x] 25.2 Implement POST /api/execute endpoint
  - [x] 25.3 Implement GET /api/ohlcv endpoint
  - [x] 25.4 Create WebSocket gateway for real-time updates
  - [x] 25.5 Implement WebSocket execute/subscribe protocol
  - [x] 25.6 Build ScriptSession manager for persistent execution
  - [x] 25.7 Implement data cache and connection management

- [x] 26. Checkpoint - Backend validation
  - Verify API endpoints work
  - Confirm WebSocket streaming functions

- [x] 27. Implement Bybit Exchange Integration
  - [x] 27.1 Implement Bybit REST API client for historical OHLCV
  - [x] 27.2 Implement Bybit WebSocket client for real-time klines
  - [x] 27.3 Normalize Bybit data format to engine's Bar interface
  - [x] 27.4 Handle WebSocket reconnection and heartbeat
  - [x] 27.5 Implement rate limiting for Bybit API compliance
  - [x] 27.6 Write Bybit adapter tests

- [x] 28. Checkpoint - Bybit integration validation
  - Verify historical data fetching works
  - Confirm real-time streaming is reliable

- [x] 29. Update Frontend to Integrate with Backend
  - [x] 29.1 Create frontend React application with Vite
  - [x] 29.2 Integrate with backend POST /api/execute endpoint
  - [x] 29.3 Implement WebSocket client for real-time updates
  - [x] 29.4 Wire chart rendering to backend execution results
  - [x] 29.5 Handle errors and loading states

- [x] 30. Final Checkpoint - Full System Validation with Canvas Chart
  - Run full end-to-end test with canvas charting
  - Verify all layers work together (engine → backend → frontend → canvas)
  - Validate real-time updates work correctly

- [x] 31. Enhance Parser for Named Arguments and Namespace Tokens
  - [x] 31.1 Support named arguments in function calls
  - [x] 31.2 Support namespace tokens (color, shape, location, strategy, indicator, library)
  - [x] 31.3 Support switch expressions with v6 semantics

- [x] 32. Enhance TA Engine with Real Implementations
  - [x] 32.1 Implement real ta.sma() using circular buffer
  - [x] 32.2 Implement real ta.ema() using exponential formula
  - [x] 32.3 Implement ta.crossover()/ta.crossunder() with state tracking
  - [x] 32.4 Implement ta.sar() with correct 2-bar initialization

- [x] 33. Enhance Plot Engine with Markers, Fills, and Auto-Detection
  - [x] 33.1 Implement plotshape() marker generation
  - [x] 33.2 Implement fill() between plots
  - [x] 33.3 Implement auto-detection of plot titles from variable names
  - [x] 33.4 Implement named arguments forwarding for built-in functions
  - [x] 33.5 Implement hline() with linestyle support
  - [x] 33.6 Implement barcolor() and bgcolor()

- [x] 34. Enhance Strategy Engine with Full Integration
  - [x] 34.1 Implement strategy.entry() with direction and size
  - [x] 34.2 Implement strategy.exit() with stop-loss and take-profit
  - [x] 34.3 Implement strategy.close() and strategy.cancel()
  - [x] 34.4 Implement strategy.position_size builtin
  - [x] 34.5 Implement strategy.openprofit builtin
  - [x] 34.6 Implement pyramiding support
  - [x] 34.7 Implement broker emulation for backtesting
  - [x] 34.8 Implement strategy risk functions
  - [x] 34.9 Implement strategy marker visualization

- [x] 35. Wire Shapes, Fills, and Strategy Markers Through Full Stack
  - [x] 35.1 Include shapes in execution result
  - [x] 35.2 Include fills in execution result
  - [x] 35.3 Include strategy markers in execution result
  - [x] 35.4 Forward through backend API/WebSocket responses
  - [x] 35.5 Render on frontend canvas chart
  - [x] 35.6 Test full stack pipeline

- [x] 36. Fix Execution Engine Edge Cases
  - [x] 36.1 Fix var/varip state persistence across bars
  - [x] 36.2 Implement incremental real-time bar execution (executeRealtimeBar)
  - [x] 36.3 Implement state snapshot management for rollback
  - [x] 36.4 Implement inclusive for-loop iteration

- [x] 37. Enhance Input and Time Functions
  - [x] 37.1 Implement string functions (str.contains, str.replace, str.substring, etc.)
  - [x] 37.2 Implement time functions (timestamp, year, month, dayofmonth, etc.)
  - [x] 37.3 Implement input.source(), input.symbol(), input.timeframe() types
  - [x] 37.4 Implement input.session() type

- [x] 38. Enhance Frontend Chart Rendering
  - [x] 38.1 Render shapes on canvas
  - [x] 38.2 Render fills on canvas
  - [x] 38.3 Render strategy markers on canvas
  - [x] 38.4 Enhance crosshair with OHLCV and indicator values
  - [x] 38.5 Implement chart legend with indicator names

- [x] 39. Enhance Backend Data Handling
  - [x] 39.1 Implement OHLCV data caching
  - [x] 39.2 Handle data gaps and missing values
  - [x] 39.3 Implement rate limiting for Bybit API
  - [x] 39.4 Implement graceful reconnection for WebSocket

- [x] 40. Add Complex Script Integration Tests
  - [x] 40.1 Test with multi-indicator scripts
  - [x] 40.2 Test with strategy scripts including entry/exit
  - [x] 40.3 Test with scripts using all plot functions
  - [x] 40.4 Test with real-world TradingView scripts

- [x] 41. Checkpoint - Full Feature Validation with Canvas Chart
  - Validate all features work end-to-end with canvas charting
  - Test shapes, fills, strategy markers on canvas
  - Verify full-stack integration

- [x] 42. Enhance Price Range and Chart Interaction
  - [x] 42.1 Implement manual price range mode
  - [x] 42.2 Implement vertical zoom on price scale (Shift+scroll)
  - [x] 42.3 Implement price scale drag for zoom
  - [x] 42.4 Implement double-click price scale reset

- [x] 43. Enhance Strategy Marker Naming and Parameters
  - [x] 43.1 Entry marker naming: defaults to "Long"/"Short", overridden by comment
  - [x] 43.2 Exit marker naming: defaults to "Exit {id}", overridden by comment
  - [x] 43.3 Close marker naming: "Exit {name}" convention
  - [x] 43.4 Support stop, limit, comment parameters in strategy.entry()/exit()
  - [x] 43.5 Support partial exit sizing via qty parameter
  - [x] 43.6 Support exit creation when flat with pending entry

- [x] 44. Checkpoint - Price Range and Strategy Naming Validation

- [x] 45. Implement Real-Time Indicator Re-Execution on New Candles
  - [x] 45.1 Store last submitted script in memory
  - [x] 45.2 Subscribe to WebSocket kline data
  - [x] 45.3 Auto-re-execute script on new candle
  - [x] 45.4 Update indicator overlays without user interaction
  - [x] 45.5 Re-execute on symbol/timeframe change
  - [x] 45.6 Render lines, labels, per-bar colors from execution results
  - [x] 45.7 Implement lazy loading of historical data on scroll
  - [x] 45.8 Maintain scroll position when prepending data

- [x] 46. Checkpoint - Real-Time Indicator Re-Execution Validation

- [x] 47. Implement Broker Simulator
  - [x] 47.1 Define order types (market, limit, stop)
  - [x] 47.2 Implement order fill logic with configurable fill price
  - [x] 47.3 Implement slippage modeling
  - [x] 47.4 Implement commission calculation
  - [x] 47.5 Implement position tracking (size, entry price, unrealized P&L)
  - [x] 47.6 Implement order queue and execution timing
  - [x] 47.7 Handle partial fills and order cancellation

- [x] 48. Implement Backtest Orchestrator
  - [x] 48.1 Create backtest context and configuration
  - [x] 48.2 Implement bar processing loop with strategy execution
  - [x] 48.3 Generate trade log with entry/exit details

- [x] 49. Implement Performance Metrics Calculator
  - [x] 49.1 Net Profit and Gross Profit/Loss
  - [x] 49.2 Max Drawdown and Drawdown %
  - [x] 49.3 Sharpe Ratio and Sortino Ratio
  - [x] 49.4 Win Rate, Profit Factor, Total Closed Trades
  - [x] 49.5 Avg Trade, Best Trade, Worst Trade, Avg Bars in Trades

- [x] 50. Implement Backtest REST API
  - [x] 50.1 POST /api/backtest endpoint
  - [x] 50.2 Accept backtest parameters (symbol, timeframe, date range, initial capital, commission)
  - [x] 50.3 Return backtest results (metrics, trade log, equity curve)

- [x] 51. Implement Backtest Visualization
  - [x] 51.1 Create BacktestResults component (dark theme)
  - [x] 51.2 Render equity curve and drawdown chart on canvas
  - [x] 51.3 Render sortable trades table
  - [x] 51.4 Display key metrics in grid layout

- [x] 52. Create Backtest Configuration Panel
  - [x] 52.1 Design settings panel UI
  - [x] 52.2 Implement initial capital, commission, slippage fields
  - [x] 52.3 Implement date range selection

- [x] 53. Implement Data Source Integration for Backtesting
  - [x] 53.1 Fetch historical data for backtest date range
  - [x] 53.2 Cache backtest data for repeat runs
  - [x] 53.3 Handle data gaps during backtest period

- [x]* 54. Write unit tests for broker simulator
- [x]* 55. Write unit tests for performance metrics
- [x]* 56. Write integration tests for backtest engine
- [x]* 57. Write performance tests for backtest engine

- [x] 58. Checkpoint - Backtest Engine Validation

- [x] 59. Implement Switch Expression Support
  - [x] 59.1 Parser support for switch expressions with arrow syntax
  - [x] 59.2 Compiler type checking for switch branches
  - [x] 59.3 Runtime execution with conditional branching
  - [x] 59.4 Switch-as-expression returning matched case value

- [x] 60. Implement Generic Array Methods and Line/Label Method Dispatch
  - [x] 60.1 Generic array methods (size, push, pop, shift, unshift, insert, remove, contains, fill, set, get, sort, copy)
  - [x] 60.2 Method dispatch on numeric IDs for line/label objects

- [x] 61. Implement Lines/Labels Full Frontend Pipeline
  - [x] 61.1 Forward line objects to frontend with coordinate conversion
  - [x] 61.2 Render lines on canvas with extend modes
  - [x] 61.3 Render labels on canvas with all styles
  - [x] 61.4 Update positions on zoom/pan

- [x] 62. Implement Per-Bar Plot and Fill Colors
  - [x] 62.1 Store per-bar plot colors as separate data array
  - [x] 62.2 Store per-bar fill colors as separate data array
  - [x] 62.3 Render per-bar color variations for line/stepline/histogram/columns
  - [x] 62.4 Render per-bar fill color overlays

- [x] 63. Fix TA Function Semantics and Add Missing Builtins
  - [x] 63.1 ta.sma() returns NA until sufficient data
  - [x] 63.2 ta.ema() correct exponential formula
  - [x] 63.3 ta.crossover()/crossunder() with proper <=/>= on prev bar
  - [x] 63.4 ta.pivothigh()/pivotlow() with strict comparisons
  - [x] 63.5 Per-call-site state isolation for TA functions

- [x] 64. Implement Lazy Loading of Historical Data
  - [x] 64.1 Fetch older bars via Backend `end` timestamp param
  - [x] 64.2 Prepend to chart data while maintaining scroll position
  - [x] 64.3 Batch candle and indicator updates into single render cycle
  - [x] 64.4 Use engine-generated barTimestamps for time-alignment
  - [x] 64.5 Validate output lengths against barTimestamps

- [x] 65. Fix TrendCraft ICT SwiftEdge Compatibility
  - [x] 65.1 Parse complex indicator without errors
  - [x] 65.2 Execute with bar-by-bar output matching expectations
  - [x] 65.3 Create debug version with intermediate value tracing

- [x] 66. Fix Plot Style and Rendering Enhancements
  - [x] 66.1 Support all plot.style_* enums
  - [x] 66.2 Support size enums (tiny, small, normal, large, huge, auto)
  - [x] 66.3 Support location enums (abovebar, belowbar, top, bottom, absolute)

- [x] 67. Fix Backend and Frontend Integration Issues
  - [x] 67.1 Handle non-JSON server responses gracefully
  - [x] 67.2 Validate WebSocket kline data before forwarding
  - [x] 67.3 Invalidate stale ScriptSessions before creating new ones
  - [x] 67.4 Comment field in strategy markers

- [x] 68. Checkpoint - Full System Validation

- [x] 69. Fix Indicator Alignment After Lazy Loading (BarTimestamps + Stale Session Guards)
  - [x] 69.1 Add barTimestamps to execution pipeline
  - [x] 69.2 Validate output lengths in handleExecutionResult
  - [x] 69.3 Guard against stale WebSocket sessions
  - [x] 69.4 Use barTimestamps for time-alignment fallback

- [x] 70. Implement JSON File Store for Persistent Storage
  - [x] 70.1 Create JsonStore CRUD service
  - [x] 70.2 Implement synchronous atomic reads/writes
  - [x] 70.3 Auto-create backend/data/ directory with defaults
  - [x] 70.4 Reload from disk on every read
  - [x] 70.5 File-locking to prevent concurrent write corruption

- [x] 73. Checkpoint - Telegram Notification and JSON File Persistence Validation

- [x] 74. Implement SOCKS5 Proxy Support for Telegram Bot
  - [x] 74.1 Read proxy settings from telegram.json
  - [x] 74.2 Create SOCKS5 agent on bot initialization
  - [x] 74.3 Fall back to direct connection when no proxy configured
  - [x] 74.4 Expose proxy configuration via REST API

- [x] 75. Implement real-time indicator computation for forming candles
  - [x] 75.1 Re-evaluate only the last bar on each tick
  - [x] 75.2 Push partial indicator updates to frontend
  - [x] 75.3 Support intra-bar price action tracking
  - [x] 75.4 Preserve engine state for confirmed bars

- [x] 76. Implement Script Bank Backend (JSON Store + REST API)
  - [x] 76.1 Create scripts.json data store
  - [x] 76.2 CRUD REST API endpoints
  - [x] 76.3 Persist active script selection across restarts
  - [x] 76.4 Auto-load active script into editor on startup

- [x] 77. Implement Script Bank Frontend UI
  - [x] 77.1 Script list panel with browse/search
  - [x] 77.2 Create/edit/delete script operations
  - [x] 77.3 Script selection with auto-load into editor
  - [x] 77.4 Script categories (indicators, strategies, libraries)
  - [x] 77.5 Active script persistence across reloads

- [x] 78. Checkpoint - Script Bank Validation

- [x] 79. Unify Script Editor — Replace ScriptBankPanel with Dropdown in CodeEditor
  - [x] 79.1 Replace separate ScriptBankPanel with dropdown inside CodeEditor
  - [x] 79.2 Auto-save on edit without re-executing chart
  - [x] 79.3 "Run" button executes and persists running script
  - [x] 79.4 Extract script names from source
  - [x] 79.5 Track runningScriptId across reloads
  - [x] 79.6 Single source of truth for script management

- [x] 80. Checkpoint - Unified Editor Validation

- [x] 81. Implement bar-close only alert dispatch
  - [x] 81.1 Suppress alert triggers during intra-bar updates
  - [x] 81.2 Fire notifications only on confirmed bar close
  - [x] 81.3 Prevent notification spam during live candle formation
  - [x] 81.4 Per-session lastConfirmedTimestamp dedup
  - [x] 81.5 Module-level recentAlertKeys set with LRU eviction
  - [x] 81.6 Stale WebSocket connection pruning
  - [x] 81.7 Fix series length drift in computeFormingCandle rollback

- [x] 82. Refactor forming-candle architecture — caller controls `isFormingCandle`
  - [x] 82.1 engine.setFormingCandle(true|false) API
  - [x] 82.2 Confirmed bars route through computeFormingCandle (not executeRealtimeBar)
  - [x] 82.3 Remove engine-level diffAlertTriggers suppression
  - [x] 82.4 Alert control fully delegated to gateway layer

- [x] 83. Improve CodeEditor UX
  - [x] 83.1 "Create Your First Script" empty state
  - [x] 83.2 Script name extraction on creation
  - [x] 83.3 Flash prevention by initializing currentCode as null

- [x] 84. Improve Telegram alert delivery reliability
  - [x] 84.1 Fix isActive() race condition (move this.isRunning before bot.launch)
  - [x] 84.2 MarkdownV2 plain-text fallback on parse errors
  - [x] 84.3 Comprehensive alert pipeline logging

- [x] 85. Fix stale-bar gap in WebSocket session creation
  - [x] 85.1 Use ohlcvDataRef.current instead of pendingExecuteRef.bars

- [x] 86. Implement Two-Pole Trend Filter Compatibility
  - [x] 86.1 Parser fixes: method keyword, compound assignments, type-first params, PascalCase guard
  - [x] 86.2 Runtime fixes: var persistence, namedArgs, method dispatch, compound assignment execution
  - [x] 86.3 New builtins: ta.atr, color.from_gradient, barcolor, nz, math constants
  - [x] 86.4 barColorData pipeline
  - [x] 86.5 plotshape title fix
  - [x] 86.6 Shape location.absolute rendering
  - [x] 86.7 Integration tests
  - [x] 86.8 ta.hma() WMA-based Hull Moving Average
  - [x] 86.9 plotchar()/plotcandle() builtins
  - [x] 86.10 display namespace (data_window, pane, none)

- [x] 87. Add Compatibility Implementation Prompt
  - [x] 87.1 Create prompts/compatibility-impl.md template

- [x] 88. Implement Volatility Trail Indicator Compatibility
  - [x] 88.1 Indentation-aware else-binding fix
  - [x] 88.2 const keyword support
  - [x] 88.3 ta.hma() implementation
  - [x] 88.4 plotchar()/plotcandle() builtins
  - [x] 88.5 display namespace constants
  - [x] 88.6 Variadic plot()/fill() builtins
  - [x] 88.7 AreaRenderer per-bar fill color fix
  - [x] 88.8 MarkerRenderer unicode shape support
  - [x] 88.9 14 integration tests
  - [x] 88.10 20 debugging methodologies for prompts
  - [x] 88.11 Full volatility-trail output matching

- [x] 89. Implement Pine Script v5 Compatibility Layer
  - [x] 89.1 v5 grammar rules in parser
  - [x] 89.2 v5 type coercion rules in compiler
  - [x] 89.3 v5-specific built-in functions
  - [x] 89.4 Version detection pipeline (parser through execution)
  - [x] 89.5 Backend version forwarding
  - [x] 89.6 Frontend version display
  - [x] 89.7 Comprehensive v5 tests

- [x] 90. Implement Separate Indicator Panes (overlay support)
  - [x] 90.1 IR/Engine overlay field
  - [x] 90.2 Backend overlay forwarding
  - [x] 90.3 Frontend LayoutManager pane allocation
  - [x] 90.4 PineChart per-pane coordinate space
  - [x] 90.5 Non-overlay indicator rendering in own pane
  - [x] 90.6 Independent price scales per pane
  - [x] 90.7 Synchronized crosshair across all panes
  - [x] 90.8 Synchronized X-axis (scroll/zoom) across panes
  - [x] 90.9 Pane resize by dragging boundaries
  - [x] 90.10 Horizontal separator lines between panes

- [x] 91. Fix indicator pane post-feature bugs and expand test coverage
  - [x] 91.1 Add 'simple' type qualifier to parser
  - [x] 91.2 Fix switch-as-expression to return matched case body value
  - [x] 91.3 Add layout recalculation on overlay count changes
  - [x] 91.4 Clip candlesticks/volume/overlays to prevent bleed-through
  - [x] 91.5 Expand integration tests (real MACD, input.source(), switch-in-function, overlay flags)

- [x] 92. Implement TradingView-style Chart Navigation Controls
  - [x] 92.1 Ctrl+scroll for fine-grained zoom
  - [x] 92.2 Middle mouse button free panning
  - [x] 92.3 Time axis drag for time-scale zoom
  - [x] 92.4 Double-click time axis reset
  - [x] 92.5 Consolidated double-click price scale reset
  - [x] 92.6 Momentum-based inertial scrolling

- [x] 93. Fix Chart Drag and Price Scale Drag Behavior
  - [x] 93.1 Chart area drag pans both horizontally and vertically
  - [x] 93.2 Price scale drag zooms vertically
  - [x] 93.3 Auto-fit all data on initial load using fitContent()

- [x] 94. Fix Real-time Indicator Data Alignment
  - [x] 94.1 Backend permanently advances engine state for confirmed bars (executeBar)
  - [x] 94.2 Frontend appends new plot data for new bars instead of replacing last entry

- [x] 95. Implement Indicator Pane Independent Price Scales
  - [x] 95.1 AxisRenderer per-pane price labels
  - [x] 95.2 Indicator pane clipping to allocated regions
  - [x] 95.3 Horizontal separator lines between panes

- [x] 96. Implement Indicator Pane Autoscale on Scroll
  - [x] 96.1 Recompute price range from visible indicator values
  - [x] 96.2 Filter output series to visible bar range
  - [x] 96.3 Compute min/max with vertical padding margin
  - [x] 96.4 Trigger on every onVisibleRangeChange event
  - [x] 96.5 Replace static price range
  - [x] 96.6 Ignore manual price range overrides for indicator panes

- [x] 97. Implement Dynamic Indicator Management UI
  - Rename "Run" button to "Add"
  - Append indicators to chart independently
  - Persist running indicator list to backend/data/indicators.json
  - Restore on backend restart
  - Cascade delete indicators when script removed from bank
  - Overlay indicator labels with delete buttons (top-left of main chart)
  - Non-overlay indicator labels with unplot buttons (top-left of pane)

- [x] 98. Checkpoint - Dynamic Indicator Management Validation

- [x] 99. Fix Multi-Indicator Rendering (Simplify to Add-All-Remove-Stale Pattern)
  - Fix fragile activeKeysRef/keyToTitlesRef diffing system
  - Simplify to flat pass: add all plot series, remove any not in current set
  - Fix indicator forming-candle routing (check msg.formingCandle)

- [x] 100. Implement Progressive Indicator Computation
  - [x] 100.1 Implement GET /api/bars endpoint (index-range-based fetching)
  - [x] 100.2 Build lookback seed data resolver
  - [x] 100.3 Implement frontend lookback seed loading
  - [x] 100.4 Build interruptible batch computation queue
  - [x] 100.5 Implement progressive computation on scroll
  - [x] 100.6 Implement instant catch-up path
  - [x] 100.7 Ensure realtime forming candle works with progressive model
  - [x] 100.8 Test progressive indicator computation
  - [x] 100.9 Add design spec for progressive computation

- [x] 101. Implement Time-Based Renderer Positioning
  - [x] 101.1 LineRenderer uses findBarIndex() for time-based matching
  - [x] 101.2 AreaRenderer uses time-based positioning
  - [x] 101.3 CrosshairRenderer uses time-based positioning
  - [x] 101.4 Immune to index shifts from prepending/WS drift
  - [x] 101.5 Remove direct index-based positioning

- [x] 102. Darken Chart and UI Theme
  - [x] 102.1 Update CSS custom properties (#1a1a2e → #0d0d18, etc.)
  - [x] 102.2 Update canvas renderer colors (AxisRenderer, CrosshairRenderer)
  - [x] 102.3 Update React component inline styles
  - [x] 102.4 Update all 15 files consistently

- [x] 103. Add Auto-Scale Toggle to Footer Bar
  - [x] 103.1 LayoutManager.forceAutoScale flag
  - [x] 103.2 Block manual price range operations when active
  - [x] 103.3 PineChart.setForceAutoScale() delegation
  - [x] 103.4 ChartComponent forceAutoScale prop
  - [x] 103.5 App.tsx autoScale state with toggle button

- [x] 104. Fix Scroll Re-Execution and Indicator Boundary Recomputation
  - [x] 104.1 Chronological execBars: [...newBars, ...contextBars]
  - [x] 104.2 prependIndicatorResult splits into newBarData + boundaryData
  - [x] 104.3 Context bars excluded from ohlcvDataRef
  - [x] 104.4 beginUpdate/endUpdate batching prevents flicker

- [x] 105. Fix TrendCraft Lowercase User-Defined Type Parsing
  - [x] 105.1 looksLikeUserTypeDecl() no PascalCase check in var/varip/const
  - [x] 105.2 Standalone context keeps PascalCase to prevent val\nx misparse
  - [x] 105.3 All 1047 backend tests pass

- [x] 106. Implement File-Based Script Storage with AI Agent Integration
  - [x] 106.1 External AI agents write .pine files to backend/data/scripts/
  - [x] 106.2 File watcher (chokidar) detects changes
  - [x] 106.3 Bidirectional sync between files and Script Bank
  - [x] 106.4 Filename sanitization rules
  - [x] 106.5 Script type auto-detection from source
  - [x] 106.6 Bulk import support
  - [x] 106.7 Conflict resolution
  - [x] 106.8 REST API endpoints for file metadata
  - [x] 106.9 AI agent conversation history storage
  - [x] 106.10 Versioned script modifications with diff records
  - [x] 106.11 AI code generation from natural language
  - [x] 106.12 AI code modification preserving existing logic
  - [x] 106.13 handlebars template engine integration
  - [x] 106.14 Error handling for AI service failures

- [x] 107. Checkpoint - File-Based Storage and AI Agent Integration Validation

- [x] 108. Built-In Test Indicators in Script Editor
  - [x] 108.1 Serve test_indicators/ via GET /api/scripts/built-in
  - [x] 108.2 Display in distinct "Built-In Tests" category
  - [x] 108.3 Mark as uneditable and undeletable
  - [x] 108.4 Support running on chart
  - [x] 108.5 Basic, intermediate, advanced, debug categories
  - [x] 108.6 Frontend "Built-In" badge
  - [x] 108.7 Type badges: [IND], [STG]
  - [x] 108.8 Script ID convention (built-in prefix)

- [x] 109. Fix Multi-Pane Layout for Non-Overlay Indicators
  - [x] 109.1 Count distinct paneIndices instead of plot series
  - [x] 109.2 Assign incrementing paneIndex per non-overlay indicator
  - [x] 109.3 Dynamically create/remove panes
  - [x] 109.4 Each pane has independent price scale
  - [x] 109.5 Test with multiple non-overlay indicators (MACD + RSI)
  - [x] 109.6 Maintain pane state on indicator add/remove
  - [x] 109.7 Fix all existing integration tests

- [x] 110. Add Kalman Trend Levels Indicator Support
- [x] 111. Add Box Rendering Support
- [x] 112. Add ta.change() Builtin
- [x] 113. Fix Compiler Bool Type for Comparisons
- [x] 114. Fix Strategy Overlay Default
- [x] 115. Fix strategy.entry NamedArgs qty Extraction
- [x] 116. Fix strategy.exit Flat Position with Pending Entry
- [x] 117. Fix extractStrategyParams strategy.* Prefix Stripping
- [x] 118. Fix Backtest Flow Issues
- [x] 119. Fix ScriptFileWatcher chokidar v5 Compatibility
- [x] 120. Add Frontend Integration Tests for Backtest Flow
- [x] 121. Fix Backtest 0 Trades Root Cause
- [x] 122. Implement Backtest Settings Workflow with Persistent Config and Days-Back Date Range
  - [x] 122.1 Rename "View Backtest Results" to "Run Backtest"
  - [x] 122.2 Settings-first flow (panel opens before backtest runs)
  - [x] 122.3 Persistent settings across sessions
  - [x] 122.4 Days-back input with toggle to traditional date picker
  - [x] 122.5 Settings read-only until first backtest run
  - [x] 122.6 Settings gear in results panel for re-running
  - [x] 122.7 Strategy parameter extraction from source
  - [x] 122.8 Settings integration with backend

- [x] 123. Fix bgcolor/fill not updating on forming candles
  - [x] 123.1 Move restoration after diff computation
  - [x] 123.2 Fix mergeDiffIntoResult to always append forming data points
  - [x] 123.3 Verify diffs are non-empty

- [x] 124. Simplify rendering pipeline with index-based positioning
  - [x] 124.1 Replace findBarIndex with direct index in LineRenderer
  - [x] 124.2 Replace findBarIndex with direct index in AreaRenderer
  - [x] 124.3 Remove validData filter that broke index alignment

- [x] 125. Implement FormingCandleManager module
  - [x] 125.1 Extract forming lifecycle from ScriptSession
  - [x] 125.2 Handle tick/confirm lifecycle
  - [x] 125.3 Handle barTimestamps padding and output conversion

- [x] 126. Implement Quick Indicator/Strategy Adder Popup
  - [x] 126.1 Small centered modal overlay on chart
  - [x] 126.2 Auto-focused search bar
  - [x] 126.3 Merged list (user + built-in scripts)
  - [x] 126.4 Type badges [IND] / [STG]
  - [x] 126.5 Built-in badge
  - [x] 126.6 One-click add via POST /api/indicators
  - [x] 126.7 Stay open for multiple additions

- [x] 127. Wire Quick Adder to Footer Bar and Keyboard
  - [x] 127.1 Footer bar button opens popup
  - [x] 127.2 "/" keyboard shortcut (when not in input focus)
  - [x] 127.3 ESC/X/backdrop to close

- [x] 128. Checkpoint - Quick Adder Validation

- [x] 129. Implement CLI Backtest Tool for Multi-Symbol Strategy Validation
  - [x] 129.1 CLI entry point with argument parsing
  - [x] 129.2 Per-symbol backtest execution
  - [x] 129.3 Multi-symbol runner with progress
  - [x] 129.4 Result aggregation and overfitting analysis
  - [x] 129.5 Output formatting (JSON + human-readable)
  - [x] 129.6 Tests
  - [x] 129.7 Bin entry wiring
  - [x] 129.8 Dynamic days-back based on timeframe

- [x] 130. Add Multi-Pair Backtest Tutorial to Merge Prompt
  - [x] 130.1 Tutorial section in merge-indicators-to-strategy.md
  - [x] 130.2 Example workflow
  - [x] 130.3 Overfitting detection guidance
  - [x] 130.4 Best practices documentation

- [x] 131. CLI Backtest Tool Refinements
  - [x] 131.1 Dynamic days-back based on timeframe
  - [x] 131.2 Monorepo path resolution
  - [x] 131.3 Default help
  - [x] 131.4 pnpm run backtest convenience script
  - [x] 131.5 Merge prompt update

- [x] 132. Chart Viewport Auto-Fit on Initial Load
  - [x] 132.1 Auto-fit when REST data arrives (PineChart.setCandles)
  - [x] 132.2 Suppress WS updates until REST loads (useChartData)

- [x] 133. Fix node16 module resolution
  - [x] 133.1 Add .js extensions to relative imports

- [x] 134. Implement Pluggable Commission Calculation Methods
  - [x] 134.1 CommissionCalculator interface and CommissionConfig types
  - [x] 134.2 percent_fixed method
  - [x] 134.3 per_order_fixed method
  - [x] 134.4 jupiter_ultra (Jupiter DEX Ultra Mode fees)
  - [x] 134.5 jupiter_manual (zero-commission Jupiter Market Swap)
  - [x] 134.6 none method
  - [x] 134.7 Long-only enforcement
  - [x] 134.8 Legacy commission_type/commission_value fallback

- [x] 135. Integrate Commission Methods into Backtest Engine
  - [x] 135.1 Wire into Broker Simulator
  - [x] 135.2 Wire into REST API
  - [x] 135.3 Wire into frontend
  - [x] 135.4 Tests

- [x] 136. Implement Commission Method UI in Backtest Settings
  - [x] 136.1 Commission method dropdown
  - [x] 136.2 Method-specific settings fields
  - [x] 136.3 Integration with settings persistence
  - [x] 136.4 Tests

- [x] 137. Implement Engine-Level OHLC History Accumulation
  - Accumulate ohlcHistory (open/high/low/close/volume arrays) across bar execution
  - StateManager snapshots save/restore ohlcHistory for rollback
  - Series indexing (close[1]) reads from accumulated history

- [x] 138. Split monolithic interpreter into expression-executor.ts and statement-executor.ts
  - Expression evaluation in expression-executor.ts
  - Statement-level execution in statement-executor.ts

- [x] 139. Implement hidden plot support (display=display.none)
  - Plots with display.none do not render as visible lines
  - Data remains available for fill() lookups and AreaRenderer
  - Track hiddenPlotKeys in execution result

- [x] 140. Add named title= argument support for indicator/strategy declarations
  - Parser accepts indicator(title="Name") in addition to indicator("Name")
  - Two-pass name extraction at all call sites

- [x] 141. Fix color.new() alpha accumulation
  - Replace alpha byte entirely instead of appending
  - color.new(na, transp) returns na instead of default #2196f3

- [x] 142. Add per-bar fill color support for 6-argument band fill form
  - Detect 6+ argument band fill form
  - Read color from positionalArgs[5] instead of [4]

- [x] 143. Add barColors API to backend /api/execute response
  - barColorData serialized in execution responses

- [x] 144. Switch default backend port from 8080 to 8081
  - Update backend server, Vite proxy, WebSocket URL

## Notes (from legacy tasks.md)

- Tasks marked with `*` were optional and could be skipped for faster MVP — all now complete
- Each task references specific requirements for traceability (e.g., _Requirements: 1.1, 1.2_)
- Checkpoints ensured incremental validation and prevented integration issues
- Unit tests validate specific examples and edge cases
- Integration tests verify component interactions
- TypeScript is the implementation language
- Tasks 23-30 implement the monorepo restructuring, backend server, Bybit integration, and frontend-backend wiring
- Tasks 31-41 implement enhancements: named args, real TA functions, plotshape markers, fill rendering, strategy integration, execution edge case fixes, frontend improvements, backend hardening, and complex integration tests
- Task 21 (canvas charting library) replaced the previous lightweight-charts integration with a custom HTML5 Canvas rendering engine for full control over shapes, fills, markers, and all visual elements
- Tasks 21.16-21.26 implement canvas renderers for all Pine visual output functions
- Task 22.1 wires all drawing/alert builtins (label.*, line.*, box.*, polyline.*, linefill.*, table.*, chart.point.*, alert) into the execution engine
- Tasks 47-58 implement the full backtest engine: broker simulator, backtest orchestrator, performance metrics calculator, backtest REST API, backtest visualization, configuration panel, data source integration, and comprehensive tests
- Tasks 59-68 implement post-backtest enhancements: switch expressions, generic array methods and line/label dispatch, lines/labels full frontend pipeline, per-bar colors, TA semantics fixes, lazy loading, TrendCraft compatibility, plot/bgcolor/strategy fixes, and final validation
- Task 69 fixes indicator alignment after lazy loading
- Tasks 70-72 implement JSON file-based persistent storage, Telegram Bot notification system, and per-alert Telegram selection UI
- Task 75 implements real-time indicator computation for forming (live) candles
- Tasks 76-77 implement the Script Bank with CRUD operations
- Tasks 79-80 unify the script editor, replacing ScriptBankPanel with a dropdown
- Task 81 implements bar-close only alert dispatch with three-layer dedup
- Task 82 refactors forming-candle architecture for caller-managed isFormingCandle
- Tasks 86-88 implement compatibility for Two-Pole Trend Filter and Volatility Trail indicators
- Task 89 implements Pine Script v5 compatibility layer
- Task 90 implements separate indicator panes with overlay support
- Tasks 92-93 implement TradingView-style chart navigation controls
- Tasks 95-96 implement indicator pane independent price scales and autoscale
- Task 97 implements dynamic indicator management UI
- Task 100 implements progressive indicator computation
- Task 101 implements time-based renderer positioning
- Task 102 darkens the chart and UI theme
- Task 103 adds auto-scale toggle to footer bar
- Task 104 fixes scroll re-execution and indicator boundary recomputation
- Tasks 106-107 implement AI Agent Integration and File-Based Script Storage
- Tasks 129-131 implement CLI Backtest Tool for multi-symbol strategy validation
- Tasks 132-133 implement chart viewport auto-fit and node16 module resolution
- Tasks 134-136 implement pluggable commission calculation methods
- Tasks 137-144 implement engine-level OHLC history, interpreter split, hidden plot support, named arguments for declarations, color fixes, band fill support, barColors API, and port change

## Task Dependency Graph (from legacy tasks.md)

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 1, "tasks": ["2.4", "2.5"] },
    { "id": 2, "tasks": ["4.1", "4.2", "4.3"] },
    { "id": 3, "tasks": ["6.1", "6.2", "6.3"] },
    { "id": 4, "tasks": ["4.4", "4.5", "6.4", "6.5"] },
    { "id": 5, "tasks": ["7.1", "7.2", "7.3"] },
    { "id": 6, "tasks": ["9.1", "9.2", "9.3"] },
    { "id": 7, "tasks": ["7.4", "7.5", "9.4", "9.5"] },
    { "id": 8, "tasks": ["10.1", "10.2", "10.3", "10.4", "10.5"] },
    { "id": 9, "tasks": ["10.6", "10.7", "10.8"] },
    { "id": 10, "tasks": ["12.1", "12.2", "12.3"] },
    { "id": 11, "tasks": ["12.4", "12.5", "12.6"] },
    { "id": 12, "tasks": ["13.1", "13.2", "13.3"] },
    { "id": 13, "tasks": ["13.4"] },
    { "id": 14, "tasks": ["15.1", "15.2", "15.3"] },
    { "id": 15, "tasks": ["15.4"] },
    { "id": 16, "tasks": ["16.1", "16.2", "16.3"] },
    { "id": 17, "tasks": ["18.1", "18.2", "18.3"] },
    { "id": 18, "tasks": ["18.4"] },
    { "id": 19, "tasks": ["20.1"] },
    { "id": 20, "tasks": ["20.2"] },
    { "id": 21, "tasks": ["21.1", "21.2", "21.3", "21.4", "21.5", "21.6", "21.7", "21.8", "21.9", "21.10", "21.11", "21.12", "21.13", "21.14", "21.16", "21.17", "21.18", "21.19", "21.20", "21.21", "21.22", "21.23", "21.24", "21.25", "21.26"] },
    { "id": 22, "tasks": ["21.15", "22", "22.1"] },
    { "id": 23, "tasks": ["22"] },
    { "id": 24, "tasks": ["23.1", "23.2", "23.3", "23.4"] },
    { "id": 25, "tasks": ["23.5"] },
    { "id": 26, "tasks": ["24"] },
    { "id": 27, "tasks": ["25.1", "25.2", "25.3"] },
    { "id": 28, "tasks": ["25.4", "25.5", "25.6"] },
    { "id": 29, "tasks": ["25.7"] },
    { "id": 30, "tasks": ["26"] },
    { "id": 31, "tasks": ["27.1", "27.2", "27.3"] },
    { "id": 32, "tasks": ["27.4", "27.5"] },
    { "id": 33, "tasks": ["27.6"] },
    { "id": 34, "tasks": ["28"] },
    { "id": 35, "tasks": ["29.1", "29.2", "29.3", "29.4"] },
    { "id": 36, "tasks": ["29.5"] },
    { "id": 37, "tasks": ["30"] },
    { "id": 38, "tasks": ["31.1", "31.2"] },
    { "id": 39, "tasks": ["31.3"] },
    { "id": 40, "tasks": ["32.1", "32.2", "32.3"] },
    { "id": 41, "tasks": ["32.4"] },
    { "id": 42, "tasks": ["33.1", "33.2", "33.3", "33.4", "33.5"] },
    { "id": 43, "tasks": ["33.6"] },
    { "id": 44, "tasks": ["34.1", "34.2", "34.3", "34.4", "34.5", "34.6", "34.7", "34.8"] },
    { "id": 45, "tasks": ["34.9"] },
    { "id": 46, "tasks": ["35.1", "35.2", "35.3", "35.4", "35.5"] },
    { "id": 47, "tasks": ["35.6"] },
    { "id": 48, "tasks": ["36.1", "36.2", "36.3"] },
    { "id": 49, "tasks": ["36.4"] },
    { "id": 50, "tasks": ["37.1", "37.2", "37.3"] },
    { "id": 51, "tasks": ["37.4"] },
    { "id": 52, "tasks": ["38.1", "38.2", "38.3", "38.4"] },
    { "id": 53, "tasks": ["38.5"] },
    { "id": 54, "tasks": ["39.1", "39.2"] },
    { "id": 55, "tasks": ["39.3"] },
    { "id": 56, "tasks": ["40.1", "40.2"] },
    { "id": 57, "tasks": ["40.3"] },
    { "id": 58, "tasks": ["41"] },
    { "id": 59, "tasks": ["42.1", "42.2", "42.3"] },
    { "id": 60, "tasks": ["42.4"] },
    { "id": 61, "tasks": ["43.1", "43.2", "43.3", "43.4", "43.5"] },
    { "id": 62, "tasks": ["43.6"] },
    { "id": 63, "tasks": ["44"] },
    { "id": 64, "tasks": ["45.1", "45.2", "45.3", "45.4", "45.5", "45.6", "45.7"] },
    { "id": 65, "tasks": ["45.8"] },
    { "id": 66, "tasks": ["46"] },
    { "id": 67, "tasks": ["47.1", "47.2", "47.3", "47.4", "47.5", "47.6", "47.7"] },
    { "id": 68, "tasks": ["48.1", "48.2", "48.3"] },
    { "id": 69, "tasks": ["49.1", "49.2", "49.3", "49.4", "49.5"] },
    { "id": 70, "tasks": ["50.1", "50.2", "50.3"] },
    { "id": 71, "tasks": ["51.1", "51.2", "51.3", "51.4"] },
    { "id": 72, "tasks": ["52.1", "52.2", "52.3"] },
    { "id": 73, "tasks": ["53.1", "53.2", "53.3"] },
    { "id": 74, "tasks": ["54", "55", "56", "57"] },
    { "id": 75, "tasks": ["58"] },
    { "id": 76, "tasks": ["59.1", "59.2"] },
    { "id": 77, "tasks": ["59.3", "59.4"] },
    { "id": 78, "tasks": ["60.1", "60.2"] },
    { "id": 79, "tasks": ["61.1", "61.2", "61.3"] },
    { "id": 80, "tasks": ["62.1", "62.2", "62.3", "62.4"] },
    { "id": 81, "tasks": ["63.1", "63.2", "63.3", "63.4", "63.5"] },
    { "id": 82, "tasks": ["64.1", "64.2"] },
    { "id": 83, "tasks": ["64.3", "64.4", "64.5"] },
    { "id": 84, "tasks": ["65.1", "65.2", "65.3"] },
    { "id": 85, "tasks": ["66.1", "66.2", "66.3"] },
    { "id": 86, "tasks": ["67.1", "67.2", "67.3", "67.4"] },
    { "id": 87, "tasks": ["68"] },
    { "id": 88, "tasks": ["69.1", "69.2", "69.3", "69.4"] },
    { "id": 89, "tasks": ["70.1", "70.2", "70.3"] },
    { "id": 90, "tasks": ["70.4", "70.5"] },
    { "id": 91, "tasks": ["71.1", "71.2", "71.3"] },
    { "id": 92, "tasks": ["71.4"] },
    { "id": 93, "tasks": ["72.1", "72.2", "72.3"] },
    { "id": 94, "tasks": ["72.4"] },
    { "id": 95, "tasks": ["73"] },
    { "id": 96, "tasks": ["75.1", "75.2", "75.3"] },
    { "id": 97, "tasks": ["75.4"] },
    { "id": 98, "tasks": ["76.1", "76.2", "76.3"] },
    { "id": 99, "tasks": ["76.4"] },
    { "id": 100, "tasks": ["77.1", "77.2", "77.3", "77.4"] },
    { "id": 101, "tasks": ["77.5"] },
    { "id": 102, "tasks": ["78"] },
    { "id": 103, "tasks": ["79.1", "79.2", "79.3", "79.4", "79.5"] },
    { "id": 104, "tasks": ["79.6"] },
    { "id": 105, "tasks": ["80"] },
    { "id": 106, "tasks": ["81.1", "81.2"] },
    { "id": 107, "tasks": ["81.3"] },
    { "id": 108, "tasks": ["81.4", "81.5", "81.6", "81.7"] },
    { "id": 109, "tasks": ["82.1", "82.2", "82.3", "82.4"] },
    { "id": 110, "tasks": ["83.1", "83.2", "83.3"] },
    { "id": 111, "tasks": ["84.1", "84.2", "84.3"] },
    { "id": 112, "tasks": ["85.1"] },
    { "id": 113, "tasks": ["86.1", "86.2", "86.3", "86.4", "86.5", "86.6", "86.7", "86.8", "86.9"] },
    { "id": 114, "tasks": ["86.10"] },
    { "id": 115, "tasks": ["87.1"] },
    { "id": 116, "tasks": ["88.1", "88.2", "88.3", "88.4", "88.5", "88.6", "88.7", "88.8", "88.9", "88.10"] },
    { "id": 117, "tasks": ["88.11"] },
    { "id": 118, "tasks": ["89.1", "89.2", "89.3", "89.4", "89.5", "89.6"] },
    { "id": 119, "tasks": ["89.7"] },
    { "id": 120, "tasks": ["90.1", "90.2", "90.3", "90.4", "90.5", "90.6", "90.7", "90.8"] },
    { "id": 121, "tasks": ["90.9", "90.10"] },
    { "id": 122, "tasks": ["91.1", "91.2", "91.3", "91.4", "91.5"] },
    { "id": 123, "tasks": ["92.1", "92.2", "92.3", "92.4", "92.5"] },
    { "id": 124, "tasks": ["92.6"] },
    { "id": 125, "tasks": ["93.1", "93.2", "93.3"] },
    { "id": 126, "tasks": ["94.1", "94.2"] },
    { "id": 127, "tasks": ["95.1", "95.2", "95.3"] },
    { "id": 128, "tasks": ["96.1", "96.2", "96.3", "96.4", "96.5"] },
    { "id": 129, "tasks": ["96.6"] },
    { "id": 130, "tasks": ["97"] },
    { "id": 131, "tasks": ["99"] },
    { "id": 132, "tasks": ["100.1", "100.2", "100.3", "100.4", "100.5", "100.6", "100.7", "100.8", "100.9"] },
    { "id": 133, "tasks": ["101.1", "101.2", "101.3", "101.4"] },
    { "id": 134, "tasks": ["101.5"] },
    { "id": 135, "tasks": ["102.1", "102.2", "102.3"] },
    { "id": 136, "tasks": ["102.4"] },
    { "id": 137, "tasks": ["103.1", "103.2", "103.3", "103.4"] },
    { "id": 138, "tasks": ["103.5"] },
    { "id": 139, "tasks": ["104.1", "104.2", "104.3"] },
    { "id": 140, "tasks": ["104.4"] },
    { "id": 141, "tasks": ["105.1", "105.2"] },
    { "id": 142, "tasks": ["105.3"] },
    { "id": 143, "tasks": ["106.1", "106.2", "106.3", "106.4", "106.5", "106.6", "106.7", "106.8", "106.9", "106.10", "106.11", "106.12"] },
    { "id": 144, "tasks": ["106.13", "106.14"] },
    { "id": 145, "tasks": ["107"] },
    { "id": 146, "tasks": ["108.1", "108.2", "108.3", "108.4", "108.5", "108.6", "108.7", "108.8"] },
    { "id": 147, "tasks": ["109.1", "109.2", "109.3", "109.4", "109.5", "109.6", "109.7"] },
    { "id": 148, "tasks": ["122.1", "122.2", "122.3", "122.4", "122.5", "122.6", "122.7"] },
    { "id": 149, "tasks": ["122.8"] },
    { "id": 150, "tasks": ["123.1", "123.2", "123.3"] },
    { "id": 151, "tasks": ["124.1", "124.2", "124.3"] },
    { "id": 152, "tasks": ["125.1", "125.2", "125.3"] },
    { "id": 153, "tasks": ["126.1", "126.2", "126.3", "126.4", "126.5", "126.6"] },
    { "id": 154, "tasks": ["126.7"] },
    { "id": 155, "tasks": ["127.1", "127.2"] },
    { "id": 156, "tasks": ["127.3"] },
    { "id": 157, "tasks": ["128"] },
    { "id": 158, "tasks": ["129.1", "129.2"] },
    { "id": 159, "tasks": ["129.3", "129.4"] },
    { "id": 160, "tasks": ["129.5", "129.6"] },
    { "id": 161, "tasks": ["129.7", "129.8"] },
    { "id": 162, "tasks": ["130.1", "130.2", "130.3"] },
    { "id": 163, "tasks": ["130.4"] },
    { "id": 164, "tasks": ["131.1", "131.2", "131.3", "131.4", "131.5"] },
    { "id": 165, "tasks": ["132.1", "132.2"] },
    { "id": 166, "tasks": ["133.1"] },
    { "id": 167, "tasks": ["134.1", "134.2", "134.3", "134.4", "134.5", "134.6", "134.7"] },
    { "id": 168, "tasks": ["134.8"] },
    { "id": 169, "tasks": ["135.1", "135.2", "135.3"] },
    { "id": 170, "tasks": ["135.4"] },
    { "id": 171, "tasks": ["136.1", "136.2", "136.3"] },
    { "id": 172, "tasks": ["136.4"] },
    { "id": 173, "tasks": ["137"] },
    { "id": 174, "tasks": ["138"] },
    { "id": 175, "tasks": ["139"] },
    { "id": 176, "tasks": ["140"] },
    { "id": 177, "tasks": ["141"] },
    { "id": 178, "tasks": ["142"] },
    { "id": 179, "tasks": ["143"] },
    { "id": 180, "tasks": ["144"] }
  ]
}
```
