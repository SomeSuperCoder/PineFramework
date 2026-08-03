## Why

The trading bot currently exists as a Phase 1 MVP — a state machine shell with API endpoints, wallet management, and frontend controls, but **no actual execution engine**. When started, the bot enters "Running" state but does nothing: no bars are fetched, no strategy is compiled, no trades are executed. This change implements the critical missing pieces to make the bot actually trade on Solana DEXes via Jupiter.

## What Changes

- **Real Bar Feed**: Connect to Bybit WebSocket for live OHLCV data, replacing the placeholder bar source
- **Strategy Compilation**: Load and execute Pine Script strategies in live mode, generating trade signals from real market data
- **Jupiter DEX Integration**: Complete the swap adapter to sign and submit Solana transactions via `@solana/web3.js`
- **Wallet Balance Reading**: Query real SOL and token balances from Solana RPC
- **Position Scheduler**: Manage Symbol × Timeframe pairs with mutex-serialized execution
- **Risk Manager**: Track daily P&L and enforce stop-loss limits with emergency stop capability

## Capabilities

### New Capabilities
- `live-bar-feed`: Bybit WebSocket integration for real-time OHLCV data streaming
- `live-strategy-execution`: Pine Script strategy compilation and execution in live trading mode
- `jupiter-swap-execution`: Real Solana transaction signing and submission via Jupiter API
- `solana-wallet-integration`: Balance reading and transaction signing with `@solana/web3.js`
- `position-scheduler`: Symbol × Timeframe pair management with deterministic execution
- `risk-management`: Daily loss tracking, rolling limits, and emergency stop triggers

### Modified Capabilities
- `bot-start-lifecycle`: Remove Phase 2 placeholders, connect real components during initialization
- `strategy-execution`: Bridge strategy signals to live trade execution (backtest → live mode)

## Impact

- **Dependencies**: Add `@solana/web3.js` for Solana transaction handling
- **Backend**: `src/trading/` — complete DEX adapters, add bar feed service, wire scheduler
- **API**: No new endpoints; existing `/api/bot/start` now triggers real execution
- **Risk**: Real funds at stake — requires thorough testing on devnet before mainnet
- **Infrastructure**: Solana RPC endpoint required (mainnet or devnet)
