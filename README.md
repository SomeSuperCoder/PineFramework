# pine-framework

Pine Script v6 compatible execution and rendering engine — with live trading capabilities.

## Overview

pine-framework is a TypeScript monorepo that:
- Parses, compiles, and executes Pine Script v6
- Renders indicators and strategies on HTML Canvas via React
- Supports backtesting with configurable commission models
- **Live trading bot** (Phase 1 MVP) with Solana DEX integration

## Packages

| Package | Description |
|---------|-------------|
| `pine-framework` | Core engine: parser, compiler, runtime, data engine, strategy, backtesting |
| `pine-framework-backend` | Express API server: bars, indicators, WebSocket, trading bot |
| `pine-framework-frontend` | React/Vite UI: chart, editor, bot dashboard |

## Live Trading Bot

The framework includes a live trading bot for automated strategy execution on Solana DEXes (Jupiter Swap/Ultra).

**Phase 1 features:**
- State machine lifecycle (Idle → Starting → Running → Stopping → Stopped → Error)
- REST API for bot control (start/stop/emergency-stop/configure)
- Real-time WebSocket dashboard (status, positions, logs, metrics)
- Seed phrase wallet import with AES-256-GCM encryption
- Auto market selection with configurable ranking metrics
- Frontend bot controls and live dashboard

**Enable with:** `ENABLE_TRADING_BOT=true`

See [docs/trading-bot.md](docs/trading-bot.md) for full documentation.

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Run tests
pnpm run test

# Start development servers
pnpm --filter pine-framework-backend run dev   # Backend on :8081
pnpm --filter pine-framework-frontend run dev  # Frontend on :5173
```

## License

MIT
