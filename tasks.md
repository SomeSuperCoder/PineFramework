# Implementation Plan: Pine Script v5/v6 Engine

## Overview

This implementation plan outlines the step-by-step development of a production-grade Pine Script v5/v6 Engine using TypeScript. The engine will dynamically detect the declared Pine Script version (`//@version=5` or `//@version=6`), parse, execute, and render programs with TradingView-like semantics, featuring a seven-layer architecture with plugin-based extensibility, a web-based frontend for interactive development, a backend API server, and real Bybit market data integration. The entire system is organized as a pnpm monorepo. The plan follows incremental development with checkpoints to ensure correctness and maintainability.

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
    - Default dark theme (background #0d0d18, text #e0e0e0, grid #181830, border #111128)
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
    - Declare workspace packages: `frontend`, `backend` (engine library is the root package)
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
    - Run `pnpm test` — engine integration tests run (Jest, `tests/**/*.test.ts`). Backend and frontend have separate test runners.
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

- [x] 47. Implement Broker Simulator
  - [x] 47.1 Create Account model and state management
    - Implement Account data model: { initial_capital, balance, equity, margin_used, free_margin }
    - Track balance updates from P&L, commissions, deposits
    - Compute equity = balance + unrealized P&L
    - Compute free_margin = equity - margin_used
    - _Requirements: 22.9, 22.44, 22.48_

  - [x] 47.2 Create Order Manager
    - Implement order lifecycle: pending → accepted → filled/cancelled/expired
    - Maintain active order book (pending orders, working orders, filled orders)
    - Register OrderRequest events from strategy execution as PendingOrders
    - Validate orders against account state (margin, pyramiding, position sizing)
    - _Requirements: 22.13, 22.14_

  - [x] 47.3 Create Fill Engine
    - Implement market order fills at next available price (bar open + slippage)
    - Implement limit order fills when price crosses limit level
    - Implement stop order fills when price breaches stop level (converted to market)
    - Implement stop-limit fills: stop trigger → limit order
    - Support intrabar resolution for more accurate fill prices
    - _Requirements: 22.15, 22.51, 22.52, 22.53, 22.54_

  - [x] 47.4 Create Margin Tracker
    - Compute initial and maintenance margin requirements
    - Check margin sufficiency before allowing new positions
    - Liquidate positions when equity falls below maintenance margin
    - _Requirements: 22.18, 22.58_

  - [x] 47.5 Create Position Manager
    - Track positions with direction, quantity, avg_entry_price
    - Handle position opening, increasing, reducing, closing, reversal
    - Enforce pyramiding limits (max entries in same direction)
    - _Requirements: 22.19, 22.46_

  - [x] 47.6 Implement commission and slippage models
    - Commission types: percent, cash per contract, cash per order
    - Slippage modes: fixed ticks, fixed points, percentage
    - Apply commission and slippage to fill prices and P&L
    - _Requirements: 22.16, 22.17, 22.56, 22.57_

  - [x] 47.7 Implement trade size calculation
    - Support fixed contracts, percentage of equity, fixed cash amount
    - Calculate position size based on default_qty_type and default_qty_value
    - _Requirements: 22.20, 22.59_

- [x] 48. Implement Backtest Orchestrator
  - [x] 48.1 Create bar processing loop
    - Iterate bars chronologically over the historical date range
    - For each bar: execute strategy → process orders → advance clock → check fills → update state → record equity point
    - Align multi-timeframe data when needed via Request System
    - _Requirements: 22.9, 22.10, 22.12_

  - [x] 48.2 Implement intrabar magnification (bar magnifier)
    - Retrieve lower-resolution data series (e.g., 1m for daily bars)
    - Iterate sub-bars within each main bar for fill evaluation
    - Set fill prices to exact sub-bar price where conditions are met
    - _Requirements: 22.11, 22.55_

  - [x] 48.3 Wire strategy.*() events to Broker Simulator
    - Capture OrderRequest events emitted by strategy.entry/exit/close
    - Pipe events into Order Manager for validation and registration
    - _Requirements: 22.4_

- [x] 49. Implement Performance Metrics Calculator
  - [x] 49.1 Implement trade-level metrics
    - Compute per-trade P&L (gross/net), return %, bars held
    - Compute MAE (Maximum Adverse Excursion) and MFE (Maximum Favorable Excursion)
    - _Requirements: 22.25_

  - [x] 49.2 Implement portfolio-level metrics
    - Net Profit, Gross Profit, Gross Loss, Profit Factor
    - Win Rate, Average Trade, Average Winning/Losing Trade
    - _Requirements: 22.21, 22.24_

  - [x] 49.3 Implement risk-adjusted metrics
    - Sharpe Ratio (annualized, using daily equity returns)
    - Sortino Ratio (downside deviation only)
    - Max Drawdown and Max Drawdown Duration
    - _Requirements: 22.22, 22.23_

  - [x] 49.4 Build equity curve and other time series
    - Generate EquityPoint series from per-bar snapshots
    - Generate monthly returns heatmap data
    - Compute Buy & Hold return for comparison
    - _Requirements: 22.26, 22.27_

  - [x] 49.5 Create BacktestResult data structure
    - Assemble config, metrics, trades[], equity_curve[], orders[]
    - Provide serialization for API responses
    - _Requirements: 22.49, 22.50_

- [x] 50. Implement Backtest REST API
  - [x] 50.1 Create job queue and worker system
    - Accept backtest jobs via POST /api/backtest
    - Assign unique job_id and queue for processing
    - Support concurrent backtest workers
    - Track job status: queued → running → completed/failed
    - _Requirements: 22.34, 22.40_

  - [x] 50.2 Implement status and result endpoints
    - GET /api/backtest/{job_id} returns status and progress
    - GET /api/backtest/{job_id}/result returns full BacktestResult
    - _Requirements: 22.35, 22.36_

  - [x] 50.3 Add backtest progress reporting
    - Report progress percentage during bar processing loop
    - Support progress polling via status endpoint
    - Optionally push progress via WebSocket
    - _Requirements: 22.37_

- [x] 51. Implement Backtest Visualization
  - [x] 51.1 Overlay strategy entry/exit markers on price chart
    - Use existing StrategyMarkerRenderer for entry/exit markers
    - Show trade direction and comment text on markers
    - _Requirements: 22.28_

  - [x] 51.2 Build equity curve and drawdown chart
    - Render equity curve as line plot below main price chart
    - Render drawdown as shaded area below equity curve
    - _Requirements: 22.29_

  - [x] 51.3 Create trade list table
    - Sortable table with per-trade statistics (entry/exit, P&L, return, bars, MAE/MFE)
    - Click trade to highlight on chart
    - _Requirements: 22.32_

  - [x] 51.4 Build backtest report export
    - Export as PDF, HTML, and CSV formats
    - Include metrics summary, trade list, equity curve
    - _Requirements: 22.31_

- [x] 52. Create Backtest Configuration Panel
  - [x] 52.1 Build web UI for strategy settings
    - Form for strategy inputs (fast_len, slow_len, etc.)
    - Date range picker for backtest period
    - Symbol and timeframe selectors
    - _Requirements: 22.33_

  - [x] 52.2 Build broker emulator configuration UI
    - Commission type/value, slippage, margin settings
    - Default quantity type/value, pyramiding limit
    - Initial capital input
    - _Requirements: 22.33_

  - [x] 52.3 Add run/submit button with progress indicator
    - Submit backtest job via POST /api/backtest
    - Show progress bar during execution
    - Display results on completion
    - _Requirements: 22.37_

- [x] 53. Implement Data Source Integration for Backtesting
  - [x] 53.1 Add CSV data import
    - Parse OHLCV data from CSV files
    - Support configurable column mapping
    - _Requirements: 22.5_

  - [x] 53.2 Add database data adapter
    - Fetch historical data from PostgreSQL/MongoDB
    - Support date-range queries with pagination
    - _Requirements: 22.5_

  - [x] 53.3 Implement data alignment and gap handling
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

- [x] 58. Checkpoint - Backtest Engine Validation
  - Ensure Broker Simulator correctly fills orders and manages positions
  - Verify performance metrics match TradingView within 0.1% tolerance
  - Test REST API submit/status/result workflow end-to-end
  - Verify backtest visualization renders correctly on chart
  - Run 1M-bar performance test under 10 seconds
  - Ask the user if questions arise.

- [x] 59. Implement Switch Expression Support
  - [x] 59.1 Add switch expression parsing to Parser
    - Parse `switch` keyword with local block scoping
    - Support arrow syntax (=>) for mapping expressions
    - Support conditional branching with multiple cases
    - _Requirements: 1.10_
  
  - [x] 59.2 Add switch expression compilation
    - Type-check switch branches and unify result types
    - Compile to executable AST nodes
    - _Requirements: 1.10_
  
  - [x] 59.3 Implement switch expression runtime execution
    - Execute switch with full conditional branching
    - Maintain local block scope for each branch
    - Propagate branch result as expression value
    - _Requirements: 3.18_
  
  - [x] 59.4 Fix switch expression edge cases
    - Handle column check at end of switch block
    - Support => arrow tokenizer and `=>` syntax
    - Fix grouped condition paren special-casing
    - _Requirements: 1.10, 3.18_

- [x] 60. Implement Generic Array Methods and Line/Label Method Dispatch
  - [x] 60.1 Add generic array operations to execution engine
    - Implement array.size, array.first, array.last, array.shift, array.pop
    - Implement array.push, array.unshift, array.insert, array.remove
    - Implement array.contains, array.fill, array.set, array.get, array.sort, array.copy
    - _Requirements: 2.8, 3.22_
  
  - [x] 60.2 Add method dispatch on numeric IDs for line/label objects
    - Implement line.delete, line.get_x1/y1/x2/y2, line.get_price
    - Implement line.set_color/style/width, line.set_extend/xloc
    - Implement label.delete, label.get_x/y/text
    - Implement label.set_x/y/xy, label.set_text/color/textcolor/size/style/tooltip
    - Enable chained operations (lin.shift().delete(), line.get_x2(lin.first()))
    - _Requirements: 2.9, 3.23_

- [x] 61. Implement Lines/Labels Full Frontend Pipeline
  - [x] 61.1 Add LineEntry/LabelEntry to Engine execution result
    - Return line and label data as part of ExecutionResult
    - Include lines/labels in snapshot/rollback state
    - Handle NaLiteral callee (na() function) on IDs
    - _Requirements: 3.22, 7.60_
  
  - [x] 61.2 Serialize lines and labels in Backend responses
    - Map LineEntry to DrawingLineData (bar_index→timestamp via barTimestamps)
    - Map LabelEntry to LabelData for frontend
    - Include in both REST and WebSocket responses
    - _Requirements: 19.25, 17.41_
  
  - [x] 61.3 Render drawing lines and labels in Frontend PineChart
    - Add setDrawingLines() and setLabels() methods to PineChart API
    - Render drawing lines as solid/dotted/dashed line segments with extend modes
    - Render labels as rounded rectangle boxes with text, all label styles
    - Add findBarIndex helper for coordinate mapping
    - _Requirements: 17.41, 17.42, 21.49, 21.50, 21.51, 21.52_

- [x] 62. Implement Per-Bar Plot and Fill Colors
  - [x] 62.1 Store per-bar plot colors in execution engine
    - Store per-bar color arrays separately from output keys
    - plot() builtin produces single continuous series (no per-color split)
    - Forward per-bar colors through API and backend
    - _Requirements: 6.35, 6.36_
  
  - [x] 62.2 Store per-bar fill colors (fillColorData)
    - Fill builtin creates one entry per unique from/to pair
    - Store per-bar fill color data alongside fill entries
    - _Requirements: 6.36_
  
  - [x] 62.3 Render per-bar plot colors on canvas
    - LineRenderer: use per-point color for line, stepline, histogram, columns
    - Pass per-bar color data in PlotSeriesData for canvas rendering
    - _Requirements: 21.29, 21.30_
  
  - [x] 62.4 Render per-bar fill colors on canvas
    - AreaRenderer: draw per-segment quads using per-bar colors
    - Preserve full-range base polygon as fallback, overlay per-bar segments
    - Fix fillColorData key mismatch (strip __lw/__style metadata for key matching)
    - Remove double globalAlpha reduction on fill segments
    - Fix fill.__plot_ref off-by-one in slice
    - _Requirements: 21.41, 21.42, 6.37_

- [x] 63. Fix TA Function Semantics and Add Missing Builtins
  - [x] 63.1 Fix and/or NA propagation
    - Treat na as false in AND/OR operators instead of propagating na
    - Fix nPl1/nPh1 initialization tracking for swing points
    - _Requirements: 3.20_
  
  - [x] 63.2 Fix strict comparisons for crossover/crossunder/pivot
    - ta.crossover: use <= on prev bar (was <)
    - ta.crossunder: use >= on prev bar (was >)
    - ta.pivothigh: use > (was >=)
    - ta.pivotlow: use < (was <=)
    - _Requirements: 3.21, 4.9, 4.10_
  
  - [x] 63.3 Fix ta.sma/ta.ema per-call-site buffer isolation
    - Add per-call-site counters (smaCallIndex, emaCallIndex)
    - Reset counters each bar
    - Each call site gets its own buffer/state
    - _Requirements: 4.12_
  
  - [x] 63.4 Implement ta.sar with correct algorithm
    - 2-bar initialization: UP if close > prevClose, else DOWN
    - Track EP (extreme point) and AF (acceleration factor)
    - Handle prev-two-bar clamping and prevEp tracking on reversal
    - Correct EP/AF update order matching TradingView
    - _Requirements: 4.11_
  
  - [x] 63.5 Add syminfo namespace and missing builtins
    - Implement syminfo.tickerid, syminfo.mintick, syminfo.pointvalue
    - Implement syminfo.pricescale, syminfo.currency
    - Add array.new_line/float/int type inference
    - Add input.timeframe, input.source builtins
    - Add ta.pivothigh/low, na(), request.security builtins
    - Add barmerge, xloc, line, label namespace member constants
    - _Requirements: 3.19_

- [x] 64. Implement Lazy Loading of Historical Data
  - [x] 64.1 Extend Backend /api/ohlcv with end timestamp param
    - Accept optional `end` parameter for fetching bars before a given time
    - Enable lazy loading of older historical data
    - _Requirements: 19.26_
  
  - [x] 64.2 Add fetchOlderOHLCV to Frontend data hook
    - Fetch 1000 bars before the oldest loaded bar timestamp
    - Return actual bar count for scroll offset calculation
    - Prepend fetched bars to candle data in ohlcvDataRef
    - _Requirements: 17.36, 17.37_
  
  - [x] 64.3 Implement viewport auto-adjust on prepend
    - Viewport.adjustForPrepend(added): shift totalBars and firstBarIndex
    - PineChart.setCandles: detect prepend by timestamp comparison
    - Call adjustForPrepend instead of setTotalBars — no manual scrollTo
    - _Requirements: 21.77_
  
  - [x] 64.4 Add backend offset parameter for lazy loading
    - POST /api/execute accepts `offset` to return only new bar outputs
    - Engine processes all bars internally but transmits only delta
    - Frontend caches per-title plot data and prepends new results
    - _Requirements: 19.22_
  
  - [x] 64.5 Implement batch rendering for lazy loading
    - PineChart: beginUpdate/endUpdate batching for single-frame updates
    - Frontend: batch setCandles + setScriptResult into single React render
    - Re-execute script after fetching older data so indicators warm up correctly
    - _Requirements: 17.39, 21.78_

- [x] 65. Fix TrendCraft ICT SwiftEdge Compatibility
  - [x] 65.1 Fix parser edge cases for complex indicator
    - Fix parsePostfix line boundary check
    - Fix function expression detection (require Arrow/LParen on same line)
    - Remove if-statement paren special-casing for grouped conditions
    - _Requirements: 1.1_
  
  - [x] 65.2 Fix array.new_<type>() type inference
    - Return array<elementType> instead of generic type
    - Fix NaLiteral → NA_TYPE (was ANY_TYPE)
    - _Requirements: 1.11_
  
  - [x] 65.3 Wire barsToContexts with full OHLCV history
    - Pass bars.slice(0, i + 1) for each OHLCV series
    - TA functions have access to historical data, not just current bar
    - _Requirements: 3.1_

- [x] 66. Fix Plot Style and Rendering Enhancements
  - [x] 66.1 Add plot style parameter support
    - Plot builtin accepts and forwards style parameter
    - Frontend renders circles, cross, histogram styles correctly
    - _Requirements: 6.34_
  
  - [x] 66.2 Fix bgcolor passthrough
    - Forward bgcolor data through WebSocket and HTTP responses
    - Background colors render on chart from script output
    - _Requirements: 6.37, 19.23_
  
  - [x] 66.3 Add strategy integration tests
    - Create 338-line strategy integration test suite
    - Test market order fill deferral, position reversal, marker generation
    - _Requirements: 11.9_

- [x] 67. Fix Backend and Frontend Integration Issues
  - [x] 67.1 Wire backtest REST API to actual Pine Script execution
    - Replace no-op with real compilation + bar-by-bar execution
    - Extract trades/metrics from StrategyEngine
    - _Requirements: 8.11_
  
  - [x] 67.2 Fix backtest settings propagation
    - Accept strategyConfigOverride in ExecutionEngine constructor
    - Forward config from frontend settings to engine
    - _Requirements: 8.9_
  
  - [x] 67.3 Fix timeframe switch stale data issues
    - Filter WS klines by subscribed topic during switches
    - Auto re-execute script on symbol/interval change
    - _Requirements: 17.40_
  
  - [x] 67.4 Fix backtest defaults and error propagation
    - Change default qty to 20% of equity (percent_of_equity)
    - Show backtest error details in frontend
    - Validate script kind (indicator vs strategy) in backtest route
    - _Requirements: 8.11_

- [x] 68. Checkpoint - Full System Validation
  - Verify switch expressions compile and execute correctly
  - Verify array methods and line/label dispatch work
  - Verify lines/labels render correctly on canvas chart
  - Verify per-bar colors render correctly on line and fill plots
  - Verify lazy loading loads older bars without scroll jump
  - Verify plot style parameter renders circles, cross, histogram correctly
  - Verify ta.sar, ta.sma, ta.ema produce correct results
  - Verify bgcolor renders on chart from script output
  - Verify TrendCraft ICT SwiftEdge indicator executes without errors
  - Verify 849+ tests pass across all suites
  - Ask the user if questions arise.

- [x] 69. Fix Indicator Alignment After Lazy Loading (BarTimestamps + Stale Session Guards)
  - [x] 69.1 Add barTimestamps to ScriptOutputs in engine and backend
    - Add `barTimestamps?: number[]` field to `ScriptOutputs` interface in `ScriptSession.ts`
    - Return `barTimestamps` from `toOutputs()` method
    - Include `barTimestamps` in REST `/api/execute` response
    - Include `barTimestamps` in WebSocket `execution_result` messages
    - _Requirements: 17.41, 19.18_
  
  - [x] 69.2 Use barTimestamps for plot alignment in frontend buildScriptResult
    - Accept optional `barTimestamps` parameter in `buildScriptResult()`
    - Add `getTimestamp(i)` that reads from `barTimestamps` first, falls back to `ohlcvData[i]?.timestamp`
    - Pass `barTimestamps` through REST and WebSocket result paths
    - _Requirements: 17.42_
  
  - [x] 69.3 Validate output lengths in handleExecutionResult
    - Check `outputLen === barTimestamps.length` when barTimestamps present
    - Add guard `Math.abs(outputLen - ohlcvData.length) > 1` to reject stale WS sessions that are self-consistent but cover fewer bars than the frontend has
    - _Requirements: 17.43_
  
  - [x] 69.4 Invalidate old session on WS re-execute
    - Set `sub.session = null` before creating new ScriptSession on WS execute command
    - Prevent stale sessions from pushing kline-driven results with outdated bar counts
    - _Requirements: 17.44_

- [x] 70. Implement JSON File Store for Persistent Storage
  - [x] 70.1 Create `backend/data/` directory and `telegram.json` file
    - Ensure `backend/data/` directory exists on Backend startup (auto-create if missing)
    - Create `backend/data/telegram.json` on first launch with default schema: `{ botToken: "", subscribers: [], settings: {} }`
    - Add `backend/data/` to `.gitignore` (user-local data, not committed)
    - _Requirements: 14.28, 14.29, 14.30_

  - [x] 70.2 Implement `JsonStore` class for file operations
    - Create `JsonStore<T>` generic class wrapping `fs.readFileSync()` / `fs.writeFileSync()` with JSON parse/stringify
    - Implement file-locking via `proper-lockfile` (or `lockfile` package) to prevent concurrent write corruption
    - Provide methods: `read()`, `write(data)`, `patch(path, value)` for partial updates
    - Handle missing file gracefully (return defaults, never throw)
    - Validate JSON schema on write to prevent corruption
    - _Requirements: 14.28, 14.29_

  - [x] 70.3 Implement `TelegramConfigStore` domain wrapper
    - Create `TelegramConfigStore` class using `JsonStore<TelegramData>` internally
    - Methods: `getBotToken()`, `setBotToken(token)`, `getSubscribers()`, `addSubscriber(chatId, username)`, `removeSubscriber(chatId)`, `getAlertPreference(chatId, alertId)`, `setAlertPreference(chatId, alertId, enabled)`
    - Reload file from disk on every read to support manual edits and external backup/restore
    - Sanitize and validate all inputs before writing
    - _Requirements: 14.28, 14.29, 14.30, 14.31_

  - [x] 70.4 Expose settings via REST API
    - `GET /api/settings/telegram` — retrieve Telegram Bot Token
    - `PUT /api/settings/telegram` — update Telegram Bot Token
    - `GET /api/settings/alerts/:id/telegram` — get per-alert Telegram preference
    - `PUT /api/settings/alerts/:id/telegram` — toggle per-alert Telegram preference
    - Validate and sanitize all inputs before storage
    - _Requirements: 14.28, 14.29_

  - [x] 70.5 Write tests for JSON file store
    - Test `JsonStore` read/write with valid and invalid JSON
    - Test `TelegramConfigStore` CRUD operations
    - Test file-locking semantics (concurrent writes)
    - Test auto-creation of missing file and directory
    - Test REST endpoints for settings
    - _Requirements: 14.28, 14.29, 14.30, 14.31_

  - [x] 71. Implement Telegram Bot Notification System (Telegraf)
  - [x] 71.1 Create Telegram Bot client in Backend with Telegraf
    - Create `TelegramService` class wrapping the **Telegraf** library (v4+, Bot API v7.1)
    - Initialize bot via `new Telegraf(token)` and launch with `bot.launch()`
    - Implement `sendMessage(chatId, message)` using `ctx.telegram.sendMessage()` for plain-text and `ctx.replyWithMarkdownV2()` for rich-formatted alerts
    - Implement `sendPhoto(chatId, buffer)` using `ctx.telegram.sendPhoto()` for chart screenshots
    - Implement `/start` and `/help` commands via `bot.command()` for onboarding
    - Implement `/subscribe` and `/unsubscribe` commands with `TelegramConfigStore` (backed by `backend/data/telegram.json`)
    - Add middleware via `bot.use()` for logging, rate-limiting, and auth checks
    - Set up graceful shutdown via `bot.stop()` on `SIGINT`/`SIGTERM`
    - Support webhook mode in production via `bot.createWebhook()` attached to Express server
    - Handle Telegram API errors: rate limit (429 with retry-after), network failures, invalid tokens
    - _Requirements: 14.18, 14.19, 14.20, 14.22, 14.26, 14.27_

  - [x] 71.2 Wire Telegram notifications into Alert System
    - When an alert triggers during chart rendering (alert() or alertcondition()), check if Telegram is enabled globally
    - Look up per-alert preference — skip if Telegram is disabled for this specific alert
    - Format message with MarkdownV2: alert text, script name, symbol, timeframe, timestamp, OHLCV values
    - Send via `ctx.telegram.sendMessage()` asynchronously (non-blocking to chart rendering)
    - Log sent/failed notifications for auditing
    - _Requirements: 14.18, 14.20, 14.21, 14.23_

  - [x] 71.3 Add alert metadata to execution result pipeline
    - Include alert ID and alert title in execution result metadata so frontend can render per-alert toggles
    - Map alertcondition() calls to unique IDs for preference lookup
    - _Requirements: 14.25_

  - [x] 71.4 Write tests for Telegram notification system
    - Test message formatting with various alert data (MarkdownV2 escaping)
    - Test Telegraf error handling (rate limit, network failure, Bot API errors)
    - Test per-alert preference filtering
    - Test async non-blocking behavior
    - Test command handlers (`/start`, `/help`, `/subscribe`, `/unsubscribe`)
    - Test graceful shutdown path
    - _Requirements: 14.18, 14.19, 14.20, 14.21, 14.22, 14.23, 14.26_

  - [x] 72. Build Frontend UI for Telegram Configuration
  - [x] 72.1 Create Telegram settings panel in Frontend
    - Add a settings page/modal with fields for Telegram Bot Token and Telegram Username
    - Fetch current values from `GET /api/settings/telegram` on mount
    - Save changes via `PUT /api/settings/telegram`
    - Show success/error toast notifications on save
    - Add a "Test Notification" button to verify configuration
    - _Requirements: 23.5, 23.11_

  - [x] 72.2 Add per-alert Telegram toggle in indicator settings
    - In the indicator settings UI (where alertcondition() items are listed), add a Telegram toggle (checkbox/switch) per alert
    - Fetch per-alert preference from `GET /api/settings/alerts/:id/telegram`
    - Toggle updates via `PUT /api/settings/alerts/:id/telegram`
    - Default all alerts to enabled
    - _Requirements: 23.6, 23.7, 23.8, 23.12_

  - [x] 72.3 Display non-content-blocking alert markers on chart
    - Ensure alert markers render as minimal, non-intrusive indicators on the chart (e.g., small icons/badges at the top or bottom of the chart pane)
    - Use the existing AlertMarkerRenderer but with subtle styling that does not obscure price action
    - Alert markers remain visible for reference without blocking chart content
    - _Requirements: 23.1 (non-content-blocking display)_

  - [x] 72.4 Write tests for Telegram UI
    - Test settings panel rendering and data binding
    - Test per-alert toggle rendering and interaction
    - Test API integration (fetch and save)
    - _Requirements: 23.5, 23.6, 23.7, 23.8, 23.11, 23.12_

- [x] 73. Checkpoint - Telegram Notification and JSON File Persistence Validation
  - Verify Telegram Bot sends notifications when alerts fire on chart
  - Verify per-alert toggle correctly enables/disables Telegram notifications
  - Verify Telegram Bot Token and Username persist across server restarts via `backend/data/telegram.json`
  - Verify JSON file store CRUD operations work correctly via REST API
  - Verify `backend/data/` directory and `telegram.json` are auto-created on first launch
  - Verify manual edit of `telegram.json` is reflected on next read (no in-memory cache staleness)
  - Verify alert markers render non-intrusively on chart
  - Run all existing tests to confirm no regressions
  - Ask the user if questions arise.

- [x] 74. Implement SOCKS5 Proxy Support for Telegram Bot
  - [x] 74.1 Add SOCKS5 proxy configuration to telegram.json schema
    - Add `proxy` key to `settings` object in `backend/data/telegram.json` with fields: `host`, `port`, `username`, `password`
    - Update `TelegramConfigStore` with proxy getter/setter methods
    - Load proxy config on TelegramService initialization
    - _Requirements: 14.32, 14.33_
   
  - [x] 74.2 Implement SOCKS5 agent creation and Telegraf integration
    - Install `socks-proxy-agent` (or equivalent) dependency in backend
    - On bot launch, if proxy host and port are configured, create a `SocksProxyAgent` and pass it via `new Telegraf(token, { telegram: { options: { agent } } })`
    - Handle proxy authentication (username/password) when credentials are provided
    - Fall back to direct connection when no proxy is configured
    - _Requirements: 14.32, 14.36_
   
  - [x] 74.3 Add REST API endpoints for SOCKS5 proxy configuration
    - `GET /api/settings/telegram/proxy` — return current proxy settings (omit password in response)
    - `PUT /api/settings/telegram/proxy` — update proxy settings
    - Validate host/port format and credentials
    - Restart/reconfigure TelegramService after proxy update
    - _Requirements: 14.34_
   
  - [x] 74.4 Add SOCKS5 proxy configuration UI to Frontend
    - Add proxy settings section to the Telegram settings panel
    - Input fields for host, port, username, password
    - Password field with show/hide toggle
    - Save button that calls `PUT /api/settings/telegram/proxy`
    - _Requirements: 14.35_
   
   - [x] 74.5 Write tests for SOCKS5 proxy support
     - Test proxy config CRUD via TelegramConfigStore
     - Test proxy agent creation with valid/invalid settings
     - Test fallback to direct connection when no proxy configured
     - Test REST API endpoints for proxy settings
     - Test frontend proxy configuration UI rendering
      - _Requirements: 14.32, 14.33, 14.34, 14.35, 14.36_

- [x] 75. Implement real-time indicator computation for forming candles
   - [x] 75.1 Add forming-candle computation mode to execution engine
     - Implement computeFormingCandle() that re-evaluates the script for only the last (live) bar
     - Preserve var/varip state and series history across intra-bar updates
     - Return updated outputs (plots, shapes, fills, strategyMarkers) for the forming candle only
     - _Requirements: 3.24_

   - [x] 75.2 Wire forming-candle computation into backend real-time pipeline
     - When a real-time kline/tick update arrives for the same bar timestamp, call computeFormingCandle() on the persisted engine instead of a full re-execution
     - Push partial indicator updates for the forming candle via WebSocket execution_result
     - _Requirements: 3.24, 19.19_

   - [x] 75.3 Update frontend to render forming-candle indicator values
     - Accept partial indicator updates targeting only the last bar
     - Re-render plot lines, shapes, fills for the forming candle without disrupting completed bars
     - Ensure crosshair tooltip shows up-to-date indicator values for the forming candle
     - _Requirements: 17.28, 17.13_

   - [x] 75.4 Write tests for forming-candle computation
     - Test computeFormingCandle() with various indicator types (SMA, EMA, RSI, crossover)
     - Test state preservation across multiple intra-bar updates
     - Test backend WebSocket push of partial results
     - Test frontend rendering of partial indicator updates for the forming candle
     - _Requirements: 3.24_

- [x] 76. Implement Script Bank Backend (JSON Store + REST API)
  - [x] 76.1 Create `ScriptStore` domain wrapper using `JsonStore`
    - Create `backend/data/scripts.json` with default schema `{ scripts: [], activeScriptId: null }`
    - Implement `ScriptStore` class with methods: `getAll()`, `getById(id)`, `create(name, source)`, `update(id, name?, source?)`, `delete(id)`, `getActive()`, `setActive(scriptId)`
    - Generate UUIDs for new scripts, set `createdAt` and `updatedAt` timestamps
    - Auto-detect `scriptType` from source (check for `strategy()` vs `indicator()` calls)
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.9_

  - [x] 76.2 Implement REST API endpoints for Script Bank
    - `GET /api/scripts` — return all scripts (id, name, scriptType, updatedAt; omit source for list)
    - `POST /api/scripts` — create script, accept `{ name, source }`, return created entry
    - `GET /api/scripts/:id` — return full script entry including source
    - `PUT /api/scripts/:id` — update script name and/or source
    - `DELETE /api/scripts/:id` — delete script
    - `PUT /api/scripts/active` — set active script, accept `{ scriptId }`, validate scriptId exists
    - `GET /api/scripts/active` — return active script entry with full source
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.6, 24.7_

  - [x] 76.3 Add search/filter support to list endpoint
    - `GET /api/scripts?q=<term>` — filter scripts by name (case-insensitive contains)
    - _Requirements: 24.10_

  - [x] 76.4 Write tests for Script Bank backend
    - Test CRUD operations via REST endpoints
    - Test active script set/get persistence
    - Test search filtering by name
    - Test auto-detection of scriptType from source
    - Test delete active script clears activeScriptId
    - Test validation (missing name/source, invalid scriptId)
    - _Requirements: 24.1-24.10_

- [x] 77. Implement Script Bank Frontend UI
  - [x] 77.1 Create ScriptBankPanel component
    - Render list of scripts with name, type badge (indicator/strategy), last modified date
    - Add search input at top for filtering by name
    - Add "New Script" button that opens create dialog
    - Highlight/checkmark the currently active script
    - Click a script to select it as active (loads into editor + executes on chart)
    - _Requirements: 24.1, 24.6, 24.8, 24.10_

  - [x] 77.2 Add script CRUD dialogs
    - Create dialog: name input + code editor pre-filled with default template
    - Edit dialog: name input + code editor pre-filled with existing source
    - Delete confirmation dialog (are you sure?)
    - Wire dialogs to backend REST endpoints
    - _Requirements: 24.2, 24.3, 24.4_

  - [x] 77.3 Implement active script loading on app startup
    - On mount, fetch `GET /api/scripts/active`
    - If active script exists, load its source into the code editor and auto-execute
    - Store active script ID in state for highlight in panel
    - _Requirements: 24.7, 24.8_

  - [x] 77.4 Wire script selection to chart execution
    - When user clicks a script in the bank panel, call `PUT /api/scripts/active`
    - Load the selected script's source into the code editor
    - Execute the script on the chart via existing POST /api/execute flow
    - _Requirements: 24.6, 24.8_

  - [x] 77.5 Write tests for Script Bank frontend
    - Test ScriptBankPanel renders script list from API
    - Test search filtering narrows the list
    - Test create/edit/delete dialogs open and submit correctly
    - Test active script highlight and selection
    - Test app startup loads active script into editor
    - _Requirements: 24.1-24.10_

- [x] 78. Checkpoint - Script Bank Validation
  - Create a new script via the panel, verify it appears in the list
  - Edit a script name and source, verify changes persist
  - Delete a script, verify it is removed from the list
  - Select a script as active, restart the backend, verify active selection persists
  - Verify active script loads into editor and executes on chart on app startup
  - Test search filtering works correctly
  - Run all existing tests to confirm no regressions
  - Ask the user if questions arise.

- [x] 79. Unify Script Editor — Replace ScriptBankPanel with Dropdown in CodeEditor
  - [x] 79.1 Add `runningScriptId` to backend ScriptBankData schema
    - Extend `ScriptBankData` with `runningScriptId: string | null` field (separate from `activeScriptId`)
    - Add `getRunning()` and `setRunning(id)` methods to `ScriptStore`
    - Add `PUT /api/scripts/running` endpoint to set the running script
    - Add `GET /api/scripts/running` endpoint to get the running script
    - Keep existing `activeScriptId` for backward compatibility (or repurpose it as runningScriptId)
    - _Requirements: 25.6, 25.11, 25.12_

  - [x] 79.2 Refactor CodeEditor to include script dropdown and auto-save
    - Add a dropdown (`<select>`) at the top of the CodeEditor listing all scripts by name
    - On editor open, fetch `GET /api/scripts/running` and load that script's source
    - On dropdown change, fetch the selected script's source via `GET /api/scripts/:id` and load into textarea WITHOUT executing on chart
    - Auto-save source changes on every edit (debounced 500ms) via `PUT /api/scripts/:id` with `{ source }` — do NOT trigger chart re-execution
    - Add "New Script" button that creates a script via `POST /api/scripts` with default template, selects it in dropdown
    - Add "Delete" button that deletes the current script via `DELETE /api/scripts/:id` and selects the next available script
    - Auto-extract script name from source via regex: `/strategy\(\s*["'](.+?)["']/` or `/indicator\(\s*["'](.+?)["']/`
    - When name is extracted, update script name via `PUT /api/scripts/:id` with `{ name }`
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.7, 25.8, 25.9, 25.10_

  - [x] 79.3 Wire "Run" button to persist running script
    - When "Run" is clicked, execute the current source on the chart (existing behavior)
    - Additionally, call `PUT /api/scripts/running` with `{ scriptId: currentScriptId }` to persist it as the running script
    - Store the running script ID in App.tsx state for the editor to read on next open
    - _Requirements: 25.6_

  - [x] 79.4 Remove ScriptBankPanel from App.tsx
    - Remove the `ScriptBankPanel` import and component from `App.tsx`
    - Remove the `ScriptBankPanel.tsx` file from `frontend/src/components/`
    - Remove the `onLoadScript` prop wiring that was used by the old panel
    - Verify no remaining references to `ScriptBankPanel` exist in the codebase
    - _Requirements: 25.1_

  - [x] 79.5 Load running script on app startup
    - On app mount, fetch `GET /api/scripts/running` to get the currently running script
    - Set the editor's current script ID and source from the running script
    - Do NOT auto-execute the chart on mount (user must click Run)
    - _Requirements: 25.11_

  - [x] 79.6 Write tests for unified editor
    - Test dropdown renders all scripts and selects running script on open
    - Test switching scripts loads source without executing
    - Test auto-save debounces and persists source changes
    - Test "Run" button executes chart AND sets running script
    - Test "New Script" creates and selects a new script
    - Test "Delete" removes script and selects next
    - Test name extraction from strategy/indicator source
    - Test startup loads running script into editor
    - _Requirements: 25.1-25.12_

- [x] 80. Checkpoint - Unified Editor Validation
  - Open editor, verify dropdown shows all scripts and running script is selected
  - Switch scripts via dropdown, verify source loads but chart does NOT re-execute
  - Edit source, verify changes auto-save but chart does NOT re-execute
  - Click "Run", verify chart executes AND running script persists across reload
  - Reload page, open editor, verify running script is loaded by default
  - Create new script, verify it appears in dropdown and is selected
  - Delete a script, verify it is removed from dropdown
  - Verify script name auto-updates when strategy()/indicator() name changes in source
  - Run all existing tests to confirm no regressions
  - Ask the user if questions arise.

- [x] 81. Implement bar-close only alert dispatch
  - [x] 81.1 Suppress alert triggers during forming-candle computation
    - Modify `computeFormingCandle()` in the ExecutionEngine to return an empty `alertTriggers` array (or omit them entirely) — alert conditions are still evaluated internally but their triggers are not emitted until the bar closes
    - `appendOrUpdateBar()` (which fires on bar close / new bar) continues to return alert triggers as normal
    - _Requirements: 14.17_
  - [x] 81.2 Add barstate.isconfirmed awareness to gateway alert dispatch
    - In `reexecuteForTopic()` in `backend/src/ws/gateway.ts`, guard Telegram alert dispatch with a check that the engine is processing a confirmed bar (not a forming-candle tick)
    - Add an `isConfirmed` flag to `appendOrUpdateBar()` / `computeFormingCandle()` return values so the gateway can distinguish bar-close from intra-bar updates
    - _Requirements: 14.17_
  - [x] 81.3 Write tests for bar-close alert dispatch
    - Test that `computeFormingCandle()` returns an empty `alertTriggers` array
    - Test that `appendOrUpdateBar()` still returns alert triggers on bar close
    - Test end-to-end that Telegram is not called on forming-candle ticks
    - _Requirements: 14.17_
  - [x] 81.4 Add `lastConfirmedTimestamp` dedup in ScriptSession
    - Track the timestamp of the last confirmed bar per session — if a duplicate `confirmed=true` kline arrives with the same or older timestamp, skip re-execution and return a forming-candle result with `isConfirmed=false` (alerts suppressed)
    - Prevents re-dispatch when Bybit resends the same confirmed kline
    - _Requirements: 14.18_
  - [x] 81.5 Add `recentAlertKeys` Set dedup in WebSocket gateway
    - Maintain a module-level Set keyed by `alertId:timestamp:topic` (bounded at 100 entries, oldest evicted first)
    - Before dispatching a Telegram alert, check the Set; if the key exists, suppress the duplicate with a log message
    - Prevents double-alerts when two WebSocket sessions (e.g., stale + fresh from HMR) both subscribe to the same topic and independently produce triggers
    - _Requirements: 14.18, 19.29_
  - [x] 81.6 Fix series length drift in `computeFormingCandle`
    - Always truncate output series (`barTimestamps`, `totalBars`, etc.) to the pre-execution length after rollback in `computeFormingCandle()`, even when no diff was produced — prevents drift between the engine's internal bar count and `barTimestamps.length` used for frontend time-alignment
    - _Requirements: 3.24_
  - [x] 81.7 Prune stale WebSocket connections from topic subscriber sets
    - At the start of `reexecuteForTopic()`, remove any connections with `readyState !== WebSocket.OPEN` from the subscriber Set before iterating
    - Prevents orphaned sessions (from Vite HMR, page refreshes, etc.) from producing phantom alert dispatches
    - _Requirements: 19.27_

- [x] 82. Refactor forming-candle architecture — caller controls `isFormingCandle`
  - [x] 82.1 Move `isFormingCandle` management from engine internals to external caller
    - Remove `this.isFormingCandle = true` from `computeFormingCandle()` and `this.isFormingCandle = false` from `executeRealtimeBar()`
    - Add `engine.setFormingCandle(v: boolean)` method for external callers
    - `barstate.isconfirmed` resolves to `!this.isFormingCandle` — reflects the externally-set flag
    - `isConfirmed` in `FormingCandleResult` uses `!this.isFormingCandle` so the gateway knows whether this is a confirmed bar
    - _Requirements: 3.24, 14.17_
  - [x] 82.2 Route confirmed bars through `computeFormingCandle` instead of `executeRealtimeBar`
    - In `ScriptSession.appendOrUpdateBar()`, the confirmed branch (`confirmed=true`) calls `engine.setFormingCandle(false)` then `computeFormingCandle()` — not `executeRealtimeBar()`
    - Avoids state advancement (barTimestamps push, totalBars increment) that `executeRealtimeBar()` performs — confirmed bars were already processed during `initialize()` and should not be re-added
    - Calls `toFormingCandleOutputs()` (not `toOutputs()`) on the `FormingCandleResult` to correctly map diff outputs
    - _Requirements: 3.24, 14.17, 14.18_
  - [x] 82.3 Update forming-candle branches to set flag before calling engine
    - Forming/intra-bar branches call `engine.setFormingCandle(true)` before `computeFormingCandle()`
    - Dedup branch (already-confirmed bar re-received) calls `engine.setFormingCandle(true)` before `computeFormingCandle()`
    - _Requirements: 14.17, 14.18_
  - [x] 82.4 Remove `diffAlertTriggers = []` from `computeFormingCandle`
    - Remove the engine-level alert trigger suppression; `computeFormingCandle()` now returns computed `diffAlertTriggers` regardless of forming/confirmed state
    - Alert suppression is delegated entirely to the gateway layer via the `isConfirmed` guard in `ScriptOutputs`
    - _Requirements: 14.17_

- [x] 83. Improve CodeEditor UX
  - [x] 83.1 Add "Create Your First Script" empty state
    - When the script bank has no scripts, show a welcome screen with a "Create Your First Script" button instead of the empty dropdown and disabled controls
    - Hides the script selector, Delete button, and Run button until at least one script exists
    - _Requirements: 25.1, 25.3_
  - [x] 83.2 Extract script name from source when creating a new script
    - In `handleNewScript`, parse `DEFAULT_CODE` with the `extractName()` regex before POSTing to the API
    - Ensures the default template's strategy/indicator name is persisted as the script name
    - _Requirements: 25.8_
  - [x] 83.3 Prevent flash of DEFAULT_CODE on page load
    - Initialize `currentCode` state as `null` instead of `DEFAULT_CODE` in `App.tsx`
    - Guard the auto-execute useEffect with `if (!currentCode) return;`
    - Only set `currentCode` to `DEFAULT_CODE` as a fallback if the `/api/scripts/running` API returns no running script or fails
    - Prevents the chart from briefly executing DEFAULT_CODE before the running script's source loads from the API
    - _Requirements: 17.27_

- [x] 84. Improve Telegram alert delivery reliability
  - [x] 84.1 Fix `isActive()` race condition at startup
    - Move `this.isRunning = true` to before `bot.launch()` so `isActive()` returns true immediately
    - Change `isActive()` to check `this.bot !== null` instead of `this.isRunning` for consistency
    - _Requirements: 14.18_
  - [x] 84.2 Add MarkdownV2 plain-text fallback
    - When `replyWithMarkdownV2()` throws a parse error (e.g., reserved characters), fall back to `sendMessage(text, { parse_mode: undefined })` for plain text delivery
    - Ensures alerts are never lost due to Markdown formatting issues
    - _Requirements: 14.20_
  - [x] 84.3 Add comprehensive alert pipeline logging
    - Log every step of the alert pipeline: entry into `reexecuteForTopic`, subscriber count, `appendOrUpdateBar` result (alertTriggers count, isConfirmed), Telegram service activation status, and dispatch/suppression decisions
    - _Requirements: 14.7_

- [x] 85. Fix stale-bar gap in WebSocket session creation
  - [x] 85.1 Use `ohlcvDataRef.current` for WS session bars
    - In `useChartData`, when sending the `execute` WebSocket message, use `ohlcvDataRef.current` (the up-to-date bar array from the last REST fetch) instead of `pendingExecuteRef.bars` (which may contain stale data from a previous request)
    - Prevents indicator misalignment when the frontend has fetched newer OHLCV data than what was available when the pending execute was queued
    - _Requirements: 17.1_

- [x] 86. Fix Two-Pole Trend Filter Compatibility
  - [x] 86.1 Fix parser for method keyword and type-first parameters
    - Add `method` keyword handling: parse `method name(...) =>` as `ExpressionStatement(FunctionExpression)`
    - Add `checkNextTypeKeyword()` to distinguish typed variable declarations from expressions
    - Add PascalCase guard to `looksLikeUserType()` to prevent false positives (e.g., `f2 tp_f`)
    - Support type-first parameter syntax (`float src`) in `parseParameter()`
    - Remove return type annotation parsing from `finishFunctionExpr()` and `parseFunctionExpression()` to avoid consuming `float` from `=> float x = ...`
    - Remove non-existent `TokenType.Indent` reference from `parseSwitchStatement()`
    - _Requirements: 1.1, 1.12_
  
  - [x] 86.2 Add compound assignment operators to tokenizer and parser
    - Add `PlusAssign`, `MinusAssign`, `StarAssign`, `SlashAssign` token types to tokenizer
    - Widen `AssignmentNode.operator` type to include `+=`, `-=`, `*=`, `/=`
    - Parse compound assignments in `parseExpressionOrAssignmentStatement()`
    - _Requirements: 1.12, 3.26_
  
  - [x] 86.3 Fix isAssignable type coercion
    - Restore numeric narrowing (int→float allowed, float→int blocked)
    - Add series<T>→any fallback for builtin return values
    - _Requirements: 2.3_
  
  - [x] 86.4 Implement compound assignment execution
    - Read current series value via `getRelative(0)` before applying operator
    - Support `+=`, `-=`, `*=`, `/=`, `:=` operators in `executeAssignment()`
    - _Requirements: 3.26_
  
  - [x] 86.5 Fix namedArgs contamination and method dispatch
    - Only pass namedArgs to builtins when non-empty (prevent empty `{}` as positional arg)
    - Check user-defined methods BEFORE line/label switch in method dispatch
    - _Requirements: 3.11, 3.23_
  
  - [x] 86.6 Implement var persistence in function/method scopes
    - Add `functionPersistentScopes` map to reuse persistent scope across bars for named functions/methods
    - Call `pushBarValues()` on persistent scope each bar so var variables retain values
    - Declare parameters only once (check `resolveVariable` before `declareVariable`)
    - _Requirements: 3.13_
  
  - [x] 86.7 Add ta.atr, color.from_gradient, barcolor, nz, math constants builtins
    - Implement `ta.atr(length)` with per-key state tracking and warmup period
    - Implement `color.from_gradient(value, min, max, color1, color2)` with RGB interpolation
    - Implement `barcolor(color)` storing `{time, color}` entries in `barColorData`
    - Implement `nz(value, fallback)` replacing na with 0 or custom fallback
    - Add `math.pi`, `math.e`, `math.phi` as constants in member expression resolution
    - _Requirements: 4.1, 6.29, 6.37_
  
  - [x] 86.8 Fix plotshape title and add barColorData to snapshots
    - Remove title (2nd positional arg) from being used as display text — only `text` named arg appears on shapes
    - Add `barColorData` field to `ExecutionSnapshot` and include in `createSnapshot()`/`rollbackToSnapshot()`
    - Include `barColorData` in `ExecutionResult` and `executeBars()` return value
    - _Requirements: 6.15, 3.25_
  
  - [x] 86.9 Fix shape rendering pipeline for location.absolute
    - Add `price` field to `ShapeEntry` in engine and serialize in backend responses
    - Frontend hook: pass `s.price ?? 0` instead of `price: 0`
    - Frontend types: extend `ShapeData.location` with `'absolute'`, add `price` to `ShapeMarkerData`
    - MarkerRenderer: handle `location.absolute` by using `priceToPixel(marker.price)` instead of candle high/low
    - _Requirements: 6.17, 21.30_
  
  - [x]* 86.10 Write integration tests for two-pole trend filter
    - Create 15 tests: parse/compile, output keys, non-null values, filter convergence, monotonic increase, gradient colors, color transitions, var persistence, no shapes when default, no barcolors when default, history operator, nz behavior
    - _Requirements: 11.10_

- [x] 87. Add Compatibility Implementation Prompt
  - [x] 87.1 Create prompts/compatibility-impl.md
    - Document integration test-first workflow for implementing new Pine Script indicators
    - Include test structure template, common gotchas, key file references
    - _Requirements: 11.10_

- [x] 88. Implement Volatility Trail Indicator Compatibility
  - [x] 88.1 Fix parser indentation-aware else-binding
    - Add `baseColumn` parameter to `parseIfStatement()` for indentation-aware else consumption
    - For standalone `if`, `baseColumn` = the `if` keyword's column; for `else if`, `baseColumn` = the `else` keyword's column (passed recursively)
    - An `else` is only consumed when `elseToken.span.start.column >= baseColumn`
    - For `else if`, consume the `if` keyword before recursing into `parseIfStatement(baseColumn)`
    - Prevents inner `if` blocks from stealing `else` clauses that belong to outer `if` statements at shallower indentation
    - _Requirements: 1.14, 3.24_

  - [x] 88.2 Implement `const` keyword support
    - Add `Const` token type to tokenizer and keyword mapping
    - Add `isConst` to `VariableDeclarationNode` AST, `IRGlobal`, compiler, scope, and execution engine
    - Parser branches for `const` declarations (typed and untyped)
    - _Requirements: 1.13, 3.27_

  - [x] 88.3 Implement `ta.hma()` builtin
    - Hull Moving Average using WMA-based algorithm with per-call-site buffer isolation
    - Maintains `half` (half-length WMA), `full` (full-length WMA), and `diff` (sqrt-length WMA of 2*half - full) buffers
    - Key: `hma_${len}_${hmaCallIndex}` for per-call-site isolation
    - Returns NA until sufficient data accumulated
    - `hmaCallIndex` reset each bar in `executeBar()`
    - _Requirements: 4.13_

  - [x] 88.4 Implement `plotchar()` builtin
    - Handles `plotchar(series, title, char, location, color, ...)` with variadic positional args
    - Produces `ShapeEntry` objects with unicode char, location (abovebar/belowbar/absolute), color, and text
    - Supports unicode characters (▲, ▼, ◆, etc.)
    - _Requirements: 6.38, 6.39, 6.40_

  - [x] 88.5 Implement `plotcandle()` builtin
    - Handles `plotcandle(open, high, low, close, color, ...)` storing body color into `barColorData`
    - _Requirements: 6.41, 6.42_

  - [x] 88.6 Add `display` namespace support
    - Resolve `display.data_window`, `display.pane`, `display.none` via `executeMemberExpression()`
    - When display is `none` or `0`, suppress plot from rendering
    - _Requirements: 6.43, 6.44_

  - [x] 88.7 Rewrite `plot()` builtin with variadic arguments
    - Changed from `(value, titleOrNamed?, namedArgs?)` to `(...allArgs)`
    - Separates positional args from trailing namedArgs object
    - Reads color from `positionalArgs[2]`, linewidth from `[3]`, style from `[4]`, display from `[11]`
    - Named args override positional when both present
    - Pushes `positionalArgs[0]` (the series) to output
    - _Requirements: 6.45_

  - [x] 88.8 Rewrite `fill()` builtin with variadic arguments
    - Changed from `(plot1, plot2, namedOrNamed?)` to `(...allArgs)`
    - Reads `top_color` from `positionalArgs[4]` and `bottom_color` from `positionalArgs[5]`
    - Stores one color per bar in `fillColorData` for per-bar segment rendering
    - _Requirements: 6.46_

  - [x] 88.9 Fix AreaRenderer per-bar fill color rendering
    - When `fillColorData` exists, skip the base fill polygon entirely
    - Draw only per-bar color segments with their actual colors
    - Prevents base polygon color bleeding through transparent per-bar overlay segments
    - _Requirements: 21.42_

  - [x] 88.10 Fix MarkerRenderer unicode shape handling
    - Added `case '▲':`, `case '▼':`, `case '◆':` to `drawShape()` switch
    - Maps unicode chars from `plotchar` to named shape handlers (arrowUp, arrowDown, diamond)
    - _Requirements: 21.44_

  - [x]* 88.11 Write integration tests for volatility-trail indicator
    - Create 14 tests in `tests/integration/volatility-trail.test.ts`
    - Tests: parse/compile, output keys, non-null values, trail computation, trend detection, trail follows upperBand in bearish mode, trail flatness regression, fill rendering, plotchar markers, ta.hma convergence, var persistence, color transitions, bar-by-bar trace, debug Pine script
    - _Requirements: 11.11_

- [x] 92. Implement TradingView-style Chart Navigation Controls
  - [x] 92.1 Add Ctrl+scroll fine zoom to InteractionHandler
    - Detect Ctrl (or Cmd on Mac) modifier key during mouse wheel events
    - Apply a reduced zoom factor (e.g., 0.3x of normal zoom) when modifier is held
    - Center the fine zoom on the cursor position like normal scroll zoom
    - _Requirements: 21.66_

  - [x] 92.2 Add middle mouse button free panning to InteractionHandler
    - Detect middle mouse button (button === 1) mousedown on the chart area
    - Enter free pan mode: track delta X and delta Y from mousedown position
    - On mousemove, adjust both horizontal scroll position (bar index offset) and vertical price range offset
    - On mouseup, exit free pan mode
    - Do not affect price scale auto-range mode during middle-mouse pan
    - Set cursor to `grab`/`grabbing` during middle-mouse pan
    - _Requirements: 21.67_

  - [x] 92.3 Add time axis drag interaction to InteractionHandler
    - Detect mousedown on the time axis region (bottom scale area) via LayoutManager
    - On drag, compute the drag distance in pixels and convert to bar spacing change
    - Dragging right expands the time scale (increases bar spacing); dragging left compresses (decreases bar spacing)
    - Center the time scale zoom on the cursor position along the x-axis
    - Set cursor to `ew-resize` when hovering over the time axis area
    - _Requirements: 21.68_

  - [x] 92.4 Add double-click time axis reset to InteractionHandler
    - Detect double-click on the time axis region (bottom scale area)
    - Reset bar spacing to the default that fits all available data (equivalent to fitContent on time scale)
    - Do not affect the price range mode (leave auto/manual as-is)
    - _Requirements: 21.69_

  - [x] 92.5 Consolidate double-click price scale reset
    - Ensure double-click on the price scale area resets to auto price range and fits content
    - Verify existing double-click behavior from task 42.2 works correctly with the new time axis double-click
    - _Requirements: 21.70_

  - [x] 92.6 Write tests for new chart navigation controls
    - Test Ctrl+scroll applies reduced zoom factor vs bare scroll
    - Test middle mouse button panning adjusts both X and Y offsets
    - Test time axis drag changes bar spacing correctly
    - Test double-click time axis resets bar spacing to fit content
    - Test double-click price scale resets to auto price range
    - Test cursor changes for each interaction mode
    - _Requirements: 21.66, 21.67, 21.68, 21.69, 21.70_

- [x] 93. Fix Chart Drag and Price Scale Drag Behavior
  - [x] 93.1 Change chart area drag to pan both horizontally and vertically (free move)
    - Modify InteractionHandler onMouseMove to adjust both viewport.pan(deltaX) and layout.panPrice(deltaY) during chart drag
    - Fire both onVisibleRangeChange and onPriceRangeChange callbacks
    - _Requirements: 21.62_

  - [x] 93.2 Change price scale drag to zoom vertically instead of panning
    - Modify InteractionHandler onMouseMove to use layout.zoomPrice(factor, y) instead of layout.panPrice(deltaY)
    - Compute zoom factor from drag distance: factor = 1 + deltaY * 0.005
    - _Requirements: 21.63_

  - [x] 93.3 Fix chart auto-fit on initial load
    - Change ChartComponent to call chart.timeScale().fitContent() instead of chart.timeScale().scrollTo(lastIndex) on first data load
    - Ensures all data is visible on initial render rather than showing a portion with default barSpacing
    - _Requirements: 71_

- [x] 94. Fix Real-time Indicator Data Alignment
  - [x] 94.1 Permanently advance engine state for confirmed bars in ScriptSession
    - When a new bar arrives in appendOrUpdateBar, call executeBar() for the previous bar before computing forming candle for the new bar
    - Ensures EMA/SMA state is correct for indicator calculations across bar boundaries
    - _Requirements: 72_

  - [x] 94.2 Fix frontend forming candle merge to append new bar data
    - Modify useChartData handleExecutionResult to detect new bars via barIndex >= data.length
    - Append new plot data entries for new bars instead of replacing the last entry
    - Maintains correct alignment between candle data and indicator values
    - _Requirements: 73_

- [x] 95. Implement Indicator Pane Independent Price Scales
  - [x] 95.1 Render per-indicator-pane price scale labels on right side
    - Modify AxisRenderer.renderPriceScale to iterate over indicatorPanes
    - Render each pane's own price labels using layout.getIndicatorPriceRange(pane.id)
    - Calculate tick spacing per pane using layout.calculateAutoTickSpacing()
    - _Requirements: 74_

  - [x] 95.2 Add clipping for indicator pane rendering
    - Add ctx.save()/ctx.clip()/ctx.restore() around indicator pane rendering in PineChart.render()
    - Clip to pane.x, pane.y, pane.width, pane.height to prevent visual bleed-through
    - _Requirements: 75_

  - [x] 95.3 Draw horizontal separator lines for indicator panes
    - Draw border lines at bottom of each indicator pane
    - Draw border line between volume area and first indicator pane
    - _Requirements: 76_

- [x] 96. Implement Indicator Pane Autoscale on Scroll
  - [x] 96.1 Add autoscale price range computation for indicator panes
    - In PineChart, add `updateIndicatorPriceRange()` method that iterates all indicator panes
    - For each pane, filter indicator output series to only bars within the visible viewport range
    - Compute min/max from the filtered values with a small vertical padding margin (e.g., 5%)
    - Call `layout.setIndicatorPriceRange(paneId, min, max)` for each indicator pane
    - _Requirements: 26.14_

  - [x] 96.2 Hook autoscale into viewport change events
    - Register the autoscale recomputation as a listener on `onVisibleRangeChange` callback
    - After any scroll, pan, or zoom, recompute indicator pane price ranges before the next render frame
    - Ensure the recomputation runs inside `beginUpdate/endUpdate` to batch rendering
    - _Requirements: 26.14, 26.15_

  - [x] 96.3 Ignore manual price range for indicator panes
    - In `setIndicatorPriceRange()`, always compute from visible data — never use a cached manual override
    - Remove any indicator pane from the manual price range tracking in LayoutManager
    - Ensure double-click on price scale does NOT affect indicator panes (only main chart)
    - _Requirements: 26.16_

  - [x] 96.4 Handle empty and edge-case viewport ranges
    - When no indicator values are visible in the viewport, use the last known price range (fallback)
    - When all visible values are identical (flat line), expand the range by a fixed margin to avoid zero-height rendering
    - Guard against NaN/Infinity in indicator output values during autoscale computation
    - _Requirements: 26.14_

  - [x] 96.5 Update axis renderer for autoscaled indicator panes
    - Ensure AxisRenderer uses the autoscaled indicator price range when rendering pane price labels
    - Recalculate tick spacing per pane after autoscale recomputation
    - _Requirements: 26.14_

  - [x]* 96.6 Write tests for indicator pane autoscale
    - Test autoscale recomputes price range when viewport scrolls horizontally
    - Test autoscale recomputes when chart zooms in/out
    - Test indicator pane price range adjusts after lazy loading older bars
    - Test empty viewport falls back to last known range
    - Test flat-line indicator (all values equal) renders with expanded margin
    - Test double-click price scale does NOT reset indicator pane ranges
    - _Requirements: 26.14, 26.15, 26.16_

- [x] 89. Implement Pine Script v5 Compatibility Layer
  - [x] 89.1 Add v5 grammar rules to Parser
    - Create v5-specific grammar rule set alongside existing v6 rules
    - Parse `//@version=5` directive and select v5 grammar automatically
    - Handle v5 syntax differences: `plot()` parameter ordering, `study()` alias for `indicator()`, different type declaration syntax
    - Support v5-specific keywords and operators not present in v6
    - _Requirements: 26.1, 26.2, 26.4_

  - [x] 89.2 Add v5 type system rules to Compiler
    - Implement v5 type coercion rules (looser int/float casting, implicit conversions)
    - Handle v5-specific type annotations and constraints
    - Validate v5-specific function signatures and parameter types
    - _Requirements: 26.3, 26.5_

  - [x] 89.3 Add v5 built-in function implementations
    - Implement v5-specific built-in functions (e.g., `study()` instead of `indicator()`, v5 `plot()` signature)
    - Handle v5 `request.security()` parameter differences from v6
    - Implement v5-specific TA functions with v5 semantics
    - Support v5 `strategy()` parameters and defaults
    - _Requirements: 26.6, 26.7_

  - [x] 89.4 Add version detection to Execution Engine
    - Pass detected version through parser → compiler → execution pipeline
    - Dispatch built-in function calls to v5 or v6 implementations at runtime
    - Maintain version metadata in execution context
    - _Requirements: 26.1, 26.6, 26.10_

  - [x] 89.5 Update Backend to forward version info
    - Include detected Pine Script version in POST /api/execute response
    - Include version in WebSocket execution_result messages
    - _Requirements: 26.10_

  - [x] 89.6 Update Frontend to display detected version
    - Show detected Pine Script version in code editor status bar or header
    - Display version in error messages for better debugging
    - _Requirements: 26.9_

  - [x]* 89.7 Write tests for v5 compatibility
    - Test `//@version=5` detection and grammar selection
    - Test v5 `study()` declaration parsing
    - Test v5 `plot()` with v5 parameter ordering
    - Test v5 type coercion rules (int→float, float→int)
    - Test v5 built-in functions produce correct results
    - Test v6 scripts still work identically after v5 layer added
    - Test scripts without version declaration default to v6
    - Test mixed v5/v6 feature detection edge cases
    - _Requirements: 26.1-26.10, 11.1_

- [x] 90. Implement Separate Indicator Panes (overlay support)
  - [x] 90.1 Add `overlay` field to Compiler IR
    - Add `overlay: boolean` to `CompiledScript` interface in `src/language/compiler/ir.ts`
    - Extract `overlay` from `program.scriptArgs` during compilation (default: `false` for indicators)
    - _Requirements: 26.2_

  - [x] 90.2 Add `overlay` to ExecutionResult
    - Add `overlay: boolean` to `ExecutionResult` interface in `src/language/runtime/execution-engine.ts`
    - Pass through from `CompiledScript.overlay` during `executeBars()`
    - Include in `FormingCandleResult` for real-time updates
    - _Requirements: 26.3_

  - [x] 90.3 Pass `overlay` through Backend API responses
    - Include `overlay` in POST `/api/execute` response in `backend/src/routes/execute.ts`
    - Include `overlay` in WebSocket `execution_result` messages in `backend/src/session/ScriptSession.ts`
    - _Requirements: 26.4_

  - [x] 90.4 Update Frontend types and data hook
    - Add `overlay?: boolean` to `ScriptResult` interface in `frontend/src/types/index.ts`
    - Add `overlay?: boolean` to `ExecuteResponse` and `ExecutionResultMessage` in `frontend/src/hooks/useChartData.ts`
    - Pass `overlay` through `buildScriptResult()`
    - _Requirements: 26.5_

  - [x] 90.5 Update LayoutManager for multi-pane layout
    - Add `indicatorPanes` array to `LayoutRegions` with per-pane Y coordinates and height
    - Add `indicatorPriceRanges` map for per-indicator-pane price ranges
    - Modify `calculate()` to allocate space: 70% main chart + 30% indicator pane (or proportional split)
    - Add `setIndicatorPriceRange(paneId, min, max)` and `getIndicatorPriceRange(paneId)` methods
    - Add `indicatorToPixel()` coordinate transform for indicator pane
    - Add horizontal separator between panes
    - _Requirements: 26.6, 26.7_

  - [x] 90.6 Update PineChart for pane-aware rendering
    - Split `updatePriceRange()` into overlay-only and indicator-pane price range computation
    - Add `overlayPlots` vs `indicatorPlots` categorization in plot series management
    - Render non-overlay plots using indicator pane coordinates
    - Render indicator pane's own price scale labels
    - Synchronize horizontal scroll/zoom across all panes
    - _Requirements: 26.8, 26.9, 26.13_

  - [x] 90.7 Update ChartComponent to wire overlay-aware data
    - Separate `scriptResult.plots` into overlay vs indicator based on `overlay` flag
    - Pass overlay plots to main chart area, indicator plots to indicator pane
    - Update fills and hlines to respect pane assignment
    - _Requirements: 26.5, 26.10, 26.11_

  - [x] 90.8 Fix PineChart.updatePriceRange to exclude indicator values
    - Ensure overlay price range computation only considers overlay plots (not MACD values)
    - Ensure indicator pane price range only considers its own plots
    - _Requirements: 26.7_

  - [x]* 90.9 Write integration test for MACD indicator
    - Create `tests/integration/macd.test.ts`
    - Test parse/compile of macd.pine without errors
    - Test execution produces expected output keys (histogram, MACD, signal)
    - Test `overlay` flag is `false` in execution result
    - Test non-null values after warmup period
    - _Requirements: 26.12_

  - [x]* 90.10 Write tests for pane layout
    - Test LayoutManager allocates indicator pane space when overlay=false
    - Test separate price ranges for overlay vs indicator plots
    - Test PineChart renders indicator plots in correct pane coordinates
    - _Requirements: 26.6, 26.7, 26.8_

- [x] 91. Fix indicator pane post-feature bugs and expand test coverage
  - [x] 91.1 Add 'simple' type qualifier to parser and tokenizer
    - Add `Simple` token type to tokenizer and keyword mapping
    - Add `checkTypeKeyword()` to recognize `simple` as a type prefix (like `series`)
    - Update `parseTypeAnnotation()` to handle `simple` prefix before type names
    - _Requirements: 2.10, 1.12_

  - [x] 91.2 Fix switch statement to return matched case value instead of NA
    - Fix `executeSwitchStatement()` in `src/language/runtime/execution-engine.ts` to return the last statement result of the matched case body instead of always returning NA
    - Track `lastResult` through the case/default body loop and return it as the switch expression value
    - This was the root cause of real macd.pine producing all-null outputs — user functions like `ma()` using arrow-syntax switch (`"EMA" => ta.ema(...)`) always returned NA
    - _Requirements: 3.28_

  - [x] 91.3 Fix layout recalculation when overlay plot series are added/removed
    - Add `recalculateLayout()` method to PineChart that detects overlay count changes
    - Trigger `resize()` when the number of overlay plot series changes, so LayoutManager re-allocates pane space correctly
    - _Requirements: 26.6_

  - [x] 91.4 Clip candlesticks and overlay plots to main chart area
    - Add `ctx.save()`/`ctx.clip()`/`ctx.restore()` in `PineChart.render()` to create canvas clip regions
    - Clip candlesticks and overlay plots to `chartArea` rectangle
    - Clip volume bars to `volumeArea` rectangle
    - Prevents visual bleed-through of candlesticks/wicks into indicator panes below
    - _Requirements: 21.79, 21.80_

  - [x] 91.5 Expand integration tests for real MACD execution
    - Add test for real macd.pine execution producing 300 non-null values (100 bars × 3 outputs)
    - Add test for `input.source()` returning valid source data
    - Add test for switch-in-function patterns returning correct values
    - Add test for overlay=false flag in execution result
    - Add simplified MACD tests for independent verification
    - _Requirements: 11.12, 11.13, 11.14_

- [x] 97. Implement Dynamic Indicator Management UI
  - [x] 97.1 Add IndicatorManager state to Frontend
    - Create `RunningIndicator` type with id, scriptId, name, overlay, source, active fields
    - Create `useIndicatorManager()` hook with addIndicator, removeIndicator, handleIndicatorRemoved, getOverlayIndicators, getPaneIndicators methods
    - Track running indicators in React state
    - On app mount, fetch `GET /api/indicators` to restore persisted indicator list and re-execute each
    - _Requirements: 28.1, 28.2, 28.3, 28.10, 28.11, 28.12_

  - [x] 97.2 Add multi-session support to Backend WebSocket gateway
    - Extend ScriptSession to support multiple concurrent execution sessions per WebSocket client
    - Each running indicator gets its own ScriptSession with independent engine instance
    - On `execute` WS message, create a new ScriptSession keyed by indicator ID (not replacing existing sessions)
    - On kline update, iterate all active ScriptSessions and push execution_result for each
    - Add `indicatorId` field to execution_result WebSocket messages
    - _Requirements: 28.1, 28.4, 28.5_

  - [x] 97.3 Add remove indicator API and WebSocket message
    - Add `DELETE /api/indicators/:id` REST endpoint to stop an indicator's execution session
    - Add `stop_indicator` WebSocket message type `{ type: "stop_indicator", data: { indicatorId } }`
    - Clean up ScriptSession state and remove indicator from backend tracking
    - _Requirements: 28.2, 28.4_

  - [x] 97.3a Persist running indicator list to backend
    - Create `backend/data/indicators.json` with default schema `{ indicators: [] }`
    - Add `RunningIndicatorsStore` class using `JsonStore` infrastructure
    - Add `GET /api/indicators` endpoint to return persisted running indicator list
    - Add `POST /api/indicators` endpoint to persist a new running indicator
    - Add `DELETE /api/indicators/:id` endpoint to remove an indicator from the persisted list
    - On add/remove, write through to disk so state survives restarts
    - _Requirements: 28.10, 28.11, 28.12_

  - [x] 97.3b Auto-remove running indicators when script is deleted from bank
    - When `DELETE /api/scripts/:id` is called, iterate running indicators and stop any that reference the deleted scriptId
    - Remove auto-stopped indicators from `indicators.json` persistence
    - Send `indicator_removed` WebSocket message to all connected clients with the removed indicator IDs
    - Frontend handles `indicator_removed` by clearing chart data and updating indicator labels
    - _Requirements: 28.13, 28.14, 28.15, 28.16_

  - [x] 97.4 Render overlay indicator labels on main chart
    - In PineChart, render a vertical list of overlay indicator labels in the top-left corner of the main chart area
    - Each label shows the indicator name as a semi-transparent pill with a delete (×) button
    - Click delete button fires an `onRemoveIndicator(indicatorId)` callback
    - Labels update dynamically when indicators are added or removed
    - Labels are rendered on the topmost canvas layer (above candlesticks and plots)
    - _Requirements: 28.6, 28.7, 28.8, 28.9, 28.10, 28.11_

  - [x] 97.5 Render indicator pane labels for non-overlay indicators
    - In PineChart, render a label in the top-left corner of each indicator pane
    - Each label shows the indicator name and an unplot button (−)
    - Click unplot button fires an `onRemoveIndicator(indicatorId)` callback
    - Labels are rendered within the pane's clipped canvas region
    - _Requirements: 28.12, 28.13, 28.14, 28.15, 28.16_

  - [x] 97.6 Wire indicator management to chart data flow
    - When addIndicator is called: send execute WS message, add to IndicatorManager state, route execution_result outputs to correct pane based on overlay flag
    - When removeIndicator is called: send stop WS message, clear associated plot series/fills/shapes from PineChart, remove from IndicatorManager state, remove pane if empty
    - Handle multiple overlay indicators merging plots into the same main chart area
    - Handle multiple non-overlay indicators each in their own pane
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5_

  - [x] 97.7 Wire CodeEditor "Add" button to multi-indicator mode
    - Rename the "Run" button to "Add" in the CodeEditor
    - "Add" button adds the current script as a new indicator to the chart (appends to running indicators via POST /api/indicators)
    - "Add" button does NOT replace existing running indicators — it always adds a new one
    - When the same script (by scriptId) is already running, skip adding a duplicate or show a brief notification
    - Persist the new indicator to the backend via POST /api/indicators
    - _Requirements: 28.6, 28.7, 28.8, 28.9_

  - [x]* 97.8 Write tests for dynamic indicator management
    - Test addIndicator creates new ScriptSession and routes execution_result to correct pane
    - Test removeIndicator stops session, clears chart data, removes pane if empty
    - Test overlay labels render for overlay indicators and not for pane indicators
    - Test pane labels render for non-overlay indicators and not for overlay indicators
    - Test multiple overlay indicators coexist on main chart
    - Test multiple non-overlay indicators each get their own pane
    - Test remove indicator does NOT delete script from bank
    - Test indicator re-add restores execution and rendering
    - Test "Add" button appends indicator without replacing existing ones
    - Test duplicate scriptId is not added twice
    - Test persistence: add indicators, restart backend, verify indicators restored from GET /api/indicators
    - Test auto-remove: delete script from bank, verify running indicators referencing it are removed from chart
    - Test auto-remove: verify WebSocket `indicator_removed` message is sent to frontend
    - Test auto-remove: verify persistence file is updated after cascade delete
    - _Requirements: 28.1-28.27_

- [x] 98. Checkpoint - Dynamic Indicator Management Validation
  - Validation revealed a multi-indicator rendering bug: plots disappeared (MACD) and a blue line grew when adding multiple indicators
  - Root cause: `ChartComponent.tsx` used complex `activeKeysRef`/`keyToTitlesRef`/`prevIndicatorResultsRef` key-tracking system that incorrectly removed plot series during add/realtime cycles
  - Fix committed as `d5f0fad` — see Task 99

- [x] 99. Fix Multi-Indicator Rendering (Simplify to Add-All-Remove-Stale Pattern)
  - Study the old working commit `aad6e63` — it used a simple "iterate all results, add plots, remove stale" pattern with no key-tracking refs
  - Restore the old simple pattern in `ChartComponent.tsx`: remove all key-tracking refs, use a single flat iteration over all results (main + indicatorResults), addPlotSeries for each title, remove any series not in the current combined title set
  - Fix `useChartData.ts` indicator routing: add `msg.formingCandle` to the `isDiff` check so forming-candle updates merge instead of replacing the entire result
  - Committed as `d5f0fad`
  - _Requirements: 28.28, 28.29, 28.30_

- [x] 100.1 Implement GET /api/bars endpoint for fetching raw OHLCV by index range
  - Add GET /api/bars route accepting fromIndex, toIndex, symbol, timeframe query params
  - Fetch bars from Bybit adapter (or cache), slice by index range
  - Return bar data with index positions for frontend lookback computation
  - Verify endpoint returns correct data for given range
- [x] 100.2 Build lookback seed data resolver
  - Analyze compiled script IR to determine max lookback across all builtins (sma, ema, rsi, etc.)
  - Add `maxLookback` field to CompiledScript during compilation phase
  - Implement lookback inference from TA function call-site parameters (e.g., ta.sma(src, 20) → lookback=20)
  - Return maxLookback from backend in /api/execute response
  - _Requirements: 29.1, 29.2_
- [x] 100.3 Implement frontend lookback seed loading
  - When executing an indicator, request N additional seed bars before the visible range
  - Prepend seed bars to the bar array before passing to engine execution
  - Suppress indicator plot rendering for the first N warm-up bars
  - _Requirements: 29.3_
- [x] 100.4 Build interruptible batch computation queue
  - Create useProgressiveIndicatorData hook with priority queue (immediate > scroll > prefetch)
  - Detect newly visible bars via onVisibleRangeChange callback
  - Compute indicators in small batches (10-50 candles per animation frame)
  - Support cancellation of in-flight batch when viewport shifts again
  - _Requirements: 29.4, 29.5, 29.6, 29.7_
- [x] 100.5 Implement progressive computation on scroll
  - When user scrolls backward, enqueue the newly visible bar range for batch computation
  - Process batches across animation frames using requestAnimationFrame
  - Merge computed indicator values into the full data array
  - Trigger chart re-render after each batch completes
  - _Requirements: 29.8, 29.9_
- [x] 100.6 Implement instant catch-up path
  - Track which regions of the indicator data are computed vs missing
  - If user scrolls past the progressive fill head, compute the skipped region in a single high-priority pass
  - Render immediately after catch-up completes
  - _Requirements: 29.10_
- [x] 100.7 Ensure realtime forming candle works with progressive model
  - Forming candle updates continue to recompute only the last candle (no batch needed)
  - Progressive computation pauses during forming candle tick processing
  - _Requirements: 29.11, 29.12_
- [x] 100.8 Test progressive indicator computation
  - Existing 1044 tests continue to pass (0 regressions)
  - Progressive reveal hook works without breaking existing rendering
  - Auto re-execution on scroll confirmed via fetchOlderOHLCV chain
  - Lookback seed loading confirmed via maxLookback from backend execution
  - GET /api/bars endpoint returns correct bar data by count/before params
  - Test scroll far back → verify progressive fill fills in gradually
  - Test instant catch-up by artificially slowing computation
  - Test interrupt on mid-scroll direction change
  - Test forming candle tick recalc still works
  - Test lookback seed loading produces correct warm-up values
  - Run all existing tests to confirm no regressions
  - Ask the user if questions arise.
- [x] 100.9 Add design.md spec for progressive computation (already done in previous session)
  - _Requirements: 29.1–29.15_

- [x] 100. Implement Progressive Indicator Computation
  - Sub-tasks 100.1-100.9 all completed
  - Core functionality: GET /api/bars endpoint, maxLookback detection in engine, frontend lookback seed loading, auto re-execution on scroll, progressive reveal hook
  - 0 regressions in existing test suite
  - Rethink the indicator computation model from "compute everything upfront" to lazy/progressive per-viewport
  - Design lookback seed data management: max lookback detection, pre-visible candle loading, warm-up period suppression
  - Build interruptible batch queue with priority levels (immediate tick > scroll catch-up > scroll progressive > prefetch)
  - Implement progressive batch computation on `onVisibleRangeChange` — compute 10–50 candles per animation frame
  - Add `useIndicatorData` hook managing per-indicator computed ranges, seed state, and stale tracking
  - Add instant catch-up path: if user scrolls past uncomputed region, compute it immediately in one pass
  - Ensure realtime forming candle remains per-candle computation (no batch needed)
  - Wire `GET /api/bars?range=` endpoint for fetching raw OHLCV data by index range
  - Ensure rendering pipeline (Task 99) is compatible — it receives computed arrays and renders unchanged
  - Test: scroll far back and verify progressive fill, test instant catch-up by artificially slowing computation, test interrupt on mid-scroll direction change, test forming candle tick recalc
  - _Requirements: 29.1–29.15_
  - Add multiple overlay indicators (SMA, EMA, Bollinger) — verify labels appear in top-left and all plot on chart
  - Remove an overlay indicator via delete button — verify its plots disappear and label is removed
  - Add a non-overlay indicator (MACD) — verify label appears in pane top-left
  - Remove MACD via unplot button — verify pane is removed
  - Verify removed indicators are NOT deleted from the script bank
  - Verify real-time updates continue for all running indicators independently
  - Verify "Add" button adds indicator without replacing existing ones
  - Verify duplicate script is not added twice
  - Restart backend, verify running indicators are restored from persistence and re-execute on chart
  - Delete a script from the bank — verify its running indicators are auto-removed from the chart
  - Verify `indicator_removed` WebSocket message clears the frontend chart data
  - Run all existing tests to confirm no regressions
  - Ask the user if questions arise.

- [x] 101. Implement Time-Based Renderer Positioning
  - [x] 101.1 Add `findBarIndex` helper to PineChart
    - Create `findBarIndex(candles, time)` that returns the index of the candle with matching `Math.floor(time)`, or -1 if no match
    - Linear scan over visible bars (overscan buffer is small enough for O(n) to be acceptable)
    - Returns -1 on no match — renderers skip the data point rather than drawing diagonal lines
    - _Requirements: 30.1, 30.2, 30.3, 30.4_
  
  - [x] 101.2 Update LineRenderer to use time-based positioning
    - For each plot data point, call `findBarIndex(candles, point.time)` to get the x-coordinate
    - If `findBarIndex` returns -1, skip the point (break the line at gaps)
    - Remove sequential index assumption from line path construction
    - _Requirements: 30.1, 30.5_
  
  - [x] 101.3 Update AreaRenderer to use time-based positioning
    - Fill polygon vertices computed from `findBarIndex` results for both upper and lower lines
    - Skip vertices where `findBarIndex` returns -1
    - _Requirements: 30.1, 30.5_
  
  - [x] 101.4 Update CrosshairRenderer to use time-based matching
    - Tooltip OHLCV values matched via `Math.floor(candle.time)` to the hovered bar's time
    - Ensures correct values even when candles and indicator data have slightly different bar counts
    - _Requirements: 30.1, 30.6_
  
  - [x]* 101.5 Write tests for time-based positioning
    - Test `findBarIndex` with exact match, no match, and multiple matches
    - Test LineRenderer with prepended data (index shift) — verify no diagonal lines
    - Test CrosshairRenderer with mismatched candle/indicator bar counts
    - _Requirements: 30.1-30.6_

- [x] 102. Darken Chart and UI Theme
  - [x] 102.1 Update CSS color palette in index.css
    - Background: `#1a1a2e` → `#0d0d18`
    - Grid: `#2a2a4e` → `#181830`
    - Borders: `#0f3460` → `#111128`
    - Panel backgrounds: `#16213e` → `#0f1520`
    - _Requirements: 31.1, 31.2, 31.3, 31.4_
  
  - [x] 102.2 Update canvas renderer background fills
    - AxisRenderer background fill: `#0d0d18`
    - CrosshairRenderer tooltip background: `rgba(15,15,35,0.95)`
    - CrosshairRenderer crosshair background: `rgba(12,12,30,0.95)`
    - _Requirements: 31.5_
  
  - [x] 102.3 Update component inline styles
    - BacktestPanel, BacktestResults, CodeEditor, ErrorConsole, StrategyResultsPopup, TelegramConfigPanel
    - Replace all inline color references to match dark theme
    - _Requirements: 31.5, 31.6_
  
  - [x]* 102.4 Write tests for dark theme consistency
    - Verify all CSS color variables are updated
    - Verify canvas renderers use correct dark theme colors
    - Verify no stale lighter color references remain in components
    - _Requirements: 31.1-31.6_

- [x] 103. Add Auto-Scale Toggle to Footer Bar
  - [x] 103.1 Add `forceAutoScale` flag to LayoutManager
    - Add `forceAutoScale: boolean` field (default `true`)
    - `setManualPriceRange()` — no-op when `forceAutoScale` is true
    - `zoomPrice()` — no-op when `forceAutoScale` is true
    - `panPrice()` — no-op when `forceAutoScale` is true
    - Add `setForceAutoScale(v)` and `isForceAutoScale()` methods
    - _Requirements: 32.3_
  
  - [x] 103.2 Add `setForceAutoScale` to PineChart
    - Delegate to `layout.setForceAutoScale(v)`
    - _Requirements: 32.6, 32.7_
  
  - [x] 103.3 Add `forceAutoScale` prop to ChartComponent
    - Accept `forceAutoScale` boolean prop
    - Add useEffect that syncs prop to `chart.setForceAutoScale()` on change
    - _Requirements: 32.5_
  
  - [x] 103.4 Add footer bar UI to App.tsx
    - Add `autoScale` state (default `true`)
    - Render `.footer-bar` div between `<main>` and `<ErrorConsole>`
    - Add `.auto-scale-toggle` button that toggles `autoScale` state
    - Button shows green when active, dim when inactive
    - Pass `forceAutoScale={autoScale}` to ChartComponent
    - _Requirements: 32.1, 32.2, 32.5, 32.8_
  
  - [x]* 103.5 Write tests for auto-scale toggle
    - Test auto-scale default is true on page load
    - Test toggle button changes autoScale state
    - Test LayoutManager blocks price range operations when autoScale is true
    - Test LayoutManager allows price range operations when autoScale is false
    - _Requirements: 32.1-32.8_

- [x] 104. Fix Scroll Re-Execution and Indicator Boundary Recomputation
  - [x] 104.1 Fix execBars chronological ordering in fetchOlderOHLCV
    - Change execBars from `[...contextBars, ...newBars]` to `[...newBars, ...contextBars]` (chronological order)
    - Context bars are the last `maxLookback` bars from the previous batch
    - Context bars are NOT added to `ohlcvDataRef.current`
    - _Requirements: 33.1, 33.2, 33.3_
  
  - [x] 104.2 Implement boundary recomputation in prependIndicatorResult
    - Split newResult into newBarData (bars not in indicator state) and boundaryData (first `maxLookback` bars of previous batch)
    - Merge: `[...newBarData, ...boundaryData, ...remainingPrev]` where remainingPrev skips the first K entries from prevResult
    - Prevents incorrect indicator values at the boundary between old and new data
    - _Requirements: 33.4, 33.5_
  
  - [x] 104.3 Ensure beginUpdate/endUpdate batching for scroll re-execution
    - Wrap scroll re-execution result application in `beginUpdate`/`endUpdate` to batch all chart updates into a single frame
    - _Requirements: 33.6_
  
  - [x]* 104.4 Write tests for scroll re-execution and boundary recomputation
    - Test execBars is chronological (new bars before context bars)
    - Test context bars do not leak into ohlcvDataRef
    - Test boundary recomputation produces smooth indicator transition
    - Test beginUpdate/endUpdate batching prevents visual flicker
    - _Requirements: 33.1-33.6_

- [x] 105. Fix TrendCraft Lowercase User-Defined Type Parsing
  - [x] 105.1 Add `looksLikeUserTypeDecl()` method to Parser
    - Same logic as `looksLikeUserType()` but without the PascalCase check (`/^[A-Z]/`)
    - Used only in `var`/`varip`/`const` contexts where the declaration keyword already commits to a declaration
    - _Requirements: 34.1, 34.2_
  
  - [x] 105.2 Update `parseStatement` to use `looksLikeUserTypeDecl` for var/varip/const
    - At line ~149 (`var`), line ~155 (`varip`), line ~161 (`const`): use `looksLikeUserTypeDecl()` instead of `looksLikeUserType()`
    - Standalone context (line ~201) keeps `looksLikeUserType()` with PascalCase check to prevent `val\nx` misparse
    - _Requirements: 34.2, 34.3, 34.4_
  
  - [x] 105.3 Write tests for TrendCraft parser fix
    - Test `var piv pH = na` parses as VariableDeclarationNode with typeAnnotation="piv", name="pH"
    - Test `var int x = 1` still works (PascalCase types in var context)
    - Test standalone `int x = 1` still requires PascalCase (prevents `val\nx` misparse)
    - Test TrendCraft ICT SwiftEdge indicator executes without `Variable 'pH' is not defined` error
    - All 6 TrendCraft integration tests pass
    - _Requirements: 34.1-34.5_

- [x] 106. Implement File-Based Script Storage with AI Agent Integration
  - [x] 106.1 Create scripts directory structure
    - Create `backend/data/scripts/` directory on backend startup (auto-create if missing)
    - Create optional subdirectories: `indicators/`, `strategies/`, `libraries/`
    - Add `backend/data/scripts/` to `.gitignore` (user-local data, not committed)
    - _Requirements: 26.6, 27.1, 27.2_

  - [x] 106.2 Implement filename sanitization utility
    - Create `sanitizeFilename(name: string): string` function
    - Convert to lowercase, replace spaces with underscores, remove special characters
    - Truncate to 64 characters (excluding extension)
    - Append numeric suffix for conflicts: `my_script.pine` → `my_script_1.pine`
    - Preserve UTF-8 characters for international names
    - _Requirements: 27.2, 27.15_

  - [x] 106.3 Create ScriptsManifest data structure
    - Define `FileScriptEntry` interface with id, filename, name, source, scriptType, filePath, createdAt, updatedAt, checksum
    - Define `ScriptsManifest` interface with scripts array, lastSyncAt, version
    - Create `ScriptsManifestStore` class using `JsonStore` infrastructure
    - Auto-create `backend/data/scripts/manifest.json` on first launch
    - _Requirements: 27.5, 27.16_

  - [x] 106.4 Implement File → Database sync engine
    - Create `FileSyncEngine` class with methods: `syncFile(filePath)`, `removeFile(filePath)`, `fullSync()`
    - On file creation: read content, validate syntax, detect script type, extract name, generate ID, register in manifest and database
    - On file modification: read updated content, validate syntax, update timestamp, recompute checksum, update manifest and database
    - On file deletion: remove from manifest and database, stop any running indicators
    - _Requirements: 26.3, 26.4, 26.5, 27.9, 27.10, 27.11_

  - [x] 106.5 Implement Database → File sync engine
    - When script is created via API (`POST /api/scripts`): generate sanitized filename, write `.pine` file, create manifest entry
    - When script is updated via API (`PUT /api/scripts/:id`): update corresponding `.pine` file, update manifest entry
    - When script is deleted via API (`DELETE /api/scripts/:id`): delete corresponding `.pine` file, remove manifest entry
    - _Requirements: 26.8, 27.6, 27.7, 27.8_

  - [x] 106.6 Implement file watcher using chokidar
    - Install `chokidar` dependency in backend
    - Watch `backend/data/scripts/**/*.pine` recursively
    - Handle events: `add`, `change`, `unlink`
    - Debounce events by 100ms to batch rapid changes
    - Log all file operations for auditing
    - Handle watcher errors gracefully (permission issues, etc.)
    - _Requirements: 26.12, 27.12_

  - [x] 106.7 Implement conflict resolution and race condition handling
    - Last-write-wins for simultaneous API and file changes
    - API writes acquire a file lock before writing
    - Checksum comparison prevents unnecessary updates
    - Handle edge cases: file watcher delay, API timeout, partial writes
    - _Requirements: 26.13, 27.13_

  - [x] 106.8 Add REST API endpoints for file metadata
    - `GET /api/scripts/files` — list all scripts with file metadata
    - `GET /api/scripts/files/:id` — get file metadata for a script
    - `GET /api/scripts/files/:id/content` — get raw file content
    - `POST /api/scripts/files/sync` — force sync from filesystem
    - `GET /api/scripts/files/status` — get sync status and last sync time
    - _Requirements: 26.14, 27.14_

  - [x] 106.9 Implement script type auto-detection
    - Parse script content to detect `indicator()`, `strategy()`, or `library()` calls
    - Extract script name from declaration
    - Handle edge cases: multiple declarations, missing declarations, malformed code
    - _Requirements: 26.13, 26.3_

  - [x] 106.10 Add bulk import support
    - Support importing multiple `.pine` files at once
    - Process files sequentially with progress logging
    - Errors logged but don't block other files
    - Summary report available via `/api/scripts/files/status`
    - _Requirements: 26.16_

  - [x] 106.11 Add security and validation
    - Validate file paths to prevent directory traversal
    - Enforce file size limits (max 1MB per script)
    - Rate limiting on sync operations
    - Audit logging for all file operations
    - _Requirements: 26.14, 27.14_

  - [x] 106.12 Update Script Bank to use file-based storage
    - Modify `ScriptStore` to read/write from filesystem instead of just `scripts.json`
    - Maintain backward compatibility with existing `scripts.json` format
    - Add migration script to convert existing scripts to file-based format
    - _Requirements: 26.1, 27.1_

  - [x]* 106.13 Write tests for file-based storage
    - Test filename sanitization with various inputs
    - Test file creation via API creates corresponding `.pine` file
    - Test file modification via API updates corresponding `.pine` file
    - Test file deletion via API deletes corresponding `.pine` file
    - Test file watcher detects external file creation and syncs to database
    - Test file watcher detects external file modification and updates database
    - Test file watcher detects external file deletion and removes from database
    - Test conflict resolution with simultaneous API and file changes
    - Test bulk import of multiple files
    - Test security validation (path traversal, file size limits)
    - Test REST API endpoints for file metadata
    - Test script type auto-detection
    - _Requirements: 26.1-26.16, 27.1-27.16_

  - [x]* 106.14 Write integration tests for AI agent workflow
    - Test AI agent creates script file → appears in editor dropdown
    - Test AI agent modifies script file → changes reflected in editor
    - Test AI agent deletes script file → removed from editor
    - Test multiple AI agents creating scripts simultaneously
    - Test AI agent script execution on chart
    - _Requirements: 26.1-26.16, 27.1-27.16_

- [x] 107. Checkpoint - File-Based Storage and AI Agent Integration Validation
  - Create a script file manually in `backend/data/scripts/` → verify it appears in editor
  - Modify the file directly → verify changes reflected in editor
  - Delete the file → verify it's removed from editor
  - Create a script via API → verify `.pine` file is created
  - Update a script via API → verify `.pine` file is updated
  - Delete a script via API → verify `.pine` file is deleted
  - Test AI agent workflow: create file → appears in editor → execute on chart
  - Verify file watcher detects changes promptly (< 200ms)
  - Verify conflict resolution works correctly
  - Verify bulk import works
   - Run all existing tests to confirm no regressions
   - Ask the user if questions arise.

- [x] 108. Built-In Test Indicators in Script Editor
  - [x] 108.1. Create backend endpoint `GET /api/scripts/built-in` that reads `test_indicators/*.pine` and returns script list with `id: "builtin_<filename>"`, name, source, and type
  - [x] 108.2. Add frontend type for built-in scripts and API call to fetch them
  - [x] 108.3. Display built-in scripts in a "Built-In Tests" category in the script editor dropdown
  - [x] 108.4. Disable delete action for built-in scripts (button hidden or disabled)
  - [x] 108.5. Make built-in scripts uneditable — editor disabled/read-only for built-in scripts
  - [x] 108.6. Enable "Run on Chart" for built-in scripts — clicking executes the script on the active chart
  - [x] 108.7. Ensure built-in scripts are NOT synced to manifest or file-based storage
  - [x] 108.8. Write tests for built-in indicator API, display, and chart execution
  - _Requirements: 38.1, 38.2, 38.3, 38.4, 38.5, 38.6, 38.7, 38.8_

- [x] 109. Fix Multi-Pane Layout for Non-Overlay Indicators
  - **Context:** The existing indicator pane implementation (Tasks 90, 97) stores `indicatorPanes` as an array but LayoutManager only allocates a single shared pane at 30% of available height. When multiple non-overlay indicators (e.g., MACD + RSI) are added, all their plots render on top of each other in the same pane. Each non-overlay indicator must get its own independent pane with its own price scale.
  - [x] 109.1 Fix `resize()` to pass correct indicator count and `recalculateLayout()` to count distinct paneIndices instead of counting plot series — LayoutManager already allocated N panes; the bug was `resize()` always passing `indicatorCount=1`
  - [x] 109.2 Add `paneIndex` field to `PlotSeriesHandle`, update `addPlotSeries()` to accept and store `paneIndex`, fix `render()` pane loop to match plots to their pane by index (`handle.paneIndex === paneIndex`), fix `updatePriceRange()` per-pane range computation to only scan plots assigned to that pane
  - [x] 109.3 AxisRenderer already rendered independent price scale labels per pane via `layout.getIndicatorPriceRange(pane.id)` — no changes needed
  - [x] 109.4 Dynamic pane creation: `recalculateLayout()` counts distinct paneIndices from handles, triggers resize when count changes; ChartComponent tracks `nonOverlayPaneIndex` counter per non-overlay indicator result, assigns incrementing paneIndex via `addPlotSeries(title, opts, overlay, paneIndex)`
  - [x] 109.5 Dynamic pane removal: `removeSeries()` calls `recalculateLayout()`, pane indices re-assigned by ChartComponent on next render cycle; `addPlotSeries()` updates `existing.paneIndex` on re-added handles so pane indices stay consistent after removal
  - [x] 109.6 Separator lines already drawn between adjacent panes (top-border of each pane in `render()`); now correctly tracks pane count changes
  - [x] 109.7 Write tests for multi-pane layout
    - Test LayoutManager allocates N panes when N non-overlay indicators are present
    - Test each pane has its own independent price range computed from its own indicator's values
    - Test adding a non-overlay indicator creates a new pane and redistributes space
    - Test removing a non-overlay indicator removes its pane and redistributes space to remaining panes
    - Test separator gaps between all adjacent panes (not just first two)
    - Test no regression: single non-overlay indicator still renders correctly (backward compatible)
    - 5 new tests added to `tests/integration/pane-layout.test.ts` — all pass with 0 regressions
  - _Requirements: 29.6, 29.7, 29.8, 29.9, 29.10, 29.11, 29.18, 29.19_

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
- Tasks 59-68 implement post-backtest enhancements: switch expressions (59), generic array methods and line/label dispatch (60), lines/labels full frontend pipeline (61), per-bar colors (62), TA semantics fixes and missing builtins (63), lazy loading (64), TrendCraft compatibility (65), plot style/bgcolor/strategy tests (66), backend/frontend integration fixes (67), and final validation (68)
- Task 69 fixes indicator alignment after lazy loading by adding barTimestamps to the execution pipeline, validating output lengths in handleExecutionResult, and guarding against stale WebSocket sessions
- Tasks 70-72 implement JSON file-based persistent storage (`backend/data/telegram.json`), Telegram Bot notification system, and per-alert Telegram selection UI
- Task 73 is the checkpoint validating Telegram notifications, JSON file persistence, and non-content-blocking alert markers
- Task 75 implements real-time indicator computation for forming (live) candles: on each tick or kline update within the current candle's lifetime, only the last bar is re-evaluated without historical reprocessing, pushing partial indicator updates to the frontend for live intra-bar tracking
- Tasks 76-77 implement the Script Bank: a persistent bank of scripts with CRUD operations (create, read, update, delete) stored in `backend/data/scripts.json`, REST API endpoints, and a frontend panel for browsing, creating, editing, deleting, and selecting scripts. The active script selection is persisted across restarts and auto-loaded into the editor on app startup
- Tasks 79-80 unify the script editor: the separate ScriptBankPanel is removed and replaced with a dropdown inside the CodeEditor. The editor becomes the single source of truth for script management. Scripts auto-save on edit without re-executing the chart. The "Run" button executes and persists the running script. Script names are auto-extracted from source. A separate "runningScriptId" tracks the currently running script across reloads
- Task 81 implements bar-close only alert dispatch: `computeFormingCandle()` suppresses alert triggers during intra-bar updates so that Telegram/email/webhook notifications only fire on confirmed bar close, preventing notification spam during live candle formation. Requirement 14.17 specifies the constraint.
- Task 81.4-81.7 adds three layers of alert deduplication: `lastConfirmedTimestamp` per-session guard, `recentAlertKeys` module-level Set with 100-entry LRU eviction, and stale WebSocket connection pruning at iteration start. Also fixes series length drift in `computeFormingCandle()` rollback.
- Task 82 refactors the forming-candle architecture so that `isFormingCandle` is entirely caller-managed via `engine.setFormingCandle()`. Confirmed bars route through `computeFormingCandle()` (not `executeRealtimeBar()`) to avoid double-advancing state. The engine-level `diffAlertTriggers = []` suppression is removed — alert control is fully delegated to the gateway layer.
- Task 83 improves CodeEditor UX: "Create Your First Script" empty state, script name extraction on creation, and flash prevention by initializing `currentCode` as `null`.
- Task 84 improves Telegram reliability: fixes `isActive()` race condition by moving `this.isRunning = true` before `bot.launch()`, adds MarkdownV2 plain-text fallback on parse errors, and adds comprehensive alert pipeline logging.
- Task 85 fixes stale-bar gap by using `ohlcvDataRef.current` instead of `pendingExecuteRef.bars` when sending the WebSocket execute message.
- Task 86 implements Two-Pole Trend Filter compatibility: parser fixes (method keyword, compound assignments, type-first params, PascalCase guard), runtime fixes (var persistence, namedArgs, method dispatch, compound assignment execution), new builtins (ta.atr, color.from_gradient, barcolor, nz, math constants), barColorData pipeline, plotshape title fix, shape location.absolute rendering, and integration tests.
- Task 87 adds the compatibility implementation prompt template (`prompts/compatibility-impl.md`) for onboarding new Pine Script indicators with a test-first workflow.
- Task 88 implements volatility-trail indicator compatibility: parser indentation-aware else-binding fix (the root cause of trail flatness), `const` keyword support, `ta.hma()` WMA-based Hull Moving Average, `plotchar()`/`plotcandle()` builtins, `display` namespace, variadic `plot()`/`fill()` builtins, AreaRenderer per-bar fill color fix (skip base polygon when fillColorData exists), MarkerRenderer unicode shape support (▲/▼/◆), and 14 integration tests. Also adds 20 debugging methodologies to `prompts/compatibility-impl.md`.
- Task 89 implements Pine Script v5 compatibility layer: adds v5 grammar rules to the parser, v5 type coercion rules to the compiler, v5-specific built-in functions, version detection pipeline from parser through execution, backend version forwarding, frontend version display, and comprehensive tests. The engine dynamically detects `//@version=5` or `//@version=6` and applies the corresponding grammar and semantics automatically.
- Task 90 implements separate indicator panes with overlay support: full-stack indicator pane support so non-overlay indicators (e.g., MACD) render in their own pane below the main chart with independent price scales. IR/Engine add overlay field, Backend forwards it, Frontend LayoutManager allocates pane space, PineChart renders indicator plots in separate coordinate space.
- Task 91 fixes post-feature bugs in the indicator pane implementation: adds 'simple' type qualifier to parser, fixes switch-as-expression to return matched case body value (root cause of real macd.pine producing all-null outputs), adds layout recalculation on overlay count changes, clips candlesticks/volume/overlays to their respective canvas regions to prevent bleed-through into indicator panes, and expands integration tests to cover real MACD execution, input.source(), switch-in-function patterns, and overlay flags.
- Task 92 implements TradingView-style chart navigation controls: Ctrl+scroll for fine-grained zoom, middle mouse button free panning, time axis drag for time-scale zoom, double-click time axis reset, and consolidated double-click price scale reset — matching the interaction model of TradingView's Lightweight Charts.
- Task 93 fixes chart drag and price scale drag behavior: chart area drag now pans both horizontally and vertically (free move), price scale drag now zooms vertically instead of panning, and chart auto-fits all data on initial load using fitContent() instead of scrollTo().
- Task 94 fixes real-time indicator data alignment: backend permanently advances engine state for confirmed bars via executeBar() when new bars arrive (previously always used computeFormingCandle which saved/restored state), frontend appends new plot data entries for new bars instead of replacing the last entry (previously caused MACD values to appear on genesis candle).
- Task 95 implements indicator pane independent price scales: AxisRenderer now renders per-indicator-pane price labels on the right side using each pane's own price range, indicator pane rendering is clipped to allocated regions via canvas clipping, and horizontal separator lines are drawn between panes.
- Task 96 implements indicator pane autoscale on scroll: when the user scrolls, pans, or zooms the chart, each indicator pane automatically recomputes its Y-axis price range from the visible indicator values in the current viewport, providing seamless autoscaling that matches TradingView behavior.
- Task 97 implements dynamic indicator management UI: users can add and remove multiple indicators from the chart independently. The "Add" button (renamed from "Run") appends indicators to the chart. Running indicator lists are persisted to `backend/data/indicators.json` and restored on restart. If a script is deleted from the bank, all its running indicators are automatically removed from the chart via cascade delete. Overlay indicators show labels with delete buttons in the top-left corner of the main chart. Non-overlay indicators show labels with unplot buttons in the top-left corner of their respective panes.
- Task 99 fixes the multi-indicator rendering bug discovered during validation: the complex `activeKeysRef`/`keyToTitlesRef` diffing system in ChartComponent was fragile and incorrectly removed plot series. The fix simplifies to the proven "add all, remove stale" pattern from `aad6e63` — iterate all results in a flat pass, add all plot series (idempotent via Linear chart), remove any not in the current title set. Also fixes indicator forming-candle routing by checking `msg.formingCandle` in `useChartData.ts`.
- Task 100 implements the Progressive Indicator Computation system: adds `maxLookback` detection to the execution engine (scans TA buffers after execution to determine maximum lookback period), a `GET /api/bars` endpoint for index-range-based bar fetching, frontend lookback seed loading (auto-fetches seed bars when maxLookback > 0), auto re-execution on scroll (triggers script re-execution after `fetchOlderOHLCV` completes), and a progressive reveal hook for smooth indicator data appearance. Existing lazy loading and realtime forming candle computation remain unchanged, ensuring backward compatibility.: a full rework of the indicator computation model from "compute everything upfront" to lazy/progressive per-viewport computation. Indicators are computed for the visible range (plus lookback seed data) and progressively filled as the user scrolls. The system uses an interruptible batch queue with priority levels, instant catch-up for fast scrolling, and per-candle realtime forming-candle recomputation. The rendering pipeline remains unchanged — it consumes computed arrays from the new `useIndicatorData` hook.
- Task 101 implements time-based renderer positioning: all chart renderers (LineRenderer, AreaRenderer, CrosshairRenderer) now use `findBarIndex(candles, time)` to match data points to candles by timestamp rather than sequential index. This makes rendering immune to index shifts from data prepending, WS session drift, and multiple data sources with different bar counts. Commit `dd4daa0`.
- Task 102 darkens the chart and UI theme: background `#1a1a2e` → `#0d0d18`, grid `#2a2a4e` → `#181830`, borders `#0f3460` → `#111128`, panels `#16213e` → `#0f1520`. Updated across 15 files (CSS, canvas renderers, component inline styles). Commit `78b788f`.
- Task 103 adds an auto-scale toggle to the footer bar: `LayoutManager.forceAutoScale` flag blocks `setManualPriceRange`, `zoomPrice`, and `panPrice` when active; PineChart delegates `setForceAutoScale()` to LayoutManager; ChartComponent accepts `forceAutoScale` prop; App.tsx manages `autoScale` state (default `true`) with toggle button in footer bar. Commit `6491d57`.
- Task 104 fixes scroll re-execution and indicator boundary recomputation: execBars changed to chronological `[...newBars, ...contextBars]`; `prependIndicatorResult` splits newResult into newBarData + boundaryData, merges with remaining prev data; context bars no longer leak into `ohlcvDataRef`; `beginUpdate`/`endUpdate` batching prevents flicker. Commits `39224a0` (corrected ordering) and `78b788f` (boundary recomputation).
- Task 105 fixes TrendCraft `Variable 'pH' is not defined` error: added `looksLikeUserTypeDecl()` (no PascalCase check) used only in `var`/`varip`/`const` contexts; standalone context keeps PascalCase to prevent `val\nx` misparse. All 1047 backend tests pass. Commit `12e78a4`.
- Tasks 106-107 implement AI Agent Integration and File-Based Storage: external AI coding agents can create scripts by writing `.pine` files to `backend/data/scripts/`. A file watcher (chokidar) detects changes and syncs them into the Script Bank database. Bidirectional sync ensures API-created scripts create files and file-created scripts register in the database. Features include filename sanitization, script type auto-detection, bulk import, conflict resolution, and comprehensive REST API endpoints for file metadata.

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
    { "id": 147, "tasks": ["109.1", "109.2", "109.3", "109.4", "109.5", "109.6", "109.7"] }
  ]
}
```