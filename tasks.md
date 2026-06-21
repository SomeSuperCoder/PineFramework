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

- [ ] 2. Implement language processing layer
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

- [ ] 4. Implement execution layer
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

- [ ] 10. Implement rendering layer (Plot Engine)
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

  - [ ] 10.3 Implement drawing objects engine
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

- [ ] 12. Implement strategy layer
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

- [ ] 21. Implement Frontend Web Application
  - [x] 21.1 Create frontend application shell
    - Set up React/Vue project with TypeScript
    - Configure build system (Vite/Webpack)
    - Set up routing and state management (Redux/Pinia)
    - Create responsive layout with chart and editor panels
    - _Requirements: 17.1, 17.8, 17.9, 17.10, 17.11_

  - [x] 21.2 Implement code editor component
    - Integrate Monaco Editor or CodeMirror
    - Add Pine Script syntax highlighting
    - Implement auto-completion for Pine Script keywords and functions
    - Create popup/modal editor that opens on button click
    - Build save/load script functionality
    - _Requirements: 17.2, 17.3, 17.16, 17.17, 17.18_

  - [x] 21.3 Implement chart component
    - Integrate Lightweight Charts or TradingView Charting Library
    - Build realtime candlestick chart with OHLCV data
    - Implement zoom/pan functionality
    - Add timeframe and symbol selection controls
    - Create chart legend with indicator names and values
    - _Requirements: 17.1, 17.8, 17.9, 17.10, 17.11, 17.12_

  - [x] 21.4 Implement error console component
    - Build real-time error logging panel
    - Display error messages with line numbers and descriptions
    - Handle compilation errors from Pine Script engine
    - Handle runtime errors from Pine Script execution
    - _Requirements: 17.5, 17.6, 17.7_

  - [x] 21.5 Integrate Pine Script engine with frontend
    - Connect code editor to Pine Script compilation pipeline
    - Render Pine Script visual outputs on chart (plots, shapes, labels, lines, boxes, tables, backgrounds, fills)
    - Support multiple concurrent indicators on same chart
    - Implement smooth rendering performance with large datasets
    - _Requirements: 17.4, 17.13, 17.14, 17.15_

  - [x] 21.6 Implement WebSocket connection for realtime data
    - Set up WebSocket client for data streaming
    - Handle realtime chart updates
    - Implement reconnection logic
    - Add data buffering for smooth updates
    - _Requirements: 17.8, 17.12_

  - [x]* 21.7 Write unit tests for frontend components
    - Test code editor rendering and syntax highlighting
    - Validate chart component with sample data
    - Test error console display and formatting
    - Verify WebSocket connection handling
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7_

  - [x]* 21.8 Write end-to-end tests for frontend
    - Test complete user workflow (open editor, write code, render on chart)
    - Validate error handling and logging
    - Test realtime chart updates
    - Verify save/load script functionality
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.18_

- [x] 22. Checkpoint - Frontend validation
  - Ensure frontend displays realtime candle chart correctly
  - Verify code editor opens as popup and allows Pine Script entry
  - Test compile and render on editor close
  - Validate error logging for compilation and runtime errors
  - Ask the user if questions arise.

- [ ] 23. Restructure project as pnpm monorepo
  - [ ] 23.1 Create root `pnpm-workspace.yaml`
    - Declare workspace packages: `src` (engine), `frontend`, `backend`
    - _Requirements: 18.1_
  
  - [ ] 23.2 Restructure root `package.json`
    - Add workspace-level scripts: `dev`, `build`, `test`, `lint`, `typecheck`
    - Add `concurrently` dev dependency for parallel dev servers
    - Set `private: true` to prevent accidental publish
    - _Requirements: 18.2, 18.8, 18.9, 18.10_
  
  - [ ] 23.3 Clean up frontend package
    - Remove `frontend/pnpm-lock.yaml` (nested lockfile)
    - Remove `frontend/pnpm-workspace.yaml` (not a real workspace config)
    - Remove `frontend/node_modules/` (will be hoisted to root)
    - Update `frontend/package.json` to add `"pine-framework": "workspace:*"` as dependency
    - _Requirements: 18.3, 18.4, 18.12_
  
  - [ ] 23.4 Create backend package scaffold
    - Create `backend/` directory with `package.json` (name: `pine-framework-backend`)
    - Add `"pine-framework": "workspace:*"` as dependency
    - Set up TypeScript config extending root
    - _Requirements: 18.5, 18.9_
  
  - [ ] 23.5 Verify monorepo works
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

- [ ] 25. Implement Backend API Server
  - [ ] 25.1 Set up Express server with TypeScript
    - Create `backend/src/index.ts` entry point
    - Configure Express with CORS, JSON body parsing
    - Set up TypeScript compilation and dev script
    - Add environment variable config (PORT, BYBIT_REST_URL, BYBIT_WS_URL)
    - _Requirements: 19.1, 19.8, 19.9_
  
  - [ ] 25.2 Implement REST API endpoints
    - `GET /api/ohlcv` — fetch historical kline data (symbol, interval, limit params)
    - `POST /api/execute` — accept Pine Script code, execute via engine, return results
    - `GET /api/symbols` — list available trading symbols from Bybit
    - `GET /api/status` — server status and Bybit connection health
    - _Requirements: 19.1, 19.3, 19.12_
  
  - [ ] 25.3 Implement WebSocket gateway
    - Set up `ws` library on the Express server
    - Handle client connection/disconnection lifecycle
    - Process subscribe/unsubscribe messages for kline topics
    - Broadcast realtime kline data to subscribed clients
    - Handle multiple concurrent WebSocket clients
    - _Requirements: 19.2, 19.5, 19.6_
  
  - [ ] 25.4 Integrate pine-framework engine for script execution
    - Import `pine-framework` engine API in backend
    - Parse Pine Script code via engine parser/compiler
    - Execute script against provided OHLCV data
    - Return plot data, drawing objects, and errors as JSON
    - _Requirements: 19.3_
  
  - [ ] 25.5 Implement OHLCV data cache
    - Create LRU cache for recent kline data per symbol+interval
    - Serve cached data for REST requests when available
    - Invalidate cache on new realtime data
    - _Requirements: 19.7_
  
  - [ ] 25.6 Add request validation and error handling
    - Validate all REST request parameters (symbol format, interval values, limit bounds)
    - Return proper HTTP error codes and messages
    - Handle engine execution errors gracefully
    - _Requirements: 19.12, 19.10_
  
  - [ ] 25.7 Write tests for backend API
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

- [ ] 27. Implement Bybit Exchange Integration
  - [ ] 27.1 Create Bybit REST client
    - Implement `fetchKline()` using Bybit V5 REST API (`/v5/market/kline`)
    - Support all intervals: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d, 1w, 1M
    - Support pagination for large historical data requests
    - Normalize Bybit response to engine `Bar` interface
    - _Requirements: 20.1, 20.3, 20.5_
  
  - [ ] 27.2 Create Bybit WebSocket client
    - Connect to `wss://stream.bybit.com/v5/public/linear`
    - Subscribe to kline topics (`kline.{interval}.{symbol}`)
    - Parse incoming kline messages and normalize to engine format
    - Handle WebSocket reconnection with exponential backoff
    - Handle Bybit heartbeat/ping-pong
    - _Requirements: 20.2, 20.6_
  
  - [ ] 27.3 Implement DataSource adapter
    - Implement engine's `DataSource` interface for `request.security()` support
    - Map Bybit symbols to engine data source identifiers
    - Handle data alignment and gap detection
    - _Requirements: 20.10_
  
  - [ ] 27.4 Implement rate limiting
    - Track Bybit API call frequency (120 req/s for public endpoints)
    - Queue excess requests and retry after delay
    - Log rate limit warnings
    - _Requirements: 20.7_
  
  - [ ] 27.5 Wire Bybit adapter into backend
    - Inject Bybit adapter into backend API handlers
    - Use Bybit data for OHLCV REST endpoint
    - Stream Bybit WebSocket data through backend WS gateway
    - _Requirements: 20.1, 20.2_
  
  - [ ] 27.6 Write tests for Bybit adapter
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

- [ ] 29. Update Frontend to Integrate with Backend
  - [ ] 29.1 Update data fetching to use Backend REST API
    - Replace mock data generation with `GET /api/ohlcv` calls
    - Pass symbol, interval, and limit parameters
    - Handle loading states and error responses
    - _Requirements: 17.1, 17.12_
  
  - [ ] 29.2 Update WebSocket connection to Backend
    - Connect to `ws://localhost:8080/ws` (Backend)
    - Send subscribe/unsubscribe messages on symbol/interval change
    - Handle incoming kline messages and update chart
    - _Requirements: 17.8, 17.12_
  
  - [ ] 29.3 Send scripts to Backend for execution
    - On editor close or Run button, POST script to `/api/execute`
    - Render returned plot data, shapes, and drawings on chart
    - Display compilation/runtime errors in error console
    - _Requirements: 17.4, 17.5, 17.6, 17.7, 17.13_
  
  - [ ] 29.4 Update symbol/timeframe controls
    - Fetch available symbols from `GET /api/symbols`
    - Populate symbol and interval dropdowns dynamically
    - _Requirements: 17.11_
  
  - [ ] 29.5 Write integration tests for frontend-backend
    - Test end-to-end flow: select symbol → load data → write script → execute → render
    - Test error display for compilation failures
    - Test realtime chart updates
    - _Requirements: 17.1, 17.4, 17.8_

- [x] 30. Final Checkpoint - Full System Validation
  - Start entire system: `pnpm dev` from root
  - Select BTCUSDT, 1m interval — verify real candles load
  - Write simple SMA indicator — verify it renders on chart
  - Test error handling with invalid Pine Script
  - Test realtime updates as new candles arrive
  - Test zoom/pan on chart
  - Verify all monorepo scripts work (build, test, lint)
  - Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability (e.g., _Requirements: 1.1, 1.2_)
- Checkpoints ensure incremental validation and prevent integration issues
- Unit tests validate specific examples and edge cases
- Integration tests verify component interactions
- TypeScript is the implementation language as selected by the user
- Tasks 23-30 implement the monorepo restructuring, backend server, Bybit integration, and frontend-backend wiring

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
    { "id": 21, "tasks": ["21.1", "21.2", "21.3", "21.4", "21.5", "21.6"] },
    { "id": 22, "tasks": ["21.7", "21.8"] },
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
    { "id": 37, "tasks": ["30"] }
  ]
}
```