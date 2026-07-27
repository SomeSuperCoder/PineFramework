## 1. Core Engine — State Machine & Bot Lifecycle

- [x] 1.1 Create `src/trading/` module directory structure with `state-machine.ts`, `bot-engine.ts`, `types.ts`, `index.ts`
- [x] 1.2 Implement generic `StateMachine<T>` class with typed states, transition guards, and event hooks (Design: Decision 2; Spec: trading-engine)
- [x] 1.3 Define bot state enum (`Idle`, `Starting`, `Running`, `Stopping`, `Stopped`, `Error`) with all valid transitions (Design: Decision 2)
- [x] 1.4 Implement `BotEngine` class that owns the state machine, manages initialization sequence, and provides `start()`, `stop()`, `emergencyStop()`, `reset()` methods (Spec: trading-engine)
- [x] 1.5 Implement state transition logging with timestamps, from/to states, and reason (Spec: trading-engine — Scenario: State transitions are logged)
- [x] 1.6 Add unit tests for `StateMachine<T>` covering all transitions and invalid transitions
- [x] 1.7 Add unit tests for `BotEngine` lifecycle (Idle → Starting → Running → Stopping → Stopped)

## 2. Wallet Management

- [x] 2.1 Implement `SensitiveData<T>` wrapper class with secure buffer handling, zero-fill `dispose()`, and serialization protection (Design: Decision 5; Spec: wallet-management)
- [x] 2.2 Implement seed phrase validation (BIP39 mnemonic check, 12/24 word support) (Spec: wallet-management)
- [x] 2.3 Implement Solana keypair derivation from seed phrase using SHA-256 (Spec: wallet-management)
- [x] 2.4 Implement AES-256-GCM encryption/decryption for wallet storage using Node.js `crypto` module (Design: Decision 5)
- [x] 2.5 Implement `WalletManager` class with import, decrypt-for-use, wipe-after-use lifecycle (Spec: wallet-management)
- [x] 2.6 Add wallet replacement confirmation flow (Spec: wallet-management — Requirement: Wallet Replacement Confirmation)
- [x] 2.7 Verify no wallet secrets appear in logs, errors, or debug output via audit (Spec: wallet-management — Requirement: Never Log Wallet Secrets)
- [x] 2.8 Add unit tests for wallet import, encryption round-trip, memory wiping, and replacement guard

## 3. DEX Integration & Pluggable Adapter

- [x] 3.1 Define `DexAdapter` abstract class with `quote()`, `swap()`, `getBalance()`, `getTransactionStatus()` methods (Design: Decision 3; Spec: dex-integration)
- [x] 3.2 Define `CommissionModel` interface and implement fee calculation structure (Spec: dex-integration — Requirement: Commission Models Per DEX)
- [x] 3.3 Implement `JupiterSwapAdapter` — quote, swap execution via Jupiter Swap API (Spec: dex-integration)
- [x] 3.4 Implement `JupiterUltraAdapter` — quote, swap execution via Jupiter Ultra API (Spec: dex-integration)
- [x] 3.5 Implement spot trading logic: USDC→Asset for buys, Asset→USDC for sells (Spec: dex-integration — Requirement: Spot Trading Only)
- [x] 3.6 Implement DEX selection mechanism via registry so the user can choose which adapter to use (Spec: dex-integration — Scenario: DEX selection)
- [x] 3.7 Add retry-with-backoff for swap failures and notification on persistent failure (Spec: dex-integration — Scenario: Swap failure handling)
- [x] 3.8 Add unit tests for `JupiterSwapAdapter` and `JupiterUltraAdapter` with mocked API responses and registry
- [x] 3.9 Add `@solana/web3.js`, `@jup-ag/api` to package.json dependencies

## 4. Symbol × Timeframe Matrix Scheduler

- [x] 4.1 Implement `PairId` type and `SymbolTimeframeMatrix` configuration model (Spec: symbol-timeframe-matrix)
- [x] 4.2 Implement `Scheduler` class with deterministic iteration over configured pairs (Design: Decision 4; Spec: symbol-timeframe-matrix)
- [x] 4.3 Implement mutex-based serialization for all wallet-affecting operations (Design: Decision 4; Spec: symbol-timeframe-matrix — Requirement: Shared Wallet Safety)
- [x] 4.4 Integrate existing PineScript engine per pair via CandleProcessor callback (Spec: trading-engine — Requirement: Reusable PineScript Engine Instance)
- [x] 4.5 Implement candle close processing and strategy execution trigger via tick() (Spec: trading-engine — Scenario: Execution on confirmed close)
- [x] 4.6 Add balance check before every order submission (in spot-trading.ts) (Spec: symbol-timeframe-matrix — Scenario: Balance check before order)
- [x] 4.7 Add unit tests for scheduler with multiple pairs and deterministic ordering
- [x] 4.8 Add unit tests for mutex serialization and race condition prevention

## 5. Risk Management

- [ ] 5.1 Implement `DailyStopLoss` tracker — configurable threshold, timezone-aware reset, cumulative realized loss tracking (Spec: risk-management — Requirement: Daily Stop Loss)
- [ ] 5.2 Wire daily stop loss into bot engine: prevent new entries when breached, allow exits (Spec: risk-management — Scenario: Threshold breached)
- [ ] 5.3 Implement optional immediate-close-all mode when daily stop loss triggers (Spec: risk-management — Scenario: Optional immediate close)
- [ ] 5.4 Implement `EmergencyStop` procedure — cancel pending, close positions, stop execution, audit log (Spec: risk-management — Requirement: Emergency Stop)
- [ ] 5.5 Implement `SafeShutdown` sequence — reject entries → finish bar → close positions → persist → terminate (Design: Decision 9; Spec: risk-management — Requirement: Safe Shutdown)
- [ ] 5.6 Implement SIGTERM/SIGINT handler that triggers safe shutdown (Design: Decision 9; Spec: risk-management — Requirement: Safe Shutdown)
- [ ] 5.7 Add unit tests for daily stop loss threshold, reset, and emergency stop flow
- [ ] 5.8 Add integration test for SIGTERM signal handling

## 6. Backend Services — WebSocket, Trade History, Telegram

- [ ] 6.1 Implement WebSocket channels in backend: `bot:state`, `bot:metrics`, `bot:position`, `bot:log`, `bot:trade` (Design: Decision 6; Spec: live-dashboard)
- [ ] 6.2 Implement snapshot + delta pattern: full state on connect, deltas thereafter (Design: Decision 6)
- [ ] 6.3 Implement `TradeHistoryStore` — JSONL file writer with append, read, and query operations (Design: Decision 8; Spec: trade-history)
- [ ] 6.4 Implement debug snapshot capture: logs, market data, order lifecycle, balance evolution (Spec: trade-history — Requirement: Debug History)
- [ ] 6.5 Extend Telegram notification service with live trading event types (Spec: telegram-notification — MODIFIED Requirements)
- [ ] 6.6 Add Telegram notification for: bot start/stop, position open/close, emergency stop, daily loss, errors (Spec: telegram-notification)
- [ ] 6.7 Add unit tests for WebSocket snapshot/delta pattern and TradeHistoryStore
- [ ] 6.8 Add unit tests for Telegram notification formatting for all new event types

## 7. Frontend — Bot Controls & Live Dashboard

- [ ] 7.1 Add bottom panel section with Start Bot / Stop Bot buttons (Spec: frontend-application — MODIFIED Requirements)
- [ ] 7.2 Wire Start/Stop buttons to backend API endpoints with state reflection (Spec: frontend-application — Scenario: Frontend reflects backend state)
- [ ] 7.3 Implement WebSocket connection from frontend to backend for dashboard data stream (Spec: live-dashboard — Requirement: Continuous Updates)
- [ ] 7.4 Build Live Status section: state indicator, strategy name, DEX, wallet, duration, balance, PnL (Spec: live-dashboard — Requirement: Live Status Display)
- [ ] 7.5 Build Positions table: symbol, side, size, entry price, current PnL per position (Spec: live-dashboard — Scenario: Positions)
- [ ] 7.6 Build Metrics panel: trade count, win rate, avg win/loss, profit factor, drawdown, fees, latency (Spec: live-dashboard — Requirement: Performance Metrics)
- [ ] 7.7 Build streaming Log Viewer: scrollable, auto-updating, categorized log entries (Spec: live-dashboard — Requirement: Live Log Stream)
- [ ] 7.8 Implement Emergency Stop button in dashboard (Spec: risk-management — Scenario: Emergency stop from frontend)
- [ ] 7.9 Add WebSocket auto-reconnect logic on disconnect (Spec: live-dashboard — Scenario: Reconnect on disconnect)
- [ ] 7.10 Verify dashboard never blocks trading engine — closing UI leaves bot running (Spec: frontend-application — Scenario: Frontend does not block trading)

## 8. Automatic Market Selection

- [ ] 8.1 Implement auto-selection orchestrator that iterates candidate pairs and delegates to backtest engine (Design: Decision 7; Spec: auto-market-selection)
- [ ] 8.2 Extend backtest engine with batch mode: accept list of (Symbol × Timeframe) pairs, return ranked results (Spec: strategy-backtest-engine — MODIFIED Requirements)
- [ ] 8.3 Implement ranking with configurable metric: Sharpe ratio, profit factor, net profit, win rate (Spec: auto-market-selection — Scenario: Configurable evaluation metric)
- [ ] 8.4 Ensure auto-selection uses selected DEX's commission model and slippage (Spec: auto-market-selection — Requirement: DEX-Consistent Evaluation)
- [ ] 8.5 Wire auto-selection into bot start flow: if Auto Select enabled, run backtests before Starting transition (Spec: auto-market-selection)
- [ ] 8.6 Add integration test for auto-selection flow with mocked backtest results

## 9. Integration & Configuration Wiring

- [ ] 9.1 Create `BotConfig` interface covering all bot settings (strategy, DEX, pairs, risk, wallet ref, auto-select)
- [ ] 9.2 Wire `BotEngine` into backend server: expose start/stop/status/emergencyStop API endpoints
- [ ] 9.3 Create configuration wizard flow in backend (strategy → DEX → symbols → timeframes → risk settings)
- [ ] 9.4 Wire wallet import into backend CLI or API endpoint
- [ ] 9.5 Add configuration validation: required fields, valid DEX, valid pairs, valid risk values
- [ ] 9.6 Add feature flag for trading bot (disabled by default) for safe rollout (Design: Migration Plan)

## 10. End-to-End Tests & Documentation

- [ ] 10.1 Write integration test: start bot → process candles → signals generated → orders submitted
- [ ] 10.2 Write integration test: emergency stop — verify positions closed and state transitions
- [ ] 10.3 Write integration test: daily stop loss — verify entry prevention after threshold breached
- [ ] 10.4 Write integration test: auto-selection — verify ranking and selection
- [ ] 10.5 Write integration test: SIGTERM — verify safe shutdown sequence
- [ ] 10.6 Add documentation for bot configuration and operation in `docs/trading-bot.md`
- [ ] 10.7 Update `README.md` with live trading capability overview
