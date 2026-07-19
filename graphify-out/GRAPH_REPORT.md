# Graph Report - .  (2026-07-19)

## Corpus Check
- 144 files · ~160,383 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1871 nodes · 4439 edges · 92 communities (71 shown, 21 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.71)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 83
- Community 84
- Community 85
- Community 86
- Community 91

## God Nodes (most connected - your core abstractions)
1. `PineValue` - 81 edges
2. `DrawingEngine` - 76 edges
3. `PineChart` - 67 edges
4. `Parser` - 63 edges
5. `ExecutionEngine` - 63 edges
6. `SourceSpan` - 57 edges
7. `LayoutManager` - 55 edges
8. `StrategyEngine` - 51 edges
9. `Viewport` - 48 edges
10. `parseColor()` - 37 edges

## Surprising Connections (you probably didn't know these)
- `Pine Script v5/v6 Engine` --uses--> `Monorepo Structure (pnpm workspaces)`  [EXTRACTED]
  package.json → pnpm-workspace.yaml
- `Requirements Document` --specifies--> `Monorepo Structure (pnpm workspaces)`  [EXTRACTED]
  requirements.md → pnpm-workspace.yaml
- `Execution Engine` --implements--> `Forming Candle Computation (Intra-bar Updates)`  [INFERRED]
  design.md → requirements.md
- `Execution Engine` --supports--> `Lazy Loading of Historical Data`  [INFERRED]
  design.md → requirements.md
- `Execution Engine` --implements--> `Real-Time Indicator Re-Execution`  [INFERRED]
  design.md → requirements.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Language Processing Layer (Layer 1)** — parser_component, compiler_component, type_system [EXTRACTED 1.00]
- **Execution Engine Layer (Layer 2)** — execution_engine [EXTRACTED 1.00]
- **Data & Analysis Layer (Layer 3)** — data_engine, ta_engine, request_system [EXTRACTED 1.00]
- **Rendering Layer (Layer 4)** — plot_engine, drawing_engine, canvas_charting_library [EXTRACTED 1.00]
- **Strategy & Extensibility Layer (Layer 5)** — strategy_engine, plugin_registry, alert_system [EXTRACTED 1.00]
- **Input & Configuration Layer (Layer 6)** — input_system, color_system, script_declaration_system [EXTRACTED 1.00]
- **Frontend Layer (Layer 7)** — frontend_web_app [EXTRACTED 1.00]
- **Backend & Integration Layer (Layer 8)** — backend_api_server, bybit_adapter, telegram_bot [EXTRACTED 1.00]
- **Monorepo Packages** — pine_framework, frontend_package, backend_package [EXTRACTED 1.00]
- **Core Engine Components** — parser_component, compiler_component, type_system, execution_engine, data_engine, ta_engine, request_system, plot_engine, drawing_engine, canvas_charting_library, strategy_engine, plugin_registry, alert_system, input_system, color_system, script_declaration_system [INFERRED 0.85]
- **Real-Time Execution Pipeline** — execution_engine, backend_api_server, websocket_streaming, frontend_web_app, canvas_charting_library, bybit_adapter [INFERRED 0.95]

## Communities (92 total, 21 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (29): ExecutionContext, ExecutionEngine, ExecutionSnapshot, FormingCandleResult, cloneRuntimeScope(), createRuntimeScope(), declareVariable(), getVariableValue() (+21 more)

### Community 1 - "Community 1"
Cohesion: 0.17
Nodes (6): spanBetween(), ArgumentNode, ExpressionNode, Parser, Token, TokenType

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (28): createDataSourcePlugin(), createFunctionPlugin(), createRendererPlugin(), createTypePlugin(), PluginManager, DEFAULT_REGISTRY_CONFIG, PluginDependency, PluginEntry (+20 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (3): DrawingEngine, generateDrawingId(), isNaOrNull()

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (46): AlertBarData, AlertCondition, AlertConfig, AlertDestination, AlertEvent, AlertFrequency, DEFAULT_ALERT_CONFIG, resetAlertIdCounter() (+38 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (50): Alert System, Backend API Server, Strategy Backtest Engine, Bar-by-Bar Execution Model, Broker Simulator, Bybit Exchange Adapter, Canvas Charting Library (PineChart), HTML5 Canvas Rendering (+42 more)

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (45): SourceSpan, ArrayExpressionNode, AssignmentNode, BinaryExpressionNode, BooleanLiteralNode, BreakStatementNode, CallExpressionNode, ColorLiteralNode (+37 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (3): BacktestEngine, generateOrderId(), StrategyEngine

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (27): PineColor, LinefillObject, PlotEngine, PlotOutput, resetPlotIdCounter(), ArrowDescriptor, ArrowStyle, BarcolorDescriptor (+19 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (31): main(), parseArgs(), printUsage(), validateOptions(), buildConfig(), runMultiSymbolBacktest(), padRight(), printSummaryTable() (+23 more)

### Community 11 - "Community 11"
Cohesion: 0.11
Nodes (3): LayoutManager, AxisRenderer, MarkerRenderer

### Community 12 - "Community 12"
Cohesion: 0.10
Nodes (4): Bar, CacheEntry, DataEngine, RequestSystem

### Community 13 - "Community 13"
Cohesion: 0.15
Nodes (22): LayoutRegions, PriceRange, ChartEventCallbacks, createChart(), PlotSeriesHandle, AreaRenderer, CandlestickRenderer, GridRenderer (+14 more)

### Community 14 - "Community 14"
Cohesion: 0.07
Nodes (26): app, cache, DATA_DIR, __dirname, INDICATORS_JSON_PATH, indicatorsStore, manifestStore, PORT (+18 more)

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (20): compile(), Compiler, CompiledScript, CompileResult, createIRBuilder(), createScope(), declareVariable(), IRBuilder (+12 more)

### Community 16 - "Community 16"
Cohesion: 0.06
Nodes (13): IRFunction, IRGlobal, CoercionResult, withSeries(), AnyType, ArrayType, MapType, NaType (+5 more)

### Community 17 - "Community 17"
Cohesion: 0.13
Nodes (8): migrateLegacyScripts(), detectScriptType(), ScriptEntry, ScriptFileManager, computeChecksum(), ScriptsManifestStore, sanitizeFilename(), uniqueFilename()

### Community 18 - "Community 18"
Cohesion: 0.08
Nodes (10): DEFAULT_TELEGRAM_DATA, ProxyConfig, TelegramConfigStore, TelegramData, TelegramSettings, TelegramSubscriber, validateTelegramData(), createSocksAgent() (+2 more)

### Community 19 - "Community 19"
Cohesion: 0.09
Nodes (25): ErrorConsole(), ErrorConsoleProps, buildScriptResult(), COLORS, ExecuteResponse, ExecutionResultMessage, NOTE: ohlcvDataRef.current is NOT updated here., useChartData() (+17 more)

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (22): BoxObject, DEFAULT_LIMITS, DrawingLimits, DrawingOutput, LabelObject, LineObject, LinePoint, PolylineObject (+14 more)

### Community 21 - "Community 21"
Cohesion: 0.07
Nodes (27): ES2022, tests/**/*, compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules (+19 more)

### Community 22 - "Community 22"
Cohesion: 0.15
Nodes (21): addColors(), blendColors(), clamp(), colorEquals(), ColorInput, colorToGrayscale(), colorToHex(), colorToNumber() (+13 more)

### Community 23 - "Community 23"
Cohesion: 0.22
Nodes (6): PaneRegion, LineRenderer, CandlestickData, PlotSeriesData, Viewport, ChartComponentProps

### Community 24 - "Community 24"
Cohesion: 0.13
Nodes (23): coerce(), coerceBinaryOperands(), coerceToBool(), coerceToColor(), coerceToFloat(), coerceToInt(), coerceToString(), getCommonType() (+15 more)

### Community 25 - "Community 25"
Cohesion: 0.12
Nodes (15): endOfDayMsk(), formatAxisLabel(), formatDate(), formatDateTime(), formatTime(), formatTooltipDateTime(), fromSeconds(), getMskComponents() (+7 more)

### Community 27 - "Community 27"
Cohesion: 0.12
Nodes (17): highest(), lowest(), median(), percentile(), quantile(), stdev(), taAverage(), taMax() (+9 more)

### Community 28 - "Community 28"
Cohesion: 0.17
Nodes (15): backtestStrategy(), barsToContexts(), areTimeframesCompatible(), BarData, createBar(), parseTimeframe(), Timeframe, timeframeToMinutes() (+7 more)

### Community 30 - "Community 30"
Cohesion: 0.12
Nodes (19): CloseEntriesRule, CommissionType, DefaultQtyType, IndicatorConfig, LibraryConfig, parseIndicatorDeclaration(), parseLibraryDeclaration(), parseStrategyDeclaration() (+11 more)

### Community 31 - "Community 31"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+14 more)

### Community 32 - "Community 32"
Cohesion: 0.13
Nodes (7): mathFunctions, movingAverages, oscillators, TAEngine, TAFunction, TAFunctionInfo, TARegistry

### Community 34 - "Community 34"
Cohesion: 0.10
Nodes (21): concurrently, eslint, jest, devDependencies, concurrently, eslint, jest, prettier (+13 more)

### Community 35 - "Community 35"
Cohesion: 0.10
Nodes (21): devDependencies, jsdom, @testing-library/jest-dom, @testing-library/react, @testing-library/user-event, @types/react, @types/react-dom, typescript (+13 more)

### Community 36 - "Community 36"
Cohesion: 0.15
Nodes (17): BacktestSettingsPopup(), BARS_PER_DAY, buildConfig(), COMMISSION_METHODS, DateRangeMode, defaultConfig, estimateBars(), getDefaultMethodSettings() (+9 more)

### Community 37 - "Community 37"
Cohesion: 0.25
Nodes (16): ConfigChangeListener, ConfigSection, AnyInputDefinition, BoolInputDefinition, ColorInputDefinition, FloatInputDefinition, InputDefinition, InputState (+8 more)

### Community 39 - "Community 39"
Cohesion: 0.16
Nodes (7): createIndicatorsRouter(), createScriptsRouter(), DEFAULT_DATA, RunningIndicator, RunningIndicatorsData, RunningIndicatorsStore, validate()

### Community 40 - "Community 40"
Cohesion: 0.22
Nodes (6): FormingCandleManager, pineValueToJSON(), ScriptOutputs, ScriptSession, ClientSubscription, createWSGateway()

### Community 41 - "Community 41"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, module, moduleResolution, outDir, rootDir, sourceMap (+9 more)

### Community 43 - "Community 43"
Cohesion: 0.12
Nodes (17): dependencies, chokidar, cors, express, pine-framework, proper-lockfile, socks-proxy-agent, telegraf (+9 more)

### Community 44 - "Community 44"
Cohesion: 0.17
Nodes (6): CacheEntry, OHLCVCache, createBarsRouter(), VALID_INTERVALS, createOHLCVRouter(), VALID_INTERVALS

### Community 45 - "Community 45"
Cohesion: 0.17
Nodes (9): CompileError, ParseError, PineError, TypeError, createLocation(), parse(), ParseResult, extractVersion() (+1 more)

### Community 46 - "Community 46"
Cohesion: 0.19
Nodes (6): JsonStore, JsonStoreOptions, DEFAULT_MANIFEST, FileScriptEntry, ScriptsManifest, validateManifest()

### Community 47 - "Community 47"
Cohesion: 0.17
Nodes (11): App(), INTERVALS, SYMBOLS, ChartComponent, ChartComponentHandle, GoToDatePopup(), GoToDatePopupProps, StrategyConflictDialog() (+3 more)

### Community 48 - "Community 48"
Cohesion: 0.13
Nodes (15): devDependencies, tsx, @types/cors, @types/express, @types/node, @types/proper-lockfile, @types/ws, typescript (+7 more)

### Community 49 - "Community 49"
Cohesion: 0.13
Nodes (15): scripts, backtest, build, build:lib, clean, dev, format, format:check (+7 more)

### Community 50 - "Community 50"
Cohesion: 0.20
Nodes (7): rma(), adx(), atr(), macd(), rsi(), stoch(), stochRsi()

### Community 51 - "Community 51"
Cohesion: 0.26
Nodes (12): fetchAlertPreference(), fetchProxyConfig(), fetchTelegramConfig(), saveBotToken(), saveProxyConfig(), sendTestMessage(), setAlertPreference(), TelegramConfigPanel() (+4 more)

### Community 52 - "Community 52"
Cohesion: 0.15
Nodes (12): description, engines, node, files, dist, license, main, name (+4 more)

### Community 55 - "Community 55"
Cohesion: 0.27
Nodes (9): BacktestPanel(), BacktestPanelProps, defaultConfig, BacktestSettingsPopupProps, useBacktest(), BacktestConfig, BacktestJobResponse, extractStrategyParams() (+1 more)

### Community 56 - "Community 56"
Cohesion: 0.30
Nodes (9): BacktestResults(), BacktestResultsProps, StrategyResultsPopup(), StrategyResultsPopupProps, MOCK_METRICS, MOCK_RESULT, MOCK_TRADES, BacktestResultResponse (+1 more)

### Community 57 - "Community 57"
Cohesion: 0.17
Nodes (6): CommissionCalculator, JupiterManualCalculator, JupiterUltraCalculator, NoneCalculator, PercentFixedCalculator, PerOrderFixedCalculator

### Community 58 - "Community 58"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, exclude, extends, include, **/*.spec.ts, src/**/* (+2 more)

### Community 59 - "Community 59"
Cohesion: 0.24
Nodes (8): BuiltInScript, CodeEditor(), CodeEditorProps, extractName(), extractVersion(), ScriptEntry, mockScripts, QueueItem

### Community 60 - "Community 60"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, exclude, extends, include, **/*.spec.ts, src/**/* (+2 more)

### Community 61 - "Community 61"
Cohesion: 0.22
Nodes (7): BuiltInScript, MergedScript, QuickAdderPopup(), QuickAdderPopupProps, ScriptEntry, mockBuiltInScripts, mockScripts

### Community 64 - "Community 64"
Cohesion: 0.22
Nodes (3): BacktestJob, createBacktestRouter(), JobStatus

### Community 65 - "Community 65"
Cohesion: 0.22
Nodes (8): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include, vite.config.ts

### Community 66 - "Community 66"
Cohesion: 0.31
Nodes (5): dema(), ema(), hma(), tema(), wma()

### Community 67 - "Community 67"
Cohesion: 0.36
Nodes (5): CacheEntry, LRUCacheOptions, PoolOptions, ProfileEntry, ProfileStats

### Community 68 - "Community 68"
Cohesion: 0.29
Nodes (7): scripts, backtest, build, cli:build, dev, start, typecheck

### Community 69 - "Community 69"
Cohesion: 0.29
Nodes (5): name, type, version, Monorepo Structure (pnpm workspaces), Pine Script v5/v6 Engine

### Community 70 - "Community 70"
Cohesion: 0.29
Nodes (7): dependencies, pine-framework, react, react-dom, pine-framework, react, react-dom

### Community 71 - "Community 71"
Cohesion: 0.29
Nodes (7): scripts, build, dev, preview, test, test:watch, typecheck

### Community 76 - "Community 76"
Cohesion: 0.33
Nodes (5): bin, pine-backtest, name, type, version

### Community 78 - "Community 78"
Cohesion: 0.40
Nodes (5): exports, ./utils/time, import, source, types

### Community 79 - "Community 79"
Cohesion: 0.40
Nodes (5): keywords, backtesting, pine-script, technical-analysis, tradingview

### Community 83 - "Community 83"
Cohesion: 0.50
Nodes (3): plugin, $schema, .opencode/plugins/graphify.js

## Knowledge Gaps
- **297 isolated node(s):** `$schema`, `.opencode/plugins/graphify.js`, `name`, `version`, `type` (+292 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CodeEditor()` connect `Community 59` to `Community 54`, `Community 47`?**
  _High betweenness centrality (0.217) - this node is a cross-community bridge._
- **Why does `Profiler` connect `Community 54` to `Community 67`?**
  _High betweenness centrality (0.200) - this node is a cross-community bridge._
- **Why does `PluginRegistry` connect `Community 2` to `Community 28`, `Community 53`, `Community 44`?**
  _High betweenness centrality (0.158) - this node is a cross-community bridge._
- **What connects `$schema`, `.opencode/plugins/graphify.js`, `name` to the rest of the system?**
  _297 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06262626262626263 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06586538461538462 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.04949874686716792 - nodes in this community are weakly interconnected._