## Why

The pine-framework currently executes Pine Script strategies in backtest mode only. Users have no way to run their strategies live on real markets. A live trading bot turns the framework from a research tool into a fully operational trading system — enabling users to deploy Pine Script strategies against real Solana DEX markets with proper risk management, monitoring, and audit trails.

## What Changes

- New **headless trading engine** that runs independently from the UI, with a deterministic state machine (Idle → Starting → Running → Stopping → Stopped → Error)
- **Wallet management** — secure Solana seed phrase import, encrypted at-rest storage, memory wiping
- **Jupiter DEX integration** (Swap + Ultra) with pluggable architecture for future DEXs
- **Symbol × Timeframe matrix scheduler** with race-condition-free deterministic execution
- **Automatic market selection** — backtest-evaluated ranking of best-performing (symbol, timeframe) pairs
- **Risk management** — configurable daily stop loss, emergency stop (frontend + Telegram), safe shutdown
- **Graceful process termination** — SIGINT/SIGTERM handling with safe position closeout
- **Live monitoring dashboard** — real-time state, PnL, positions, exposure, streaming logs
- **Trade history persistence** — entries, exits, fees, PnL, execution traces for AI-assisted debugging
- **Extended Telegram notifications** for live trading events (positions, emergency stops, errors)
- **Frontend bottom-panel controls** — Start Bot, Stop Bot, Dashboard views

## Capabilities

### New Capabilities
- `trading-engine`: Core headless bot lifecycle, scheduler, and state machine
- `wallet-management`: Secure Solana wallet import, encrypted storage, and memory lifecycle
- `dex-integration`: Jupiter Swap/Ultra execution backend with pluggable DEX interface
- `symbol-timeframe-matrix`: Multi-pair multi-timeframe scheduling with deterministic execution guarantee
- `auto-market-selection`: Historical backtest-driven ranking and selection of best trading configurations
- `risk-management`: Daily stop loss (configurable timezone), emergency stop, safe shutdown, SIGTERM handling
- `live-dashboard`: Real-time monitoring UI with live status, metrics, PnL, positions, and streaming logs
- `trade-history`: Persistent trade records and debug-history snapshots for post-mortem analysis

### Modified Capabilities
- `telegram-notification`: Add live-trading event types (bot start/stop, position open/close, emergency stop, daily loss trigger, errors)
- `strategy-backtest-engine`: Add auto-selection mode — backtest across multiple (symbol, timeframe) pairs and return ranking for market selection
- `frontend-application`: Add trading bot bottom panel with Start, Stop, and Dashboard views; ensure UI never blocks trading engine

## Impact

- `src/` — New `trading/` module for the headless engine, state machine, scheduler, risk manager, wallet manager, and DEX abstractions
- `backend/` — New Jupiter DEX integration service; enhanced Telegram notifications; new trade-history persistence layer; WebSocket streaming for dashboard data
- `frontend/` — New dashboard components (live status, metrics, logs); bottom-panel controls; WebSocket connection for real-time updates
- `openspec/specs/` — 8 new capability specs; 3 modified specs
- Dependencies: `@solana/web3.js`, `@jup-ag/api` for Jupiter DEX integration; `bs58` or similar for key encoding
