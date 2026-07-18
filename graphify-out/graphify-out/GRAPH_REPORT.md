# Graph Report - /home/allen/Projects/pine-framework/graphify-out  (2026-07-18)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1816 nodes · 4315 edges · 89 communities (65 shown, 24 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.65)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `79ff2331`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.ts
- index.ts
- Parser
- execution-engine.ts
- dependencies
- PineChart
- DrawingEngine
- index.ts
- ScriptsManifestStore
- PineChart.ts
- Viewport
- devDependencies
- backtest-cli.ts
- index.ts
- parseColor
- index.ts
- drawing-engine.ts
- PineValue
- TelegramConfigStore
- StrategyEngine
- index.ts
- compilerOptions
- index.ts
- commission-calculator.ts
- time.ts
- InteractionHandler
- math-functions.ts
- InputSystem
- script-declarations.ts
- compilerOptions
- index.ts
- Tokenizer
- devDependencies
- compiler.ts
- isNa
- LayoutManager
- BacktestSettingsPopup.tsx
- index.ts
- .run
- ConfigManager
- RunningIndicatorsStore
- gateway.ts
- compilerOptions
- AlertSystem
- OHLCVCache
- coercion.ts
- App.tsx
- oscillators.ts
- pine-types.ts
- scripts
- tokenizer.ts
- StatementNode
- PineType
- backtest-flow.test.tsx
- TelegramConfigPanel.tsx
- package.json
- Profiler
- tsconfig.build.json
- BacktestPanel.tsx
- CodeEditor.tsx
- tsconfig.build.json
- JsonStore
- QuickAdderPopup.tsx
- LRUCache
- RateLimiter
- backtest.ts
- compilerOptions
- moving-averages.ts
- index.ts
- .render
- TimeSeriesCache
- ObjectPool
- ExecutionProfiler
- .constructor
- MapPool
- ./utils/time
- keywords
- SeriesPool
- scriptType.ts
- opencode.json
- .equals
- eslint-config-prettier
- @typescript-eslint/eslint-plugin

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
- `barsToContexts()` --calls--> `createSeries()`  [EXTRACTED]
  ../src/api.ts → ../src/language/runtime/series.ts
- `IRInstruction` --references--> `SourceSpan`  [EXTRACTED]
  ../src/language/compiler/ir.ts → ../src/common/source-location.ts
- `barsToContext()` --calls--> `createSeries()`  [EXTRACTED]
  ../src/index.ts → ../src/language/runtime/series.ts
- `ClientSubscription` --references--> `ScriptSession`  [EXTRACTED]
  ../backend/src/ws/gateway.ts → ../backend/src/session/ScriptSession.ts
- `RunningIndicatorsStore` --references--> `JsonStore`  [EXTRACTED]
  ../backend/src/store/RunningIndicatorsStore.ts → ../backend/src/store/JsonStore.ts

## Import Cycles
- None detected.

## Communities (89 total, 24 thin omitted)

### Community 0 - "index.ts"
Cohesion: 0.06
Nodes (23): barsToContexts(), PineScriptEngine, areTimeframesCompatible(), Bar, BarData, createBar(), parseTimeframe(), Timeframe (+15 more)

### Community 1 - "index.ts"
Cohesion: 0.07
Nodes (28): createDataSourcePlugin(), createFunctionPlugin(), createRendererPlugin(), createTypePlugin(), PluginManager, DEFAULT_REGISTRY_CONFIG, PluginDependency, PluginEntry (+20 more)

### Community 2 - "Parser"
Cohesion: 0.17
Nodes (5): spanBetween(), ExpressionNode, Parser, Token, TokenType

### Community 3 - "execution-engine.ts"
Cohesion: 0.12
Nodes (48): SourceSpan, ArgumentNode, ArrayExpressionNode, AssignmentNode, BinaryExpressionNode, BooleanLiteralNode, BreakStatementNode, CallExpressionNode (+40 more)

### Community 4 - "dependencies"
Cohesion: 0.04
Nodes (44): chokidar, cors, express, bin, pine-backtest, dependencies, chokidar, cors (+36 more)

### Community 7 - "index.ts"
Cohesion: 0.13
Nodes (29): PineColor, LinefillObject, TableObject, PlotEngine, PlotOutput, resetPlotIdCounter(), ArrowDescriptor, ArrowStyle (+21 more)

### Community 8 - "ScriptsManifestStore"
Cohesion: 0.11
Nodes (12): migrateLegacyScripts(), detectScriptType(), ScriptEntry, ScriptFileManager, computeChecksum(), DEFAULT_MANIFEST, FileScriptEntry, ScriptsManifest (+4 more)

### Community 9 - "PineChart.ts"
Cohesion: 0.14
Nodes (24): LayoutRegions, PaneRegion, PriceRange, ChartEventCallbacks, createChart(), PlotSeriesHandle, AreaRenderer, CandlestickRenderer (+16 more)

### Community 10 - "Viewport"
Cohesion: 0.17
Nodes (5): LineRenderer, MarkerRenderer, CandlestickData, PlotSeriesData, Viewport

### Community 11 - "devDependencies"
Cohesion: 0.05
Nodes (38): dependencies, pine-framework, react, react-dom, devDependencies, jsdom, @testing-library/jest-dom, @testing-library/react (+30 more)

### Community 12 - "backtest-cli.ts"
Cohesion: 0.12
Nodes (31): main(), parseArgs(), printUsage(), validateOptions(), buildConfig(), runMultiSymbolBacktest(), padRight(), printSummaryTable() (+23 more)

### Community 13 - "index.ts"
Cohesion: 0.12
Nodes (32): AlertBarData, AlertCondition, AlertConfig, AlertDestination, AlertEvent, AlertFrequency, DEFAULT_ALERT_CONFIG, resetAlertIdCounter() (+24 more)

### Community 14 - "parseColor"
Cohesion: 0.12
Nodes (22): addColors(), blendColors(), clamp(), colorEquals(), ColorInput, colorToGrayscale(), colorToHex(), colorToNumber() (+14 more)

### Community 15 - "index.ts"
Cohesion: 0.07
Nodes (26): app, cache, DATA_DIR, __dirname, INDICATORS_JSON_PATH, indicatorsStore, manifestStore, PORT (+18 more)

### Community 16 - "drawing-engine.ts"
Cohesion: 0.09
Nodes (20): BoxObject, DEFAULT_LIMITS, DrawingLimits, DrawingOutput, LabelObject, LineObject, LinePoint, PolylineObject (+12 more)

### Community 17 - "PineValue"
Cohesion: 0.22
Nodes (4): ExecutionEngine, RuntimeScope, pineTruthy(), PineValue

### Community 18 - "TelegramConfigStore"
Cohesion: 0.08
Nodes (10): DEFAULT_TELEGRAM_DATA, ProxyConfig, TelegramConfigStore, TelegramData, TelegramSettings, TelegramSubscriber, validateTelegramData(), createSocksAgent() (+2 more)

### Community 20 - "index.ts"
Cohesion: 0.09
Nodes (25): ErrorConsole(), ErrorConsoleProps, buildScriptResult(), COLORS, ExecuteResponse, ExecutionResultMessage, NOTE: ohlcvDataRef.current is NOT updated here., useChartData() (+17 more)

### Community 21 - "compilerOptions"
Cohesion: 0.07
Nodes (27): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, lib, module (+19 more)

### Community 22 - "index.ts"
Cohesion: 0.15
Nodes (15): ExecutionContext, ExecutionSnapshot, FormingCandleResult, cloneRuntimeScope(), createRuntimeScope(), declareVariable(), getVariableValue(), pushBarValues() (+7 more)

### Community 23 - "commission-calculator.ts"
Cohesion: 0.10
Nodes (20): buildTradeContextFromTrade(), CALCULATORS, CommissionCalculator, CommissionMethodDescriptor, computeCommission(), DESCRIPTOR_MAP, getAllCommissionMethodDescriptors(), getCommissionMethodDescriptor() (+12 more)

### Community 24 - "time.ts"
Cohesion: 0.12
Nodes (15): endOfDayMsk(), formatAxisLabel(), formatDate(), formatDateTime(), formatTime(), formatTooltipDateTime(), fromSeconds(), getMskComponents() (+7 more)

### Community 26 - "math-functions.ts"
Cohesion: 0.12
Nodes (17): highest(), lowest(), median(), percentile(), quantile(), stdev(), taAverage(), taMax() (+9 more)

### Community 28 - "script-declarations.ts"
Cohesion: 0.12
Nodes (19): CloseEntriesRule, CommissionType, DefaultQtyType, IndicatorConfig, LibraryConfig, parseIndicatorDeclaration(), parseLibraryDeclaration(), parseStrategyDeclaration() (+11 more)

### Community 29 - "compilerOptions"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+14 more)

### Community 30 - "index.ts"
Cohesion: 0.13
Nodes (7): mathFunctions, movingAverages, oscillators, TAEngine, TAFunction, TAFunctionInfo, TARegistry

### Community 32 - "devDependencies"
Cohesion: 0.10
Nodes (21): concurrently, eslint, eslint-plugin-prettier, devDependencies, concurrently, eslint, eslint-plugin-prettier, jest (+13 more)

### Community 33 - "compiler.ts"
Cohesion: 0.15
Nodes (16): Compiler, CompiledScript, CompileResult, createIRBuilder(), createScope(), IRBuilder, IRInstruction, IROpCode (+8 more)

### Community 34 - "isNa"
Cohesion: 0.16
Nodes (8): isNa(), isValidNumber(), NA, naOr(), propagateNa(), ChartPointFactory, pineTruthy(), ChartPoint

### Community 36 - "BacktestSettingsPopup.tsx"
Cohesion: 0.15
Nodes (17): BacktestSettingsPopup(), BARS_PER_DAY, buildConfig(), COMMISSION_METHODS, DateRangeMode, defaultConfig, estimateBars(), getDefaultMethodSettings() (+9 more)

### Community 37 - "index.ts"
Cohesion: 0.25
Nodes (16): ConfigChangeListener, ConfigSection, AnyInputDefinition, BoolInputDefinition, ColorInputDefinition, FloatInputDefinition, InputDefinition, InputState (+8 more)

### Community 40 - "RunningIndicatorsStore"
Cohesion: 0.16
Nodes (7): createIndicatorsRouter(), createScriptsRouter(), DEFAULT_DATA, RunningIndicator, RunningIndicatorsData, RunningIndicatorsStore, validate()

### Community 41 - "gateway.ts"
Cohesion: 0.22
Nodes (6): FormingCandleManager, pineValueToJSON(), ScriptOutputs, ScriptSession, ClientSubscription, createWSGateway()

### Community 42 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, module, moduleResolution, outDir, rootDir, sourceMap (+9 more)

### Community 44 - "OHLCVCache"
Cohesion: 0.17
Nodes (6): CacheEntry, OHLCVCache, createBarsRouter(), VALID_INTERVALS, createOHLCVRouter(), VALID_INTERVALS

### Community 45 - "coercion.ts"
Cohesion: 0.27
Nodes (11): coerce(), coerceBinaryOperands(), coerceToBool(), coerceToColor(), coerceToFloat(), coerceToInt(), coerceToString(), getCommonType() (+3 more)

### Community 46 - "App.tsx"
Cohesion: 0.17
Nodes (11): App(), INTERVALS, SYMBOLS, ChartComponent, ChartComponentHandle, GoToDatePopup(), GoToDatePopupProps, StrategyConflictDialog() (+3 more)

### Community 47 - "oscillators.ts"
Cohesion: 0.20
Nodes (7): rma(), adx(), atr(), macd(), rsi(), stoch(), stochRsi()

### Community 48 - "pine-types.ts"
Cohesion: 0.13
Nodes (8): COLOR_TYPE, INT_TYPE, NaType, PinePrimitiveKind, PineTypeKind, PrimitiveType, STRING_TYPE, VOID_TYPE

### Community 49 - "scripts"
Cohesion: 0.13
Nodes (15): scripts, backtest, build, build:lib, clean, dev, format, format:check (+7 more)

### Community 50 - "tokenizer.ts"
Cohesion: 0.21
Nodes (7): CompileError, ParseError, PineError, TypeError, createLocation(), extractVersion(), KEYWORDS

### Community 51 - "StatementNode"
Cohesion: 0.27
Nodes (8): declareVariable(), resolveVariable(), StatementNode, isAssignable(), arrayOf(), mapOf(), seriesOf(), typeFromAnnotation()

### Community 52 - "PineType"
Cohesion: 0.14
Nodes (7): IRFunction, IRGlobal, CoercionResult, AnyType, PineType, UserType, VoidType

### Community 53 - "backtest-flow.test.tsx"
Cohesion: 0.27
Nodes (10): BacktestPanelProps, BacktestResults(), BacktestResultsProps, StrategyResultsPopup(), StrategyResultsPopupProps, MOCK_METRICS, MOCK_RESULT, MOCK_TRADES (+2 more)

### Community 54 - "TelegramConfigPanel.tsx"
Cohesion: 0.26
Nodes (12): fetchAlertPreference(), fetchProxyConfig(), fetchTelegramConfig(), saveBotToken(), saveProxyConfig(), sendTestMessage(), setAlertPreference(), TelegramConfigPanel() (+4 more)

### Community 55 - "package.json"
Cohesion: 0.15
Nodes (12): description, engines, node, files, dist, license, main, name (+4 more)

### Community 57 - "tsconfig.build.json"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, exclude, extends, include, **/*.spec.ts, src/**/* (+2 more)

### Community 58 - "BacktestPanel.tsx"
Cohesion: 0.31
Nodes (8): BacktestPanel(), defaultConfig, BacktestSettingsPopupProps, useBacktest(), BacktestConfig, BacktestJobResponse, extractStrategyParams(), parseNamedArgs()

### Community 59 - "CodeEditor.tsx"
Cohesion: 0.24
Nodes (8): BuiltInScript, CodeEditor(), CodeEditorProps, extractName(), extractVersion(), ScriptEntry, mockScripts, QueueItem

### Community 60 - "tsconfig.build.json"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, exclude, extends, include, **/*.spec.ts, src/**/* (+2 more)

### Community 63 - "QuickAdderPopup.tsx"
Cohesion: 0.22
Nodes (7): BuiltInScript, MergedScript, QuickAdderPopup(), QuickAdderPopupProps, ScriptEntry, mockBuiltInScripts, mockScripts

### Community 66 - "backtest.ts"
Cohesion: 0.22
Nodes (3): BacktestJob, createBacktestRouter(), JobStatus

### Community 67 - "compilerOptions"
Cohesion: 0.22
Nodes (8): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include, vite.config.ts

### Community 68 - "moving-averages.ts"
Cohesion: 0.31
Nodes (5): dema(), ema(), hma(), tema(), wma()

### Community 69 - "index.ts"
Cohesion: 0.36
Nodes (5): CacheEntry, LRUCacheOptions, PoolOptions, ProfileEntry, ProfileStats

### Community 76 - "./utils/time"
Cohesion: 0.40
Nodes (5): exports, ./utils/time, import, source, types

### Community 77 - "keywords"
Cohesion: 0.40
Nodes (5): keywords, backtesting, pine-script, technical-analysis, tradingview

### Community 81 - "opencode.json"
Cohesion: 0.50
Nodes (3): plugin, $schema, .opencode/plugins/graphify.js

### Community 82 - ".equals"
Cohesion: 0.14
Nodes (4): withSeries(), ArrayType, MapType, SeriesType

## Knowledge Gaps
- **287 isolated node(s):** `$schema`, `.opencode/plugins/graphify.js`, `name`, `version`, `type` (+282 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CodeEditor()` connect `CodeEditor.tsx` to `Profiler`, `App.tsx`?**
  _High betweenness centrality (0.225) - this node is a cross-community bridge._
- **Why does `Profiler` connect `Profiler` to `index.ts`?**
  _High betweenness centrality (0.207) - this node is a cross-community bridge._
- **Why does `PluginRegistry` connect `index.ts` to `index.ts`, `OHLCVCache`?**
  _High betweenness centrality (0.164) - this node is a cross-community bridge._
- **What connects `$schema`, `.opencode/plugins/graphify.js`, `name` to the rest of the system?**
  _287 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.056329113924050635 - nodes in this community are weakly interconnected._
- **Should `index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06586538461538462 - nodes in this community are weakly interconnected._
- **Should `execution-engine.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11686274509803922 - nodes in this community are weakly interconnected._