# Implementation Plan: Pine Script v6 Engine

## Overview

This implementation plan outlines the step-by-step development of a production-grade Pine Script v6 Engine using TypeScript. The engine will parse, execute, and render Pine Script v6 programs with TradingView-like semantics, featuring a seven-layer architecture with plugin-based extensibility, a web-based frontend for interactive development, a backend API server, and real Bybit market data integration. The entire system is organized as a pnpm monorepo. The plan follows incremental development with checkpoints to ensure correctness and maintainability.

## Tasks

- [x] 1. Setup project structure and core infrastructure
  - Create TypeScript project with proper build configuration
  - Set up testing framework (Jest/TypeScript)
  - Configure linting and code formatting
  - Define package.json with dependencies
  - _Requirements: 10.1, 10.2, 10.3, 10.5_

- [x] 2. Implement language processing layer
  - [x] 2.1 Create Pine Script parser
    - Define Pine Script v6 grammar using ANTLR or custom parser
    - Implement tokenizer for Pine Script v6 syntax
    - Build AST data structures for all Pine constructs
    - Handle version detection (`//@version=6`)
    - _Requirements: 1.1, 1.2, 1.5, 1.6_
  
  - [x] 2.2 Implement Pine Script compiler
    - Create type checking system for Pine types
    - Implement scope resolution and variable declaration validation
    - Build intermediate representation (IR) generation
    - Add syntax error reporting with line/column info
    - _Requirements: 1.3, 1.4, 1.7_

  - [x] 2.3 Implement Pine type system
    - Define TypeScript interfaces for Pine primitive types (int, float, bool, string, color)
    - Implement Series type with time-series semantics
    - Build type coercion system following Pine rules
    - Add `na` (not available) value handling
    - _Requirements: 2.1, 2.2, 2.3, 2.6_
  
  - [x] 2.4 Write unit tests for parser and compiler
    - Test parsing of all Pine Script language constructs
    - Validate compiler type checking and error reporting
    - Test edge cases in syntax and semantics
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  
  - [x] 2.5 Write unit tests for type system
    - Test type coercion rules following Pine semantics
    - Validate Series type behavior and indexing
    - Test `na` value handling and propagation
    - Verify array and map data structures
    - _Requirements: 2.3, 2.4, 2.5, 2.7_

- [x] 3. Checkpoint - Language layer validation
  - Ensure parser and compiler handle basic Pine scripts correctly
  - Verify type system implements Pine coercion rules
  - Run unit tests for language constructs
  - Ask the user if questions arise.

- [x] 4. Implement execution layer
  - [x] 4.1 Create execution engine core
    - Implement bar-by-bar execution model
    - Build series state management across executions
    - Create variable scope management system
    - Implement Pine's series indexing behavior (`close[1]`, etc.)
    - _Requirements: 3.1, 3.2, 3.6, 3.7_

  - [x] 4.2 Implement realtime execution with rollback
    - Build state checkpointing for rollback capability
    - Implement re-execution on new bar data
    - Create error handling and recovery mechanisms
    - Add performance monitoring for execution timing
    - _Requirements: 3.3, 3.4, 3.5, 10.2_

  - [x] 4.3 Implement string and time functions
    - Build string manipulation functions (concatenation, formatting, parsing)
    - Implement time operations (timestamp conversion, timezone handling)
    - Add `str.format()` with TradingView-compatible formatting
    - Create session and trading time calculations
    - _Requirements: 13.1, 13.2, 13.4, 13.6_
  
  - [x]* 4.4 Write unit tests for execution engine
    - Test bar-by-bar execution with simple Pine scripts
    - Validate series state management across executions
    - Test variable scope and lifetime management
    - Verify error handling and recovery mechanisms
    - _Requirements: 3.1, 3.2, 3.4, 3.6_
  
  - [x] 4.5 Write unit tests for string and time functions
    - Test string operations match Pine behavior
    - Validate time calculations and conversions
    - Test `str.format()` with various templates
    - Verify session and trading time calculations
    - _Requirements: 13.3, 13.5, 13.7_

- [x] 5. Checkpoint - Execution layer validation
  - Ensure execution engine processes basic indicators correctly
  - Verify rollback works for realtime execution
  - Test string and time functions against Pine reference
  - Ask the user if questions arise.

- [x] 6. Implement data layer
  - [x] 6.1 Create data engine for OHLCV data
    - Design efficient storage for millions of candles
    - Implement caching layer (LRU/LFU) for performance
    - Build data gap handling and interpolation
    - Add data validation on ingestion
    - _Requirements: 5.4, 10.1, 10.4_

  - [x] 6.2 Implement request system for multi-symbol data
    - Build `request.security()` implementation
    - Create data alignment across different timeframes
    - Implement lookahead bias prevention
    - Add realtime update propagation
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

  - [x] 6.3 Create data access APIs
    - Design unified API for historical and realtime data
    - Implement data streaming for realtime updates
    - Build data subscription management
    - Add data source abstraction for external providers
    - _Requirements: 5.6, 5.7, 10.3_
  
  - [x]* 6.4 Write unit tests for data engine
    - Test OHLCV data storage and retrieval
    - Validate caching performance and hit rates
    - Test data gap handling and interpolation
    - Verify data validation on ingestion
    - _Requirements: 5.4, 10.4_
  
  - [x]* 6.5 Write unit tests for request system
    - Test `request.security()` with various symbols and timeframes
    - Validate data alignment across different timeframes
    - Test lookahead bias prevention
    - Verify realtime update propagation
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

- [x] 7. Implement analysis layer (Technical Analysis Engine)
  - [x] 7.1 Create core TA function infrastructure
    - Design function registry for all ta.* namespace functions
    - Implement numerical precision matching TradingView
    - Build lookback window management
    - Create parameter validation and defaults
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 7.2 Implement mathematical and statistical functions
    - Add moving averages (sma, ema, wma, etc.)
    - Implement oscillators (rsi, macd, stoch, etc.)
    - Build mathematical functions (highest, lowest, correlation, etc.)
    - Add performance optimization for large datasets
    - _Requirements: 4.5, 4.6_

  - [x] 7.3 Create advanced indicator system
    - Implement custom indicator calculation pipelines
    - Build indicator result caching for performance
    - Add indicator dependency resolution
    - Create indicator visualization hooks
    - _Requirements: 4.4, 4.5, 10.5_
  
  - [x]* 7.4 Write unit tests for TA functions
    - Test all ta.* namespace functions for correctness
    - Validate numerical precision against TradingView reference
    - Test lookback window management and boundary conditions
    - Verify parameter validation and default values
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  
  - [x]* 7.5 Write performance tests for TA engine
    - Test performance with large datasets (millions of candles)
    - Measure memory usage during indicator calculations
    - Validate caching effectiveness for repeated calculations
    - Test concurrent indicator execution performance
    - _Requirements: 4.5, 4.6, 10.5_

- [x] 8. Checkpoint - Data and analysis layer validation
  - Ensure TA functions match TradingView numerical precision
  - Verify request system handles multi-timeframe data correctly
  - Test data engine with millions of candles
  - Ask the user if questions arise.

- [x] 9. Implement input and configuration system
  - [x] 9.1 Create input system for user configuration
    - Implement all Pine input types (int, float, bool, string, color, symbol, timeframe)
    - Build input validation with constraints
    - Create input grouping and organization
    - Add persistence across script executions
    - _Requirements: 12.1, 12.2, 12.3, 12.5_

  - [x] 9.2 Implement color system and formatting
    - Build color representations (hex, rgb, named colors)
    - Implement color arithmetic and blending
    - Add transparency (alpha channel) support
    - Create gradient and palette functions
    - _Requirements: 15.1, 15.2, 15.4, 15.6_

  - [x] 9.3 Build configuration management
    - Create configuration storage and retrieval
    - Implement configuration change listeners
    - Build configuration validation system
    - Add configuration template support
    - _Requirements: 12.4, 12.6, 12.7_
  
  - [x]* 9.4 Write unit tests for input system
    - Test all Pine input types with various values
    - Validate input constraints and validation
    - Test input persistence across executions
    - Verify input grouping and organization
    - _Requirements: 12.1, 12.2, 12.3, 12.5_
  
  - [x]* 9.5 Write unit tests for color system
    - Test all color representations (hex, rgb, named colors)
    - Validate color arithmetic and blending operations
    - Test transparency (alpha channel) support
    - Verify gradient and palette functions
    - _Requirements: 15.1, 15.2, 15.4, 15.6_

- [x] 10. Implement rendering layer (Plot Engine)
  - [x] 10.1 Create plot rendering system
    - Implement `plot()` for line plots with styles (line, stepline, histogram, columns, area, areabr, circles, cross)
    - Build `plotshape()` for shape markers (arrowup, arrowdown, circle, square, diamond, triangleup, triangledown, cross, xcross, flag, labelup, labeldown)
    - Create `plotchar()` for character markers
    - Implement `plotarrow()` for directional arrows
    - Build `hline()` for horizontal lines at price levels
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 10.2 Implement background and bar coloring
    - Build `bgcolor()` for chart background coloring
    - Implement `barcolor()` for candle/bar coloring
    - Create `fill()` for area between plots or hlines
    - _Requirements: 6.7, 6.8, 6.9_

  - [x] 10.3 Implement drawing objects engine
    - Build `line.new()`, `line.copy()`, `line.delete()`, `line.set_*()`, `line.get_*()` for line objects
    - Implement `box.new()`, `box.copy()`, `box.delete()`, `box.set_*()`, `box.get_*()` for box objects
    - Create `label.new()`, `label.copy()`, `label.delete()`, `label.set_*()`, `label.get_*()` for label objects
    - Build `table.new()`, `table.cell()`, `table.clear()`, `table.delete()`, `table.merge_cells()`, `table.cell_set_*()` for table objects
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 10.4 Create advanced drawing features
    - Implement `linefill.new()`, `linefill.delete()`, `linefill.set_color()`, `linefill.get_line1()`, `linefill.get_line2()` for line fills
    - Build `polyline.new()`, `polyline.delete()` for multi-point lines
    - Create `chart.point` objects (chart.point.new, chart.point.now, chart.point.from_index, chart.point.from_time, chart.point.copy)
    - Add styling options (fill, border, text formatting)
    - Create visual element hierarchy and z-ordering
    - _Requirements: 7.5, 7.6, 7.7, 7.8_

  - [x] 10.5 Implement drawing object management
    - Enforce max_labels_count, max_lines_count, max_boxes_count, max_polylines_count limits
    - Support all xloc modes (bar_index, bar_time)
    - Support all yloc modes (price, abovebar, belowbar)
    - Support all extend modes (none, left, right, both)
    - _Requirements: 7.9, 7.10, 7.11, 7.12_

  - [x]* 10.6 Write unit tests for plot rendering
    - Test `plot()` with various line styles and options
    - Validate `plotshape()` positioning and rendering
    - Test `plotchar()` character rendering
    - Verify `plotarrow()` directional rendering
    - Test `hline()` horizontal line rendering
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x]* 10.7 Write unit tests for background and bar coloring
    - Test `bgcolor()` background coloring
    - Validate `barcolor()` bar coloring
    - Test `fill()` between plots and hlines
    - _Requirements: 6.7, 6.8, 6.9_

  - [x]* 10.8 Write unit tests for drawing objects
    - Test `line.new()` with various styling options
    - Validate `box.new()` fill and border rendering
    - Test `label.new()` text formatting and positioning
    - Verify `table.new()` data table rendering
    - Test `linefill.new()` between lines
    - Verify `polyline.new()` multi-point lines
    - Test `chart.point` objects for positioning
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [x] 11. Checkpoint - Input and rendering layer validation
  - Ensure input system validates all Pine input types correctly
  - Verify rendering matches TradingView visual fidelity
  - Test color system and formatting functions
  - Ask the user if questions arise.

- [x] 12. Implement strategy layer
  - [x] 12.1 Create strategy execution engine with visual markers
    - Implement `strategy.entry()` with entry markers on chart
    - Build `strategy.order()` with order markers on chart
    - Create `strategy.exit()` with exit markers on chart
    - Implement `strategy.close()` with closing markers on chart
    - Build `strategy.close_all()` with closing markers on chart
    - Create `strategy.cancel()` to update displayed orders
    - Implement `strategy.cancel_all()` to update displayed orders
    - Build order management and position tracking
    - Create commission and slippage modeling
    - Implement performance metrics calculation
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10_

  - [x] 12.2 Build backtesting system
    - Create historical order execution simulation
    - Implement trade-by-trade analysis
    - Build performance reporting (profit, drawdown, Sharpe ratio)
    - Add strategy optimization capabilities
    - _Requirements: 8.11, 8.12_

  - [x] 12.3 Implement alert system
    - Build `alert()` function with message and frequency parameters
    - Implement `alertcondition()` for UI-visible alert conditions
    - Create alert message formatting with template syntax
    - Build duplicate prevention with configurable windows
    - Add multiple alert destinations (email, webhook, popup, etc.)
    - Display alertcondition() in indicator settings UI
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 14.9_

  - [x]* 12.4 Write unit tests for strategy engine
    - Test `strategy.entry()`, `strategy.order()`, `strategy.exit()` order creation and markers
    - Validate `strategy.close()`, `strategy.close_all()` closing markers
    - Test `strategy.cancel()`, `strategy.cancel_all()` order updates
    - Validate position tracking and management
    - Test commission and slippage modeling
    - Verify performance metrics calculation
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10_

  - [x]* 12.5 Write unit tests for backtesting system
    - Test historical order execution simulation
    - Validate trade-by-trade analysis accuracy
    - Test performance reporting calculations
    - Verify strategy optimization capabilities
    - _Requirements: 8.11, 8.12_

  - [x]* 12.6 Write unit tests for alert system
    - Test `alert()` with various message and frequency parameters
    - Validate `alertcondition()` creation and UI display
    - Test alert message formatting with templates
    - Test duplicate prevention with time windows
    - Verify alert destination integration
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 14.9_

- [x] 13. Implement extensibility layer (Plugin Architecture)
  - [x] 13.1 Create plugin registry system
    - Design plugin discovery and loading mechanism
    - Build interface validation for plugins
    - Implement dependency resolution between plugins
    - Add version compatibility checking
    - _Requirements: 9.1, 9.2, 9.3, 9.6_

  - [x] 13.2 Implement plugin type interfaces
    - Create FunctionPlugin interface for new built-in functions
    - Build TypePlugin interface for new data types
    - Implement RendererPlugin interface for new visualizations
    - Create DataSourcePlugin interface for external data
    - _Requirements: 9.4, 9.5, 9.7_

  - [x] 13.3 Build plugin development tools
    - Create plugin development SDK
    - Implement plugin testing framework
    - Build plugin packaging and distribution
    - Add plugin documentation generation
    - _Requirements: 9.4, 9.5_

  - [x]* 13.4 Write integration tests for plugin system
    - Test plugin discovery and loading
    - Validate plugin interface compliance
    - Test dependency resolution between plugins
    - Verify version compatibility checking
    - _Requirements: 9.1, 9.2, 9.3, 9.6_

- [x] 14. Checkpoint - Strategy and extensibility layer validation
  - Ensure strategy engine calculates correct performance metrics
  - Verify plugin system loads and integrates plugins correctly
  - Test alert system triggers notifications appropriately
  - Ask the user if questions arise.

- [x] 15. Implement performance optimization and scaling
  - [x] 15.1 Create performance optimization system
    - Implement vectorized operations for time series
    - Build JIT compilation for hot code paths
    - Create memory pooling for frequent allocations
    - Add caching of intermediate results
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 15.2 Implement scaling infrastructure
    - Build script execution isolation for concurrency
    - Create distributed caching layer
    - Implement load balancing for multiple scripts
    - Add resource management (memory, CPU limits)
    - _Requirements: 10.4, 10.6, 10.7_

  - [x] 15.3 Create monitoring and profiling
    - Implement execution time profiling
    - Build memory usage monitoring
    - Create cache hit rate tracking
    - Add performance bottleneck detection
    - _Requirements: 10.7_

  - [x]* 15.4 Write performance tests
    - Test execution time with millions of candles
    - Measure memory usage during large-scale processing
    - Validate caching effectiveness and hit rates
    - Test concurrent execution performance
    - _Requirements: 10.1, 10.2, 10.3, 10.5_

- [x] 16. Implement comprehensive testing framework
  - [x] 16.1 Create unit test infrastructure
    - Build test framework for all Pine language constructs
    - Implement test data generation (synthetic and real market data)
    - Create test comparison tools with TradingView
    - Add edge case and error condition testing
    - _Requirements: 11.1, 11.6_

  - [x] 16.2 Create integration and compatibility tests
    - Implement end-to-end Pine script execution tests
    - Build comparison with TradingView output samples
    - Create regression test suite
    - Add cross-version compatibility testing
    - _Requirements: 11.2, 11.3, 11.5_

  - [x] 16.3 Create property-based tests
    - Implement mathematical property verification
    - Build round-trip property testing
    - Create invariant preservation tests
    - Add random input testing for robustness
    - _Requirements: 11.4_

- [x] 17. Checkpoint - Performance and testing validation
  - Ensure performance optimizations improve throughput
  - Verify testing framework catches regressions
  - Test system with millions of candles and hundreds of indicators
  - Ask the user if questions arise.

- [x] 18. Integration and system wiring
  - [x] 18.1 Wire all components together
    - Connect language layer to execution layer
    - Integrate data layer with analysis layer
    - Wire rendering layer to visualization output
    - Connect strategy layer with execution engine
    - _Requirements: All requirements_

  - [x] 18.2 Create unified API and CLI
    - Build REST API for script execution
    - Implement WebSocket for realtime updates
    - Create command-line interface for local execution
    - Build embedding API for external applications
    - _Requirements: All requirements_

  - [x] 18.3 Implement deployment and distribution
    - Create Docker container configuration
    - Build NPM/package distribution
    - Implement configuration management
    - Add documentation and examples
    - _Requirements: All requirements_

  - [x]* 18.4 Write end-to-end integration tests
    - Test complete Pine script execution pipeline
    - Validate REST API functionality
    - Test WebSocket realtime updates
    - Verify CLI interface and commands
    - _Requirements: 11.2, 11.3, 11.5_

- [x] 19. Final checkpoint - Complete system validation
  - Ensure all components integrate correctly
  - Verify TradingView compatibility across test suite
  - Test performance with production workloads
  - Validate extensibility with sample plugins
  - Ask the user if questions arise.

- [x] 20. Implement Script Declaration System
  - [x] 20.1 Create script declaration parser
    - Implement `indicator()` declaration with all parameters (title, shorttitle, overlay, format, precision, scale, max_labels_count, max_lines_count, max_boxes_count, max_polylines_count, max_bars_back, calc_on_every_tick, max_lines_left, max_labels_left, max_boxes_left, explicit_plot_zorder)
    - Build `strategy()` declaration with all parameters (title, shorttitle, overlay, format, precision, scale, pyramiding, calc_on_every_tick, backtest_fill_limits_assumption, default_qty_type, default_qty_value, initial_capital, commission_type, commission_value, slippage, process_orders_on_close, close_entries_rule, margin_long, margin_short, max_boxes_count, max_lines_count, max_labels_count, risk_free_rate)
    - Create `library()` declaration
    - Add script type validation and compatibility checking
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

  - [x]* 20.2 Write unit tests for script declarations
    - Test `indicator()` with various parameter combinations
    - Validate `strategy()` with all configuration options
    - Test `library()` declaration
    - Verify script type compatibility checking
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

- [x] 21. Build Canvas Charting Library
  - [x] 21.1 Create chart library core and coordinate system
    - Create `frontend/src/chart/PineChart.ts` main orchestrator class
    - Implement `CoordinateSystem` mapping (barIndex, price) ↔ (x, y) pixel space
    - Implement `Viewport` state management (visible range, bar spacing, zoom level)
    - Implement `LayoutManager` defining chart area, volume area, price scale, time scale regions
    - Add devicePixelRatio-aware canvas scaling for HiDPI/Retina displays
    - Add ResizeObserver for responsive container handling
    - Add dirty flag pattern for lazy re-rendering
    - _Requirements: 21.1, 21.2, 21.3, 21.5, 21.6, 21.10, 21.11, 21.72_

  - [x] 21.2 Implement CandlestickRenderer
    - Render OHLCV candlesticks with body rectangles and wick lines
    - Color bodies/wicks green (#4caf50) for bullish, red (#e94560) for bearish
    - Support bar color overrides from barcolor() output
    - Configurable body width as percentage of bar spacing (default 70%)
    - _Requirements: 21.13, 21.14, 21.15, 21.16_

  - [x] 21.3 Implement VolumeRenderer
    - Render volume bars in dedicated bottom area (20% of chart height)
    - Color bars semi-transparently matching candle direction
    - Scale bar heights relative to maximum visible volume
    - _Requirements: 21.17, 21.18, 21.19_

  - [x] 21.4 Implement LineRenderer for plots
    - Render line plots as connected line segments between data points
    - Support solid, dotted, dashed line styles with configurable width (1-4px)
    - Implement stepline rendering (horizontal + vertical segments)
    - Implement histogram rendering (vertical lines from baseline)
    - Implement circle plots (small filled circles at data points)
    - Implement cross plots (cross marks at data points)
    - Filter null values, breaking lines at gaps
    - Batch draw calls by style (single beginPath/stroke per style group)
    - _Requirements: 21.20, 21.21, 21.22, 21.23, 21.24, 21.25, 21.26, 21.27, 21.28, 21.29_

  - [x] 21.5 Implement AreaRenderer for fills
    - Render fills as filled polygons between two line series
    - Compute polygon by connecting upper line forward and lower line backward
    - Apply configurable fill color with alpha transparency
    - Clip fill polygons to visible chart area
    - _Requirements: 21.37, 21.38, 21.39, 21.40_

  - [x] 21.6 Implement MarkerRenderer for shapes
    - Render shape markers as vector-drawn icons at (barIndex, price) positions
    - Implement shapes: arrowUp, arrowDown, triangleUp, triangleDown, circle, square, diamond, cross, xcross
    - Draw arrow shapes as triangular pointers with stem
    - Draw diamond as rotated square using four line segments
    - Position markers abovebar/belowbar with configurable margin offset
    - Support text labels alongside markers
    - _Requirements: 21.30, 21.31, 21.32, 21.33, 21.34, 21.35, 21.36_

  - [x] 21.7 Implement StrategyMarkerRenderer (via MarkerRenderer)
    - Render entry markers as colored arrows below bar (long=green arrowUp, short=red arrowDown)
    - Render exit markers as colored arrows above bar
    - Render close markers with distinct styling
    - Support text labels showing entry name or comment
    - Skip cancel/cancel_all type markers
    - _Requirements: 21.41, 21.42, 21.43, 21.44, 21.45_

  - [x] 21.8 Implement HLineRenderer
    - Render horizontal lines across full visible width at price level
    - Support solid, dotted, dashed line styles
    - Render hlines on a layer above candlesticks but below plot lines
    - _Requirements: 21.46, 21.47, 21.48_

  - [x] 21.9 Implement GridRenderer and AxisRenderer
    - Render horizontal grid lines at price scale tick intervals
    - Render vertical grid lines at time scale major tick intervals
    - Render price scale labels on right side with configurable precision
    - Render time scale labels on bottom with adaptive formatting
    - Calculate automatic tick spacing for both axes
    - _Requirements: 21.53, 21.54, 21.55, 21.11, 21.12_

  - [x] 21.10 Implement CrosshairRenderer
    - Render vertical line through hovered bar and horizontal line at hovered price
    - Snap vertical line to nearest bar center
    - Display price and time labels on axes at crosshair position
    - Render data window tooltip showing OHLCV and indicator values
    - _Requirements: 21.49, 21.50, 21.51, 21.52_

  - [x] 21.11 Implement InteractionHandler for zoom and pan
    - Handle mouse wheel zoom centered on cursor position
    - Handle pinch-to-zoom on touch devices
    - Handle click-and-drag horizontal panning on chart area
    - Handle mouse drag vertical zoom/pan on price scale area
    - Implement momentum-based inertial scrolling
    - Enforce min/max bar spacing limits (2px to 100px)
    - _Requirements: 21.56, 21.57, 21.58, 21.59, 21.60, 21.61_

  - [x] 21.12 Implement PineChart API and event system
    - Expose `createChart(container, options)` factory function
    - Expose `chart.setCandles(data)`, `chart.setVolume(data)`
    - Expose `chart.addPlotSeries(name, options)` returning series handle
    - Expose `chart.setMarkers(markers)`, `chart.setFills(fills)`, `chart.setHLines(hlines)`
    - Expose `chart.removeSeries(name)`
    - Expose `chart.timeScale()` with fitContent(), scrollTo(), scrollToDate()
    - Expose `chart.applyOptions(options)`, `chart.remove()`
    - Emit events: onCrosshairMove, onVisibleRangeChange, onResize
    - _Requirements: 21.82, 21.83, 21.84, 21.85, 21.86, 21.87, 21.88, 21.89, 21.90, 21.91, 21.92, 21.93, 21.94_

  - [x] 21.13 Implement double buffering and render loop
    - Create offscreen canvas for double buffering
    - Implement requestAnimationFrame-based render loop
    - Only redraw when dirty flag is set
    - _Requirements: 21.67, 21.71_

  - [x] 21.14 Implement theming and styling options
    - Support configurable background color, text color, grid color, border colors
    - Default dark theme (background #1a1a2e, text #e0e0e0, grid #2a2a4e, border #0f3460)
    - Support configurable font family and size for labels and tooltips
    - _Requirements: 21.95, 21.96, 21.97_

  - [x]* 21.15 Write unit tests for canvas charting library
    - Test coordinate system transforms (data space ↔ pixel space)
    - Test viewport calculations (visible range, zoom level)
    - Test layout manager region calculations
    - Test candlestick rendering with known data
    - Test line rendering with various styles
    - Test marker positioning (abovebar/belowbar)
    - Test fill polygon computation
    - Test crosshair snapping to bar
    - Test zoom/pan interaction handling
    - _Requirements: 21.1-21.97_

  - [x] 21.16 Implement CharRenderer for plotchar()
    - Render text characters/glyphs at (barIndex, price) positions on canvas
    - Support unicode characters and custom symbols in the char parameter
    - Position characters at abovebar, belowbar, top, bottom, or absolute price levels
    - Apply configurable color, size, and offset
    - _Requirements: 6.19, 6.20, 6.21_

  - [x] 21.17 Implement ArrowRenderer for plotarrow()
    - Render directional arrows with colorup for positive series values
    - Render colordown for negative series values
    - Scale arrow height between minheight and maxheight based on series magnitude
    - Draw arrow shaft and head as vector paths
    - _Requirements: 6.22, 6.23, 6.24_

  - [x] 21.18 Implement BarColorRenderer for barcolor()
    - Override candle body and wick colors for bars where barcolor condition is truthy
    - Render both candle body and wick with the specified color
    - Apply bar color overrides after standard candlestick rendering
    - _Requirements: 6.29, 6.30_

  - [x] 21.19 Implement BackgroundRenderer for bgcolor()
    - Color chart background for bars where bgcolor condition is truthy
    - Support conditional coloring where different bars have different background colors
    - Render as vertical strips behind all other chart elements
    - _Requirements: 6.27, 6.28_

  - [x] 21.20 Implement LabelRenderer
    - Render text labels as styled rectangles with text at (barIndex, price) positions
    - Support all label styles (label_up, label_down, label_left, label_right, label_center, square, diamond, circle, cross)
    - Render label background color with configurable border and text color
    - Support text alignment (left, center, right) and font size
    - Support xloc (bar_index, bar_time) and yloc (price, abovebar, belowbar) positioning
    - Update label positions when chart is zoomed or panned
    - _Requirements: 7.1-7.14_

  - [x] 21.21 Implement DrawingLineRenderer
    - Render drawing lines between two points with configurable color, style, width
    - Support solid, dotted, dashed line styles
    - Support extend modes (none, left, right, both) extending lines beyond endpoints
    - Support xloc (bar_index, bar_time) positioning
    - Update line positions when chart is zoomed or panned
    - _Requirements: 7.15-7.24_

  - [x] 21.22 Implement BoxRenderer
    - Render rectangles with configurable border color, width, style, and background color
    - Support text inside boxes with configurable color, size, halign, valign, wrap
    - Support extend modes for horizontal extension
    - Support xloc (bar_index, bar_time) positioning
    - Update box positions when chart is zoomed or panned
    - _Requirements: 7.25-7.33_

  - [x] 21.23 Implement PolylineRenderer
    - Render multi-point lines connecting a series of points
    - Support straight line connections between points
    - Support curved connections using bezier interpolation when curved=true
    - Support closed paths creating polygons with fill_color
    - Support configurable line_color, line_style, line_width
    - _Requirements: 7.34-7.37_

  - [x] 21.24 Implement LineFillRenderer
    - Render filled areas between two line objects
    - Compute fill polygon by connecting line1 and line2 endpoints
    - Apply configurable fill color with alpha transparency
    - Update fill area when referenced lines are repositioned
    - _Requirements: 7.38-7.41_

  - [x] 21.25 Implement TableRenderer
    - Render floating data tables as overlay elements on the canvas
    - Support table positioning (top, middle, bottom × left, center, right)
    - Render cells with configurable background color, text color, text size, width, height
    - Support cell text with tooltip on hover
    - Support merged cells via merge_cells
    - Render table frame and border lines
    - _Requirements: 7.42-7.48_

  - [x] 21.26 Implement AlertMarkerRenderer
    - Render alert trigger markers on chart at the bar where alert fired
    - Display alert message text as tooltip or label
    - Apply distinct visual styling for alert markers (e.g., warning icon or colored marker)
    - _Requirements: 14.13_

- [x] 22. Checkpoint - Canvas Charting Library validation
  - Ensure canvas renders candlesticks, volume, and plot lines correctly
  - Verify zoom (mouse wheel) and pan (drag) work smoothly
  - Test crosshair shows correct OHLCV values on hover
  - Verify shape markers render at correct positions (abovebar/belowbar)
  - Verify fill polygons render between plot lines
  - Verify strategy markers render with correct colors and directions
  - Verify drawing objects (labels, lines, boxes, polylines, linefills, tables) render correctly on canvas
  - Verify plotchar and plotarrow render at correct positions
  - Verify bgcolor and barcolor apply correctly
  - Verify alert markers render on triggered bars
  - Test resize handling maintains chart proportions
  - Ask the user if questions arise.

- [x] 22.1 Wire all drawing/alert builtins into execution engine
  - Register label.new, label.copy, label.delete, label.set_*, label.get_* as builtins
  - Register line.new, line.copy, line.delete, line.set_*, line.get_* as builtins
  - Register box.new, box.copy, box.delete, box.set_*, box.get_* as builtins
  - Register polyline.new, polyline.delete as builtins
  - Register linefill.new, linefill.delete, linefill.set_color, linefill.get_line1, linefill.get_line2 as builtins
  - Register table.new, table.cell, table.clear, table.delete, table.merge_cells, table.cell_set_* as builtins
  - Register chart.point.new, chart.point.now, chart.point.from_index, chart.point.from_time, chart.point.copy as builtins
  - Register alert() as builtin with alert.freq_* namespace values
  - Register bgcolor() and barcolor() as builtins
  - Wire DrawingEngine and AlertSystem methods to execution engine context
  - _Requirements: 7.1-7.59, 14.9-14.16_

- [x] 23. Restructure project as pnpm monorepo
  - [x] 23.1 Create root `pnpm-workspace.yaml`
    - Declare workspace packages: `src` (engine), `frontend`, `backend`
    - _Requirements: 18.1_
  
  - [x] 23.2 Restructure root `package.json`
    - Add workspace-level scripts: `dev`, `build`, `test`, `lint`, `typecheck`
    - Add `concurrently` dev dependency for parallel dev servers
    - Set `private: true` to prevent accidental publish
    - _Requirements: 18.2, 18.8, 18.9, 18.10_
  
  - [x] 23.3 Clean up frontend package
    - Remove `frontend/pnpm-lock.yaml` (nested lockfile)
    - Remove `frontend/pnpm-workspace.yaml` (not a real workspace config)
    - Remove `frontend/node_modules/` (will be hoisted to root)
    - Update `frontend/package.json` to add `"pine-framework": "workspace:*"` as dependency
    - _Requirements: 18.3, 18.4, 18.12_
  
  - [x] 23.4 Create backend package scaffold
    - Create `backend/` directory with `package.json` (name: `pine-framework-backend`)
    - Add `"pine-framework": "workspace:*"` as dependency
    - Set up TypeScript config extending root
    - _Requirements: 18.5, 18.9_
  
  - [x] 23.5 Verify monorepo works
    - Run `pnpm install` from root — all dependencies hoisted correctly
    - Run `pnpm build` — engine builds first, then backend, then frontend
    - Run `pnpm dev` — both frontend (3000) and backend (8080) start
    - Run `pnpm test` — tests run across all packages
    - _Requirements: 18.6, 18.7, 18.8, 18.9, 18.10_

- [x] 24. Checkpoint - Monorepo validation
  - Ensure single pnpm-lock.yaml at root
  - Verify no nested node_modules or lockfiles
  - Test workspace dependency linking
  - Ask the user if questions arise.

- [x] 25. Implement Backend API Server
  - [x] 25.1 Set up Express server with TypeScript
    - Create `backend/src/index.ts` entry point
    - Configure Express with CORS, JSON body parsing
    - Set up TypeScript compilation and dev script
    - Add environment variable config (PORT, BYBIT_REST_URL, BYBIT_WS_URL)
    - _Requirements: 19.1, 19.8, 19.9_
  
  - [x] 25.2 Implement REST API endpoints
    - `GET /api/ohlcv` — fetch historical kline data (symbol, interval, limit params)
    - `POST /api/execute` — accept Pine Script code, execute via engine, return results
    - `GET /api/symbols` — list available trading symbols from Bybit
    - `GET /api/status` — server status and Bybit connection health
    - _Requirements: 19.1, 19.3, 19.12_
  
  - [x] 25.3 Implement WebSocket gateway
    - Set up `ws` library on the Express server
    - Handle client connection/disconnection lifecycle
    - Process subscribe/unsubscribe messages for kline topics
    - Broadcast realtime kline data to subscribed clients
    - Handle multiple concurrent WebSocket clients
    - _Requirements: 19.2, 19.5, 19.6_
  
  - [x] 25.4 Integrate pine-framework engine for script execution
    - Import `pine-framework` engine API in backend
    - Parse Pine Script code via engine parser/compiler
    - Execute script against provided OHLCV data
    - Return plot data, drawing objects, and errors as JSON
    - _Requirements: 19.3_
  
  - [x] 25.5 Implement OHLCV data cache
    - Create LRU cache for recent kline data per symbol+interval
    - Serve cached data for REST requests when available
    - Invalidate cache on new realtime data
    - _Requirements: 19.7_
  
  - [x] 25.6 Add request validation and error handling
    - Validate all REST request parameters (symbol format, interval values, limit bounds)
    - Return proper HTTP error codes and messages
    - Handle engine execution errors gracefully
    - _Requirements: 19.12, 19.10_
  
  - [x] 25.7 Write tests for backend API
    - Unit tests for REST endpoints with mock data
    - Unit tests for WebSocket message handling
    - Integration test for script execution pipeline
    - _Requirements: 19.1, 19.2, 19.3_

- [x] 26. Checkpoint - Backend validation
  - Ensure REST API returns OHLCV data
  - Verify WebSocket streams realtime candles
  - Test Pine Script execution via POST /api/execute
  - Validate error handling for invalid requests
  - Ask the user if questions arise.

- [x] 27. Implement Bybit Exchange Integration
  - [x] 27.1 Create Bybit REST client
    - Implement `fetchKline()` using Bybit V5 REST API (`/v5/market/kline`)
    - Support all intervals: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d, 1w, 1M
    - Support pagination for large historical data requests
    - Normalize Bybit response to engine `Bar` interface
    - _Requirements: 20.1, 20.3, 20.5_
  
  - [x] 27.2 Create Bybit WebSocket client
    - Connect to `wss://stream.bybit.com/v5/public/linear`
    - Subscribe to kline topics (`kline.{interval}.{symbol}`)
    - Parse incoming kline messages and normalize to engine format
    - Handle WebSocket reconnection with exponential backoff
    - Handle Bybit heartbeat/ping-pong
    - _Requirements: 20.2, 20.6_
  
  - [x] 27.3 Implement DataSource adapter
    - Implement engine's `DataSource` interface for `request.security()` support
    - Map Bybit symbols to engine data source identifiers
    - Handle data alignment and gap detection
    - _Requirements: 20.10_
  
  - [x] 27.4 Implement rate limiting
    - Track Bybit API call frequency (120 req/s for public endpoints)
    - Queue excess requests and retry after delay
    - Log rate limit warnings
    - _Requirements: 20.7_
  
  - [x] 27.5 Wire Bybit adapter into backend
    - Inject Bybit adapter into backend API handlers
    - Use Bybit data for OHLCV REST endpoint
    - Stream Bybit WebSocket data through backend WS gateway
    - _Requirements: 20.1, 20.2_
  
  - [x] 27.6 Write tests for Bybit adapter
    - Unit tests for REST client with mocked Bybit responses
    - Unit tests for WebSocket client with simulated messages
    - Integration test for data normalization
    - Test reconnection logic
    - _Requirements: 20.1, 20.2, 20.5_

- [x] 28. Checkpoint - Bybit integration validation
  - Ensure historical OHLCV data fetches from Bybit
  - Verify realtime kline streaming works
  - Test data normalization matches engine format
  - Validate reconnection on disconnect
  - Ask the user if questions arise.

- [x] 29. Update Frontend to Integrate with Backend
  - [x] 29.1 Update data fetching to use Backend REST API
    - Replace mock data generation with `GET /api/ohlcv` calls
    - Pass symbol, interval, and limit parameters
    - Handle loading states and error responses
    - _Requirements: 17.1, 17.12_
  
  - [x] 29.2 Update WebSocket connection to Backend
    - Connect to `ws://localhost:8080/ws` (Backend)
    - Send subscribe/unsubscribe messages on symbol/interval change
    - Handle incoming kline messages and update PineChart canvas
    - _Requirements: 17.8, 17.12_
  
  - [x] 29.3 Send scripts to Backend for execution
    - On editor close or Run button, POST script to `/api/execute`
    - Pass returned plot data, shapes, fills, strategyMarkers to PineChart API
    - Display compilation/runtime errors in error console
    - _Requirements: 17.4, 17.5, 17.6, 17.7, 17.13_
  
  - [x] 29.4 Update symbol/timeframe controls
    - Fetch available symbols from `GET /api/symbols`
    - Populate symbol and interval dropdowns dynamically
    - _Requirements: 17.11_
  
  - [x]* 29.5 Write integration tests for frontend-backend
    - Test end-to-end flow: select symbol → load data → write script → execute → render on canvas
    - Test error display for compilation failures
    - Test realtime chart updates
    - _Requirements: 17.1, 17.4, 17.8_

- [x] 30. Final Checkpoint - Full System Validation with Canvas Chart
  - Start entire system: `pnpm dev` from root
  - Select BTCUSDT, 1m interval — verify real candles render on canvas
  - Write simple SMA indicator — verify line plot renders on canvas
  - Write plotshape script — verify shape markers render on canvas
  - Write fill script — verify fill polygon renders between plots
  - Write strategy script — verify entry/exit markers render on canvas
  - Test crosshair hover shows OHLCV + indicator values
  - Test zoom (scroll wheel) and pan (drag) on canvas
  - Test error handling with invalid Pine Script
  - Test realtime updates as new candles arrive
  - Verify all monorepo scripts work (build, test, lint)
  - Ask the user if questions arise.

- [x] 31. Enhance Parser for Named Arguments and Namespace Tokens
  - [x] 31.1 Add named arguments support to function call parsing
    - Parse `identifier = expression` as named arguments in function calls
    - Support `colorType = expression` and `stringType = expression` as named argument names
    - Forward named arguments as a Record to built-in functions
    - _Requirements: 1.8_
  
  - [x] 31.2 Extend identifier recognition for namespace tokens
    - Support color, shape, location, strategy, indicator, library token types as valid identifiers in member expressions
    - Allow `color.blue`, `shape.triangleup`, `location.abovebar` etc. to resolve correctly
    - _Requirements: 1.9_
  
  - [x]* 31.3 Write tests for named arguments and namespace tokens
    - Test named arguments with various function signatures
    - Test color/shape/location namespace syntax in scripts
    - _Requirements: 1.8, 1.9_

- [x] 32. Enhance TA Engine with Real Implementations
  - [x] 32.1 Implement real ta.sma() with circular buffer
    - Replace stub with buffer-based SMA calculation
    - Return NA until sufficient data points accumulated
    - Support configurable lookback window
    - _Requirements: 4.7_
  
  - [x] 32.2 Implement real ta.ema() with exponential formula
    - Replace stub with proper EMA calculation using prev * (1-k) + source * k
    - Initialize on first value and track state across bars
    - _Requirements: 4.8_
  
  - [x] 32.3 Implement proper ta.crossover() and ta.crossunder()
    - Add internal state tracking (crossCallIndex, crossPrevValues)
    - Detect when source crosses above (crossover) or below (crossunder) compare
    - Return false on first call, then track previous values
    - _Requirements: 4.9, 4.10_
  
  - [x]* 32.4 Write tests for real TA implementations
    - Test ta.sma() with various lengths and data sequences
    - Test ta.ema() convergence behavior
    - Test ta.crossover() and ta.crossunder() detection
    - _Requirements: 4.7, 4.8, 4.9, 4.10_

- [x] 33. Enhance Plot Engine with Markers, Fills, and Auto-Detection
  - [x] 33.1 Render plotshape() as chart markers via canvas
    - Produce shape data structures with bar index, position, and color for canvas rendering
    - Map Pine shape names to vector-drawn shapes (arrows, circles, squares, diamonds)
    - Support abovebar/belowbar positioning
    - _Requirements: 6.16_
  
  - [x] 33.2 Implement fill() as canvas polygon rendering
    - Produce fill data structures with upper/lower plot references and color
    - Support named `color` argument for fill color
    - Merge plot data from both references for polygon computation
    - _Requirements: 6.18, 6.20_
  
  - [x] 33.3 Auto-detect plot titles from variable names
    - When no explicit title is provided to plot(), use the first argument's variable name
    - Parse variable name from Identifier expression nodes
    - _Requirements: 6.14_
  
  - [x] 33.4 Add named arguments support to plot and other functions
    - Support `color`, `linewidth`, `title` as named arguments
    - Encode color and linewidth in output key metadata
    - _Requirements: 6.15_
  
  - [x] 33.5 Add color, shape, and location namespace builtins
    - Implement `color.blue`, `color.red`, `color.green` etc. resolving to hex values
    - Implement `shape.triangleup`, `shape.circle` etc. returning string identifiers
    - Implement `location.abovebar`, `location.belowbar` etc. returning string identifiers
    - Add `color.new(color, transp)` builtin for transparency support
    - Add `alertcondition()` builtin (no-op)
    - _Requirements: 6.19, 15.8, 15.9_
  
  - [x]* 33.6 Write tests for plot enhancements
    - Test plotshape() shape data generation with various shapes
    - Test fill() data generation between plots
    - Test auto-detection of plot titles
    - Test named arguments in plot calls
    - Test color/shape/location namespace resolution
    - _Requirements: 6.14, 6.15, 6.16, 6.18, 6.19, 6.20_

- [x] 34. Enhance Strategy Engine with Full Integration
  - [x] 34.1 Implement position reversal on opposite direction entry
    - When strategy.entry() is called with opposite direction, close existing position first
    - Then open new position in the requested direction
    - _Requirements: 8.13_
  
  - [x] 34.2 Defer market order fills to next bar open
    - All orders (market, limit) go to pendingOrders queue
    - Market orders are filled at the next bar's open price via fillPendingMarketOrders()
    - _Requirements: 8.14_
  
  - [x] 34.3 Add exit markers with comments
    - Render exit markers with optional comment text on chart
    - Pass comment through to marker entries
    - _Requirements: 8.15_
  
  - [x] 34.4 Wire strategy markers through execution result
    - Return strategyMarkers as part of ExecutionResult
    - Map StrategyEngine markers to StrategyMarkerEntry format
    - _Requirements: 8.16_
  
  - [x] 34.5 Add strategy.position_size builtin
    - Return current position quantity from strategy engine
    - _Requirements: 8.17_
  
  - [x] 34.6 Add strategy.commission.percent support
    - Support percent-based commission type in strategy configuration
    - _Requirements: 8.18_
  
  - [x] 34.7 Add strategy.close() with named arguments
    - Support `id` and `comment` as named arguments
    - _Requirements: 8.19_
  
  - [x] 34.8 Add strategy.close_all() builtin
    - Close all open positions at once
    - _Requirements: 8.20_
  
  - [x]* 34.9 Write tests for strategy enhancements
    - Test position reversal on opposite direction entry
    - Test market order fill deferral to next bar
    - Test exit markers with comments
    - Test strategyMarkers in execution result
    - Test strategy.position_size builtin
    - Test strategy.close() with named arguments
    - _Requirements: 8.13, 8.14, 8.15, 8.16, 8.17, 8.18, 8.19, 8.20_

- [x] 35. Wire Shapes, Fills, and Strategy Markers Through Full Stack
  - [x] 35.1 Add shapes, fills, strategyMarkers to engine API
    - Update executePineScript() return type to include shapes, fills, strategyMarkers
    - _Requirements: 3.8, 3.9, 3.10_
  
  - [x] 35.2 Return shapes, fills, strategyMarkers from backend
    - Update POST /api/execute response to include shapes, fills, strategyMarkers
    - Map engine types to API response format
    - _Requirements: 19.14_
  
  - [x] 35.3 Render shapes as markers in frontend via PineChart
    - Parse shape data from execute response
    - Pass to chart.setMarkers() for canvas-drawn vector markers at correct bar/price positions
    - _Requirements: 17.19_
  
  - [x] 35.4 Render strategy markers in frontend via PineChart
    - Parse strategyMarkers from execute response
    - Pass to chart.setMarkers() for canvas-drawn directional arrows
    - Color code by direction (green for long entry, red for short entry, etc.)
    - _Requirements: 17.20_
  
  - [x] 35.5 Render fills in frontend via PineChart
    - Parse fill data from execute response
    - Pass to chart.setFills() for canvas-rendered filled polygons between plot lines
    - _Requirements: 17.21_
  
  - [x]* 35.6 Write tests for full stack integration
    - Test shapes flow from engine to canvas rendering
    - Test strategy markers flow from engine to canvas rendering
    - Test fills flow from engine to canvas rendering
    - _Requirements: 3.8, 3.9, 3.10, 17.19, 17.20, 17.21_

- [x] 36. Fix Execution Engine Edge Cases
  - [x] 36.1 Fix var/varip variable persistence across bars
    - When re-declaring a var variable, preserve existing series state instead of resetting
    - Check for existing binding before creating new one
    - _Requirements: 3.13_
  
  - [x] 36.2 Fix for-loop inclusive iteration
    - Change `for i = start; i < end` to `for i = start; i <= end` to match Pine semantics
    - _Requirements: 3.14_
  
  - [x] 36.3 Fix pushBarValues for empty series
    - Guard against pushing to empty series in var/varip pushBarValues
    - _Requirements: 3.13_
  
  - [x]* 36.4 Write tests for execution edge cases
    - Test var persistence across multiple bar executions
    - Test for-loop inclusive iteration
    - Test pushBarValues with empty series
    - _Requirements: 3.13, 3.14_

- [x] 37. Enhance Input and Time Functions
  - [x] 37.1 Add input.time() builtin
    - Support timestamp-type inputs with default values
    - Handle named arguments for input configuration
    - _Requirements: 12.8_
  
  - [x] 37.2 Enhance timestamp() with string format support
    - Accept date string as first argument (e.g., "2024-01-15")
    - Support optional parameters (month, day, hour, minute, second default to 0)
    - _Requirements: 13.8, 13.9_
  
  - [x] 37.3 Fix str.format() with mixed argument types
    - Filter out non-primitive arguments (objects, functions) from format substitution
    - _Requirements: 13.4_
  
  - [x]* 37.4 Write tests for input and time enhancements
    - Test input.time() with various default values
    - Test timestamp() with string format
    - Test timestamp() with optional parameters
    - Test str.format() with mixed argument types
    - _Requirements: 12.8, 13.8, 13.9, 13.4_

- [x] 38. Enhance Frontend Chart Rendering
  - [x] 38.1 Auto-focus chart to new symbol's price range
    - Call fitContent() on time scale when symbol or timeframe changes
    - Add dataVersion state to trigger re-render on symbol switch
    - _Requirements: 17.22_
  
  - [x] 38.2 Filter invalid data points
    - Filter out candles with time=0 or non-finite OHLC values
    - Filter out null plot values before passing to PineChart canvas renderer
    - _Requirements: 17.23_
  
  - [x] 38.3 Auto-assign distinct colors to plot lines
    - When plot color is not specified, cycle through a predefined color palette
    - Parse color and linewidth from output key metadata
    - _Requirements: 17.24, 17.25_
  
  - [x] 38.4 Handle non-JSON server responses
    - Check response.ok before parsing JSON
    - Show server error status and text on non-200 responses
    - _Requirements: 19.15_
  
  - [x]* 38.5 Write tests for frontend enhancements
    - Test chart auto-focus on symbol switch
    - Test data filtering for invalid points
    - Test auto-assignment of plot colors
    - _Requirements: 17.22, 17.23, 17.24, 17.25_

- [x] 39. Enhance Backend Data Handling
  - [x] 39.1 Increase JSON body limit to 5MB
    - Configure express.json() with `{ limit: '5mb' }` for large script executions
    - _Requirements: 19.13_
  
  - [x] 39.2 Validate WebSocket kline data
    - Check timestamp is valid and OHLC values are finite before forwarding
    - _Requirements: 19.16_
  
  - [x]* 39.3 Write tests for backend enhancements
    - Test large JSON body acceptance
    - Test WebSocket data validation with invalid data
    - _Requirements: 19.13, 19.16_

- [x] 40. Add Complex Script Integration Tests
  - [x] 40.1 Create complex script integration test suite
    - Add 25 integration tests covering: candle size classifier, streak counter, manual SMA, price position, trend detection, math chains, volume signal, complex conditions, multi-plot, range classification, rolling max, signal cooldown, percent change, OHLC score, trailing stop, range ratio, cumulative sum, breakout detection, weighted close, volatility index, state machine, max drawdown, bar color, combined signal, performance test
    - _Requirements: 11.8_
  
  - [x] 40.2 Update strategy engine tests for market order fill deferral
    - Add `engine.updateBar()` calls after entry/exit orders to trigger fill at next bar open
    - Update expected fill prices to match next bar's open
    - _Requirements: 11.9_
  
  - [x]* 40.3 Write additional edge case tests
    - Test scripts with no plot calls
    - Test scripts with only strategy functions
    - Test scripts mixing indicators and strategies
    - _Requirements: 11.8, 11.9_

- [x] 41. Checkpoint - Full Feature Validation with Canvas Chart
  - Verify named arguments work in function calls
  - Verify ta.sma(), ta.ema(), ta.crossover(), ta.crossunder() produce correct results
  - Verify plotshape produces shape data for canvas rendering
  - Verify fill produces fill data for canvas polygon rendering
  - Verify strategy entry reversal works correctly
  - Verify market orders fill at next bar open
  - Verify shapes, fills, strategyMarkers render correctly on canvas chart
  - Verify 25 integration tests pass
  - Ask the user if questions arise.

- [x] 42. Enhance Price Range and Chart Interaction
  - [x] 42.1 Add manual/auto price range management to LayoutManager
    - Add `setManualPriceRange()`, `zoomPrice()`, `panPrice()`, `resetAutoPriceRange()` methods
    - Track manual vs auto price range mode with `manualPriceRange` flag
    - Auto price range computed from visible candles/plots; manual set by user drag or shift+wheel
    - _Requirements: 21.67, 21.68, 21.69, 21.70_
  
  - [x] 42.2 Add price scale interaction to InteractionHandler
    - Detect clicks on price scale region vs chart area using LayoutManager regions
    - Support vertical drag on price scale for panning (ns-resize cursor)
    - Support Shift+scroll-wheel for vertical zoom on price scale
    - Add double-click to reset auto price range and fit content
    - Add `onPriceRangeChange` callback to interaction events
    - _Requirements: 21.68, 21.69, 21.70_
  
  - [x] 42.3 Improve price range computation in PineChart
    - Filter non-finite and near-zero plot values (|v| < 1e-10) from auto price range
    - Clamp total price range to at most 10x candle price range to prevent excessive scaling
    - Handle edge case when no valid candles or plots exist (fallback to 0-100 range)
    - _Requirements: 21.71, 21.72_
  
  - [x]* 42.4 Write tests for price range and interaction enhancements
    - Test manual price range persistence across candle updates
    - Test price range clamping with extreme plot values
    - _Requirements: 21.67, 21.68, 21.69, 21.70, 21.71, 21.72_

- [x] 43. Enhance Strategy Marker Naming and Parameters
  - [x] 43.1 Add comment parameter to strategy.entry() and strategy.exit()
    - Accept optional `comment` parameter in StrategyEngine.entry() and StrategyEngine.exit()
    - Use comment text as marker name when provided, overriding defaults
    - Forward comment through ExecutionEngine strategy builtins
    - _Requirements: 8.23, 8.24, 8.25, 8.26_
  
  - [x] 43.2 Add stop and limit parameters to strategy.entry() and strategy.exit()
    - Forward `stop` and `limit` parameters through ExecutionEngine builtins
    - Support variable-length argument parsing for strategy.entry and strategy.exit
    - Parse positional args: strategy.entry(id, direction, qty, price, stop, limit, comment)
    - _Requirements: 8.21, 8.22_
  
  - [x] 43.3 Implement TradingView-convention marker naming
    - Entry markers default to capitalized direction name ("Long"/"Short") when no comment given
    - Exit markers default to "Exit {id}" format matching TradingView convention
    - Close markers formatted as "Exit {name}" matching exit marker convention
    - _Requirements: 8.24, 8.25, 8.26, 8.28_
  
  - [x] 43.4 Add comment field to backend strategy markers response
    - Include `comment` field in each strategy marker entry returned from POST /api/execute
    - _Requirements: 19.17_
  
  - [x] 43.5 Support named arguments for strategy.entry() and strategy.exit()
    - Parse named arguments object (comment, stop, limit) from last argument in rest params
    - Merge named values with positional parameters, preferring named when both present
    - _Requirements: 8.27_
  
  - [x]* 43.6 Write tests for strategy naming and parameter enhancements
    - Test comment parameter overrides default entry/exit marker names
    - Test "Long"/"Short" default entry marker names by direction
    - Test "Exit {id}" default exit marker naming
    - Test comment field in strategy markers via backend execute response
    - _Requirements: 8.21, 8.22, 8.23, 8.24, 8.25, 8.26, 8.27, 8.28_

- [x] 44. Checkpoint - Price Range and Strategy Naming Validation
  - Verify manual price range persists across candle updates
  - Verify double-click resets to auto price range and fits content
  - Verify Shift+wheel zooms price scale, not time scale
  - Verify strategy.entry markers show "Long"/"Short" by direction
  - Verify strategy.exit markers show "Exit {id}" by default
  - Verify comment parameter overrides marker names for entry and exit
  - Verify stop and limit parameters forward correctly in strategy builtins
  - Verify named arguments work for strategy.entry() and strategy.exit()
  - Verify 819+ tests pass across all suites
  - Ask the user if questions arise.

- [x] 45. Implement Real-Time Indicator Re-Execution on New Candles
  - [x] 45.1 Add incremental real-time bar execution API to engine
    - Expose `executeRealtimeBar(context)` on ExecutionEngine that processes a single new bar while preserving prior state
    - Ensure `createSnapshot()` and `rollbackToSnapshot()` are used for error recovery during real-time updates
    - Return full execution result (outputs, shapes, fills, strategyMarkers) from real-time bar execution
    - _Requirements: 3.15, 3.16, 3.17_
  
  - [x] 45.2 Create Backend ScriptSession manager
    - Maintain a `ScriptSession` per WebSocket client storing: compiled ExecutionEngine instance, source code, current bar array
    - On `POST /api/execute`, store the compiled engine and bars in the session instead of discarding them
    - Provide a method to append/update a bar and call `executeRealtimeBar()` on the persisted engine
    - _Requirements: 19.18, 19.19_
  
  - [x] 45.3 Wire kline updates to persisted engine re-execution
    - When a new kline arrives from Bybit WebSocket, locate the session for the matching client
    - Append or update the bar in the session's bar set
    - Call `executeRealtimeBar()` on the persisted engine with the new bar context
    - _Requirements: 19.19_
  
  - [x] 45.4 Push updated results to frontend via WebSocket
    - Add new `execution_result` WebSocket message type to backend gateway
    - Send updated outputs, shapes, fills, strategyMarkers, and barIndex after each real-time re-execution
    - _Requirements: 19.20, 19.21_
  
  - [x] 45.5 Add execute command WebSocket message
    - Support client sending `{ type: "execute", data: { source: "…" } }` over WebSocket to register a script for persistent execution
    - Parse and compile the script, create the session, and return initial execution results
    - _Requirements: 19.18_
  
  - [x] 45.6 Update Frontend for automatic re-execution
    - Store the last submitted script code in a ref for automatic re-submission
    - When WebSocket kline data arrives, after updating candle state, automatically call execute if a script is stored
    - Handle `execution_result` WebSocket messages to update indicator overlays
    - _Requirements: 17.26, 17.27, 17.28_
  
  - [x] 45.7 Handle incremental candle updates (real-time wick updates)
    - When a kline arrives with the same timestamp as the last bar, update the bar in-place (live candle wick update)
    - Re-execute the engine with the updated bar to reflect intra-bar price changes
    - _Requirements: 19.19_

  - [x]* 45.8 Write tests for real-time execution pipeline
    - Test incremental bar execution via executeRealtimeBar()
    - Test ScriptSession persistence and bar append/update
    - Test execution_result WebSocket message format
    - Test frontend auto re-execution on kline arrival
    - _Requirements: 3.15, 3.16, 3.17, 19.18, 19.19, 19.20, 19.21, 17.26, 17.27, 17.28_

- [x] 46. Checkpoint - Real-Time Indicator Re-Execution Validation
  - Deploy backend and frontend, connect to Bybit
  - Write a simple SMA crossover indicator script
  - Verify that when a new candle arrives via WebSocket, the SMA line updates on the chart automatically
  - Verify that strategy positions and markers update on new candles
  - Verify that the chart candles update in real-time while indicators track them
  - Verify that reconnect/re-subscribe still triggers auto-execution
  - Verify all tests pass
  - Ask the user if questions arise.

- [ ] 47. Implement Broker Simulator
  - [ ] 47.1 Create Account model and state management
    - Implement Account data model: { initial_capital, balance, equity, margin_used, free_margin }
    - Track balance updates from P&L, commissions, deposits
    - Compute equity = balance + unrealized P&L
    - Compute free_margin = equity - margin_used
    - _Requirements: 22.9, 22.44, 22.48_

  - [ ] 47.2 Create Order Manager
    - Implement order lifecycle: pending → accepted → filled/cancelled/expired
    - Maintain active order book (pending orders, working orders, filled orders)
    - Register OrderRequest events from strategy execution as PendingOrders
    - Validate orders against account state (margin, pyramiding, position sizing)
    - _Requirements: 22.13, 22.14_

  - [ ] 47.3 Create Fill Engine
    - Implement market order fills at next available price (bar open + slippage)
    - Implement limit order fills when price crosses limit level
    - Implement stop order fills when price breaches stop level (converted to market)
    - Implement stop-limit fills: stop trigger → limit order
    - Support intrabar resolution for more accurate fill prices
    - _Requirements: 22.15, 22.51, 22.52, 22.53, 22.54_

  - [ ] 47.4 Create Margin Tracker
    - Compute initial and maintenance margin requirements
    - Check margin sufficiency before allowing new positions
    - Liquidate positions when equity falls below maintenance margin
    - _Requirements: 22.18, 22.58_

  - [ ] 47.5 Create Position Manager
    - Track positions with direction, quantity, avg_entry_price
    - Handle position opening, increasing, reducing, closing, reversal
    - Enforce pyramiding limits (max entries in same direction)
    - _Requirements: 22.19, 22.46_

  - [ ] 47.6 Implement commission and slippage models
    - Commission types: percent, cash per contract, cash per order
    - Slippage modes: fixed ticks, fixed points, percentage
    - Apply commission and slippage to fill prices and P&L
    - _Requirements: 22.16, 22.17, 22.56, 22.57_

  - [ ] 47.7 Implement trade size calculation
    - Support fixed contracts, percentage of equity, fixed cash amount
    - Calculate position size based on default_qty_type and default_qty_value
    - _Requirements: 22.20, 22.59_

- [ ] 48. Implement Backtest Orchestrator
  - [ ] 48.1 Create bar processing loop
    - Iterate bars chronologically over the historical date range
    - For each bar: execute strategy → process orders → advance clock → check fills → update state → record equity point
    - Align multi-timeframe data when needed via Request System
    - _Requirements: 22.9, 22.10, 22.12_

  - [ ] 48.2 Implement intrabar magnification (bar magnifier)
    - Retrieve lower-resolution data series (e.g., 1m for daily bars)
    - Iterate sub-bars within each main bar for fill evaluation
    - Set fill prices to exact sub-bar price where conditions are met
    - _Requirements: 22.11, 22.55_

  - [ ] 48.3 Wire strategy.*() events to Broker Simulator
    - Capture OrderRequest events emitted by strategy.entry/exit/close
    - Pipe events into Order Manager for validation and registration
    - _Requirements: 22.4_

- [ ] 49. Implement Performance Metrics Calculator
  - [ ] 49.1 Implement trade-level metrics
    - Compute per-trade P&L (gross/net), return %, bars held
    - Compute MAE (Maximum Adverse Excursion) and MFE (Maximum Favorable Excursion)
    - _Requirements: 22.25_

  - [ ] 49.2 Implement portfolio-level metrics
    - Net Profit, Gross Profit, Gross Loss, Profit Factor
    - Win Rate, Average Trade, Average Winning/Losing Trade
    - _Requirements: 22.21, 22.24_

  - [ ] 49.3 Implement risk-adjusted metrics
    - Sharpe Ratio (annualized, using daily equity returns)
    - Sortino Ratio (downside deviation only)
    - Max Drawdown and Max Drawdown Duration
    - _Requirements: 22.22, 22.23_

  - [ ] 49.4 Build equity curve and other time series
    - Generate EquityPoint series from per-bar snapshots
    - Generate monthly returns heatmap data
    - Compute Buy & Hold return for comparison
    - _Requirements: 22.26, 22.27_

  - [ ] 49.5 Create BacktestResult data structure
    - Assemble config, metrics, trades[], equity_curve[], orders[]
    - Provide serialization for API responses
    - _Requirements: 22.49, 22.50_

- [ ] 50. Implement Backtest REST API
  - [ ] 50.1 Create job queue and worker system
    - Accept backtest jobs via POST /api/backtest
    - Assign unique job_id and queue for processing
    - Support concurrent backtest workers
    - Track job status: queued → running → completed/failed
    - _Requirements: 22.34, 22.40_

  - [ ] 50.2 Implement status and result endpoints
    - GET /api/backtest/{job_id} returns status and progress
    - GET /api/backtest/{job_id}/result returns full BacktestResult
    - _Requirements: 22.35, 22.36_

  - [ ] 50.3 Add backtest progress reporting
    - Report progress percentage during bar processing loop
    - Support progress polling via status endpoint
    - Optionally push progress via WebSocket
    - _Requirements: 22.37_

- [ ] 51. Implement Backtest Visualization
  - [ ] 51.1 Overlay strategy entry/exit markers on price chart
    - Use existing StrategyMarkerRenderer for entry/exit markers
    - Show trade direction and comment text on markers
    - _Requirements: 22.28_

  - [ ] 51.2 Build equity curve and drawdown chart
    - Render equity curve as line plot below main price chart
    - Render drawdown as shaded area below equity curve
    - _Requirements: 22.29_

  - [ ] 51.3 Create trade list table
    - Sortable table with per-trade statistics (entry/exit, P&L, return, bars, MAE/MFE)
    - Click trade to highlight on chart
    - _Requirements: 22.32_

  - [ ] 51.4 Build backtest report export
    - Export as PDF, HTML, and CSV formats
    - Include metrics summary, trade list, equity curve
    - _Requirements: 22.31_

- [ ] 52. Create Backtest Configuration Panel
  - [ ] 52.1 Build web UI for strategy settings
    - Form for strategy inputs (fast_len, slow_len, etc.)
    - Date range picker for backtest period
    - Symbol and timeframe selectors
    - _Requirements: 22.33_

  - [ ] 52.2 Build broker emulator configuration UI
    - Commission type/value, slippage, margin settings
    - Default quantity type/value, pyramiding limit
    - Initial capital input
    - _Requirements: 22.33_

  - [ ] 52.3 Add run/submit button with progress indicator
    - Submit backtest job via POST /api/backtest
    - Show progress bar during execution
    - Display results on completion
    - _Requirements: 22.37_

- [ ] 53. Implement Data Source Integration for Backtesting
  - [ ] 53.1 Add CSV data import
    - Parse OHLCV data from CSV files
    - Support configurable column mapping
    - _Requirements: 22.5_

  - [ ] 53.2 Add database data adapter
    - Fetch historical data from PostgreSQL/MongoDB
    - Support date-range queries with pagination
    - _Requirements: 22.5_

  - [ ] 53.3 Implement data alignment and gap handling
    - Align multi-timeframe data for request.security() during backtest
    - Forward-fill missing data and handle gaps
    - _Requirements: 22.6, 22.7_

- [x]* 54. Write unit tests for broker simulator
  - Test order lifecycle (pending → accepted → filled/cancelled)
  - Test market order fill at next bar open price
  - Test limit order fill when low/high crosses limit
  - Test stop order trigger and fill
  - Test stop-limit order trigger and limit placement
  - Test margin validation and liquidation
  - Test pyramiding enforcement
  - Test commission calculation (percent, per contract, per order)
  - Test slippage calculation (ticks, points, percent)
  - _Requirements: 22.13-22.20, 22.51-22.60_

- [x]* 55. Write unit tests for performance metrics
  - Test Net Profit, Gross Profit, Gross Loss, Profit Factor
  - Test Win Rate, Average Trade calculations
  - Test Sharpe Ratio and Sortino Ratio
  - Test Max Drawdown and Max Drawdown Duration
  - Test per-trade MAE/MFE computation
  - _Requirements: 22.21-22.27_

- [x]* 56. Write integration tests for backtest engine
  - Run SMA crossover strategy backtest, verify metrics match expected values
  - Test with commission and slippage enabled
  - Test with pyramiding (multiple entries)
  - Test with margin and liquidation scenarios
  - Compare results to TradingView reference output within 0.1% tolerance
  - _Requirements: 22.38, 22.39_

- [x]* 57. Write performance tests for backtest engine
  - Backtest with 1M bars, verify completion within 10 seconds
  - Measure memory usage during large backtests
  - Test concurrent backtest job processing
  - _Requirements: 22.38_

- [ ] 58. Checkpoint - Backtest Engine Validation
  - Ensure Broker Simulator correctly fills orders and manages positions
  - Verify performance metrics match TradingView within 0.1% tolerance
  - Test REST API submit/status/result workflow end-to-end
  - Verify backtest visualization renders correctly on chart
  - Run 1M-bar performance test under 10 seconds
  - Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability (e.g., _Requirements: 1.1, 1.2_)
- Checkpoints ensure incremental validation and prevent integration issues
- Unit tests validate specific examples and edge cases
- Integration tests verify component interactions
- TypeScript is the implementation language as selected by the user
- Tasks 23-30 implement the monorepo restructuring, backend server, Bybit integration, and frontend-backend wiring
- Tasks 31-41 implement enhancements: named args, real TA functions, plotshape markers, fill rendering, strategy integration, execution edge case fixes, frontend improvements, backend hardening, and complex integration tests
- Task 21 (canvas charting library) replaces the previous lightweight-charts integration with a custom HTML5 Canvas rendering engine for full control over shapes, fills, markers, and all visual elements
- Tasks 21.16-21.26 implement canvas renderers for all Pine visual output functions: plotchar, plotarrow, bgcolor, barcolor, labels, drawing lines, boxes, polylines, linefills, tables, and alert markers
- Task 22.1 wires all drawing/alert builtins (label.*, line.*, box.*, polyline.*, linefill.*, table.*, chart.point.*, alert) into the execution engine
- Requirements 6 and 7 comprehensively specify all plotting and drawing function parameters for canvas implementation
- Tasks 47-58 implement the full backtest engine: broker simulator (47), backtest orchestrator (48), performance metrics calculator (49), backtest REST API (50), backtest visualization (51), configuration panel (52), data source integration (53), and comprehensive tests (54-57)

## Task Dependency Graph

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
    { "id": 75, "tasks": ["58"] }
  ]
}
```