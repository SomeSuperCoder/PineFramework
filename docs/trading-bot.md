# Live Trading Bot

The pine-framework live trading bot enables automated execution of Pine Script strategies on Solana DEXes.

> **Status**: Phase 1 MVP — state machine lifecycle, configuration, wallet management, and API endpoints are implemented. Actual exchange connectivity (Jupiter DEX, real bars, position management) is planned for Phase 2.

## Architecture

```
┌───────────────────────────────────────────┐
│              Frontend (React)              │
│  ┌──────────┐  ┌──────────────────────┐   │
│  │ Controls │  │   Live Dashboard     │   │
│  │ (Start/  │  │  (Status/Metrics/    │   │
│  │  Stop)   │  │   Logs/Positions)    │   │
│  └────┬─────┘  └──────────┬───────────┘   │
│       │                   │                │
└───────┼───────────────────┼────────────────┘
        │ REST (fetch)      │ WebSocket
        ▼                   ▼
┌───────────────────────────────────────────┐
│              Backend (Express)             │
│  ┌──────────┐  ┌──────────────────────┐   │
│  │ Bot API  │  │  Bot WS Gateway      │   │
│  │ /api/bot │  │  /ws/bot             │   │
│  └────┬─────┘  └──────────┬───────────┘   │
│       │                   │                │
│  ┌────▼───────────────────▼───────────┐   │
│  │          BotEngine                  │   │
│  │  ┌───────────┐  ┌────────────────┐ │   │
│  │  │ State     │  │  Auto-Select   │ │   │
│  │  │ Machine   │  │  (optional)    │ │   │
│  │  └───────────┘  └────────────────┘ │   │
│  │  ┌───────────┐  ┌────────────────┐ │   │
│  │  │ Wallet    │  │  Trade History │ │   │
│  │  │ Manager   │  │  Store         │ │   │
│  │  └───────────┘  └────────────────┘ │   │
│  └────────────────────────────────────┘   │
└───────────────────────────────────────────┘
```

## Features

| Feature | Status | Description |
|---------|--------|-------------|
| State Machine | ✅ | Idle → Starting → Running → Stopping → Stopped → Error |
| Bot Configuration | ✅ | Strategy source, DEX selection, pairs, risk settings |
| API Endpoints | ✅ | Start, stop, emergency stop, reset, status, configure |
| WebSocket Dashboard | ✅ | Real-time status, state change, log streaming |
| Wallet Management | ✅ | Seed phrase import, AES-256-GCM encryption, in-memory safe storage |
| Auto Market Selection | ✅ | Rank candidate pairs by Sharpe, profit factor, net profit, or win rate |
| Frontend Controls | ✅ | Start/Stop buttons, Live Dashboard (Status/Metrics/Logs) |
| Telegram Notifications | ✅ | Bot start/stop, position open/close, errors, daily loss |
| DEX Integration | 🚧 Phase 2 | Jupiter Swap and Jupiter Ultra adapters exist (mock) |
| Real Bar Feed | 🚧 Phase 2 | Bybit WebSocket bars → strategy execution |
| Position Scheduler | 🚧 Phase 2 | Symbol × Timeframe matrix with mutex serialization |
| Risk Manager | 🚧 Phase 2 | Daily stop loss tracking, emergency stop |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_TRADING_BOT` | (not set) | Set to `true` to enable bot API routes |
| `WALLET_PASSPHRASE` | `pine-default-passphrase` | Passphrase for wallet encryption |
| `PORT` | `8081` | Backend server port |

### Bot Configuration (POST /api/bot/configure)

```json
{
  "strategySource": "//@version=5\nstrategy(\"My Strategy\")\nif close > open\n  strategy.entry(\"long\", strategy.long)",
  "dex": "jupiter-swap",
  "pairs": [
    { "symbol": "BTCUSDT", "timeframe": "60" }
  ],
  "risk": {
    "maxDailyLoss": 100,
    "dailyLossTimezone": "UTC",
    "closeOnDailyLoss": false
  },
  "autoSelect": false,
  "walletPublicKey": null
}
```

## API Reference

All endpoints are mounted at `/api/bot/*` when `ENABLE_TRADING_BOT=true`.

### Lifecycle

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/bot/start` | Start the bot (Idle/Stopped → Running) |
| `POST` | `/api/bot/stop` | Graceful stop (Running → Stopped) |
| `POST` | `/api/bot/emergency-stop` | Immediate halt, close positions |
| `POST` | `/api/bot/reset` | Reset from Error to Idle |
| `GET` | `/api/bot/status` | Current snapshot (state, config, positions, errors) |
| `POST` | `/api/bot/configure` | Set strategy, DEX, pairs, risk |

### Wallet

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/bot/wallet/import` | Import wallet from seed phrase |
| `GET` | `/api/bot/wallet` | Get wallet public key |
| `DELETE` | `/api/bot/wallet` | Remove imported wallet |

### WebSocket

Connect to `ws://<host>/ws/bot` for real-time updates.

| Channel | Direction | Payload |
|---------|-----------|---------|
| `bot:snapshot` | Server → Client | Full status snapshot on connect |
| `bot:state` | Server → Client | State transition event |
| `bot:log` | Server → Client | New log entry |
| `bot:position` | Server → Client | Position opened/closed/updated |
| `bot:metrics` | Server → Client | Metrics update |

## Quick Start

```bash
# Start the backend with trading bot enabled
ENABLE_TRADING_BOT=true pnpm --filter pine-framework-backend run dev

# The API is now available at http://localhost:8081/api/bot/*
# WebSocket at ws://localhost:8081/ws/bot

# Configuration example:
curl -X POST http://localhost:8081/api/bot/configure \
  -H "Content-Type: application/json" \
  -d '{
    "strategySource": "//@version=5\nstrategy(\"demo\")\nstrategy.entry(\"long\", strategy.long, when=close > open)",
    "dex": "jupiter-swap",
    "pairs": [{"symbol": "BTCUSDT", "timeframe": "60"}],
    "risk": {"maxDailyLoss": 100, "dailyLossTimezone": "UTC"}
  }'

# Start the bot
curl -X POST http://localhost:8081/api/bot/start

# Check status
curl http://localhost:8081/api/bot/status

# Stop the bot
curl -X POST http://localhost:8081/api/bot/stop
```

## Bot States

```
        ┌──────────────────────────────────────┐
        │                                      │
        ▼                                      │
    ┌───────┐    ┌──────────┐    ┌─────────┐   │
    │ Idle  │───►│ Starting │───►│ Running │   │
    └───┬───┘    └──────────┘    └────┬────┘   │
        │                             │        │
        │                    ┌────────▼────┐   │
        │                    │  Stopping   │   │
        │                    └───────┬─────┘   │
        │                            │         │
        │                     ┌──────▼─────┐   │
        ├────────────────────►│  Stopped   │   │
        │                     └──────┬─────┘   │
        │                            │         │
        │                     ┌──────▼─────┐   │
        └────────────────────►│   Error    │   │
                              └────────────┘   │
                                     │         │
                                     └─────────┘
```

## Architecture Decisions

### 1. State Machine Pattern
The bot lifecycle is modeled as a deterministic state machine. Each state has explicit allowed transitions, preventing invalid operations (e.g., starting from Running, stopping from Idle).

### 2. Feature Flag
The trading bot is disabled by default via `ENABLE_TRADING_BOT` env var. This ensures safe rollout — the backend starts without trading capabilities unless explicitly enabled.

### 3. Lazy Initialization
Bot engine components (auto-select, wallet) are initialized on first use rather than at server startup. The feature gate controls whether the bot routes are mounted at all.

### 4. In-Memory Wallet Storage
Phase 1 uses `InMemoryWalletStorage` for simplicity. Phase 2 should use a persistent store (file-based or DB-backed) to survive restarts.

### 5. Event-Driven WebSocket
Bot engine events (`stateChange`, `error`, `configUpdate`) are emitted via a pub/sub pattern and forwarded to WebSocket clients for real-time dashboard updates.

## Project Structure

```
src/trading/
├── bot-engine.ts          # Central controller with state machine
├── state-machine.ts       # Generic state machine implementation
├── types.ts               # BotConfig, BotState, interfaces
├── index.ts               # Module exports
├── wallet/
│   ├── wallet-manager.ts  # Seed phrase import, encryption, keypair
│   └── sensitive-data.ts  # Secure memory wrapper with zero-fill
├── dex/
│   ├── dex-adapter.ts     # Abstract DEX adapter
│   ├── jupiter-swap-adapter.ts
│   ├── jupiter-ultra-adapter.ts
│   └── spot-trading.ts
├── risk/
│   ├── risk-manager.ts
│   └── shutdown-handler.ts
├── scheduler.ts
├── trade-history-store.ts
├── telegram-bot.ts
├── dashboard-ws.ts
└── auto-select.ts

backend/src/
├── routes/bot.ts          # Bot API endpoints
├── ws/bot-gateway.ts      # WebSocket gateway
├── trading/
│   └── auto-select-runner.ts  # Backend-specific selectors
└── index.ts               # Server wiring + feature flag

frontend/src/components/
├── TradingBotPanel.tsx    # useBotWebSocket, controls, dashboard
└── AppToolbar.tsx         # Toolbar integration
```

## Testing

```bash
# Run all trading tests
pnpm --filter pine-framework run test -- tests/unit/trading/

# Run integration tests
pnpm --filter pine-framework run test -- tests/integration/trading/
```
