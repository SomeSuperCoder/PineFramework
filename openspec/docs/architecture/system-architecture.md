# System Architecture: Pine Script v5/v6 Engine

## Overview

A Pine Script v5/v6 compatible alternative runtime that dynamically detects the declared version (`//@version=5` or `//@version=6`), parses, executes, and renders programs with TradingView-like semantics. Organized as a pnpm monorepo with three packages: engine, backend, frontend.

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
