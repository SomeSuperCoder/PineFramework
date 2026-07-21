# System Architecture: Pine Script v5/v6 Engine

## Overview

A Pine Script v5/v6 compatible alternative runtime that dynamically detects the declared version (`//@version=5` or `//@version=6`), parses, executes, and renders programs with TradingView-like semantics. Organized as a pnpm monorepo with three packages: engine, backend, frontend.

### Research Findings

Key insights from Pine Script v6 and TradingView architecture research:
1. **Pine Script v5 Language Features**: Mature version with well-established syntax, type system, and built-in functions; widely used by existing TradingView scripts
2. **Pine Script v6 Language Features**: Latest version includes enums, dynamic data requests, runtime logging, tighter type system, and syntax refinements over v5
3. **Version Detection**: The `//@version=N` directive at the top of a script declares the version; the engine must parse this before selecting grammar rules
4. **Execution Model**: Bar-by-bar execution with rollback capability for realtime bars
5. **Series Data Type**: Core Pine concept where each element corresponds to a historical bar
6. **Script Structure**: `//@version=6` declaration, script type (indicator/strategy/library), main code body
7. **TradingView Architecture**: Event-driven, plugin-based extensibility, realtime updates with rollback

### Design Principles

1. **SOLID Principles**: Single responsibility, open/closed, Liskov substitution, interface segregation, dependency inversion
2. **Plugin Architecture**: Extensible via plugin registry without core modifications
3. **Separation of Concerns**: Clear boundaries between parser, compiler, runtime, data engine, indicator engine, renderer, UI layer
4. **Performance Optimization**: Efficient handling of millions of candles and hundreds of concurrent indicators
5. **Modularity**: Independent development of components with well-defined interfaces

## Layer Architecture

```
Layer 1: Language Processing
  [Parser] → [Compiler] → [AST Walker]

Layer 2: Execution Engine
  [Runtime] → [Type System] → [State Management]

Layer 3: Data & Analysis
  [Data Engine] → [TA Engine] → [Request System]

Layer 4: Rendering
  [Plot Engine] → [Drawing Engine] → [Renderer] → [Chart Engine]

Layer 5: Strategy & Extensibility
  [Strategy Engine] → [Plugin Registry] → [Alert System]

Layer 6: Input & Configuration
  [Input System] → [Config] → [Color System]

Layer 7: Frontend
  [Web App] → [Code Editor] → [Canvas Chart] → [Error Console]

Layer 8: Backend & Integration
  [API Server] → [WS Gateway] → [Bybit Adapter] → [Data Cache] → [Telegram Bot]
```

## Monorepo Structure

```
pine-framework/          ← Root (engine)
├── src/                 Core engine source
│   ├── language/        Parser, compiler, type system
│   ├── runtime/         Execution engine, built-in functions
│   ├── strategy/        Strategy engine, backtest
│   └── rendering/       Plot engine, drawing engine
├── frontend/            React + Vite SPA
│   └── src/chart/       Canvas charting library (PineChart)
├── backend/             Express + WebSocket server
│   └── src/routes/      API endpoints
└── tests/               Jest test suite
```

## Key Components

### Language Processing
- **Parser**: Dynamic version detection (v5/v6), indentation-aware else-binding, all Pine constructs
- **Compiler**: Type checking, scope resolution, version-aware coercion (v5 looser, v6 stricter)
- **Type System**: Primitives (int/float/bool/string/color), series, collections (array/map), NA semantics

### Execution Engine
- Bar-by-bar execution (historical + realtime)
- Forming-candle lifecycle for live sub-bar updates
- Rollback via state snapshots on real-time errors
- Series indexing (`close[1]`) via `ohlcHistory` accumulator
- Var/varip persistence across bars

### TA Engine
- Moving averages (sma, ema, wma, hma, etc.)
- Oscillators (rsi, stoch, macd)
- Volatility (atr, bb, kc, superTrend)
- Per-call-site state isolation for multi-invocation accuracy

### Canvas Charting Library
- HTML5 Canvas + WebGL-annotated rendering for 60fps
- Renderers: Candlestick, Volume, Line, Area, Marker, Char, Arrow, HLine, BarColor, Background, DrawingLine, Box, Label, Table, Polyline, LineFill, StrategyMarker, AlertMarker, Grid, Axis, Crosshair
- CoordinateSystem for data↔pixel transforms
- Viewport with overscan, zoom/pan, autofit
- 22 rendering layers with canvas clipping per pane

### Visualization
- Non-overlay indicators in separate panes with synchronized crosshair/X-axis
- Per-bar plot/fill colors for line, stepline, histogram, columns
- Drawing objects: line, label, box, polyline, table, linefill
- plotshape, plotchar, plotarrow, plotcandle, fill, hline, barcolor, bgcolor

### Strategy Engine
- strategy.entry/exit/close/cancel with order management
- Position tracking, pyramiding, commission/slippage modeling
- Market fill price options (open, ohlc4, close, high, low)
- Performance metrics: net profit, Sharpe, sortino, drawdown, win rate

### Backend & Integration
- Express REST API + WebSocket real-time streaming
- Bybit market data (WebSocket + REST historical)
- Telegram Bot (Telegraf v4+) with SOCKS5 proxy support
- CLI backtest tool with configurable parameters

### Alert System
- alert() + alertcondition() with frequency management
- Three-layer dedup: Session timestamps → Gateway key set → Stale connection pruning
- Bar-close dispatch only (no intra-bar notification spam)
- Telegram delivery via Telegraf with MarkdownV2 formatting

## Data Flow

1. Source code → Parser → AST → Compiler → IR → Execution Engine
2. Bar data → Data Engine → TA Engine → Plot Engine → Rendering Pipeline
3. Strategy orders → Strategy Engine → Backtest metrics + Trade log
4. Frontend ↔ WebSocket ↔ Backend ↔ Bybit (market data)
5. Alert triggers → Alert System → Telegram Bot / WebSocket

## Performance Features
- Off-screen canvas double buffering
- Dirty-flag render loop (requestAnimationFrame)
- Path/state-change batching for canvas draw calls
- Viewport overscan (only render visible bars)
- Progressive computation (visible range first, then background)
- Circular buffers for TA calculations
- Cache-invalidation strategy for data requests

## Detailed Design Documents

The following design documents in `openspec/docs/design/` contain the full architectural specifications:

| Document | Content |
|----------|---------|
| `component-specifications.md` | All 20 component specs (Parser, Compiler, Type System, Engine, Plot Engine, etc.) |
| `data-flow.md` | 6 data flow diagrams with alert dedup pipeline |
| `module-boundaries.md` | 7-layer module boundary definitions |
| `execution-lifecycle.md` | 4-phase execution lifecycle |
| `rendering-architecture.md` | Visual element hierarchy, rendering pipeline, index-based positioning |
| `plugin-system.md` | Plugin interfaces, lifecycle, registry features |
| `data-storage-caching.md` | 4-layer storage architecture, caching strategies |
| `error-handling.md` | Error classification, handling strategies, recovery mechanisms |
| `testing-architecture.md` | Test strategy (unit/integration/compatibility/property-based) |
| `performance-optimization.md` | Optimization strategies, scalability design, monitoring |
| `security.md` | Plugin, data, and execution security |
| `frontend-architecture.md` | Frontend components, data flow, features |
| `monorepo-deployment.md` | Package structure, deployment, configuration, monitoring |
| `indicator-panes.md` | Non-overlay indicator pane architecture |
| `dynamic-indicators.md` | Dynamic indicator management UI, data model, rendering pipeline |
| `progressive-computation.md` | Progressive indicator computation, lookback seed mgmt, batch queue |
| `forming-candle-lifecycle.md` | FormingCandleManager module, tick/confirm lifecycle |
| `chart-interactions.md` | Viewport auto-fit, auto-scale toggle, scroll re-execution, go-to-date |
| `backtest-engine.md` | Broker simulator, orchestrator, metrics, commission methods |
| `script-bank-ai-editor.md` | Script bank, AI agent integration, file-based storage, built-in tests |
| `telegram-alerts.md` | Alert system, Telegram bot, SOCKS5 proxy, database layer |
| `cli-backtest-tool.md` | CLI backtest tool for multi-symbol strategy validation |
| `single-strategy-enforcement.md` | Single strategy per script enforcement |

## Completed Implementation Tasks

See `openspec/docs/tasks/completed-implementation.md` for the full preservation of all 144 implementation tasks, including sub-tasks, notes, and the task dependency graph.

## Conclusion

This architecture provides a comprehensive foundation for a production-grade Pine Script v5/v6 Engine that maintains compatibility with TradingView while offering extensibility, performance, and scalability. The modular design allows for independent development of components, and the plugin architecture ensures the system can evolve with new features without modifying core code.

The system prioritizes:
1. **Correctness**: TradingView-compatible semantics and numerical precision
2. **Performance**: Efficient handling of large datasets and concurrent indicators
3. **Extensibility**: Plugin-based architecture for future growth
4. **Reliability**: Robust error handling and recovery mechanisms
5. **Usability**: Clear interfaces and comprehensive testing
