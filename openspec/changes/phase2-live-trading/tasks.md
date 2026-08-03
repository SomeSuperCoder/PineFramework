## 1. Dependencies and Setup

- [x] 1.1 Add `@solana/web3.js` dependency to `package.json`
- [x] 1.2 Create Solana RPC configuration (mainnet/devnet endpoint, commitment level)
- [x] 1.3 Add environment variables for Solana RPC URL and commitment level

## 2. Solana Wallet Integration

- [x] 2.1 Implement BIP44 keypair derivation from seed phrase (`m/44'/501'/0'/0'`)
- [x] 2.2 Extend `WalletManager` to support Solana keypair generation and storage
- [x] 2.3 Implement `getSolBalance()` using `@solana/web3.js` `getBalance` RPC call
- [x] 2.4 Implement `getTokenBalance()` using Associated Token Account derivation
- [x] 2.5 Add unit tests for wallet operations (derivation, balance queries)

## 3. Jupiter DEX Execution

- [x] 3.1 Implement transaction deserialization from Jupiter API base64 response
- [x] 3.2 Implement transaction signing with wallet keypair
- [x] 3.3 Implement transaction simulation before submission
- [x] 3.4 Implement transaction submission to Solana RPC
- [x] 3.5 Implement transaction confirmation polling (max 60 seconds)
- [x] 3.6 Update `JupiterSwapAdapter.swap()` to use real signing/submission
- [x] 3.7 Update `JupiterSwapAdapter.getBalance()` to use real RPC queries
- [x] 3.8 Add unit tests for swap lifecycle (quote → sign → submit → confirm)

## 4. Live Bar Feed

- [x] 4.1 Create `BybitWebSocketService` class for live candle streaming
- [x] 4.2 Implement WebSocket connection to `wss://stream.bybit.com/v5/public/linear`
- [x] 4.3 Implement kline subscription for configured Symbol × Timeframe pairs
- [x] 4.4 Implement candle confirmation filtering (only process `confirm: true`)
- [x] 4.5 Implement candle data normalization to `ClosedCandle` format
- [x] 4.6 Implement connection recovery with exponential backoff (max 30s)
- [x] 4.7 Implement historical candle fetch on startup (200 candles per pair)
- [x] 4.8 Add unit tests for WebSocket connection and candle processing

## 5. Live Strategy Execution

- [x] 5.1 Create `LiveStrategyExecutor` class bridging strategy signals to DEX orders
- [x] 5.2 Implement strategy compilation from Pine Script source
- [x] 5.3 Implement bar-by-bar execution on live candles
- [x] 5.4 Implement signal-to-order translation (buy → USDC→Asset, sell → Asset→USDC)
- [x] 5.5 Implement position size calculation based on available balance
- [x] 5.6 Implement strategy state persistence (series values, var variables)
- [x] 5.7 Implement strategy state restore on bot restart
- [x] 5.8 Add unit tests for live strategy execution

## 6. Position Scheduler

- [x] 6.1 Create `LiveScheduler` class extending existing `Scheduler`
- [x] 6.2 Implement mutex-serialized order submission
- [x] 6.3 Implement two-phase pipeline (signal collection → order submission)
- [x] 6.4 Implement error isolation per pair (continue processing on failure)
- [x] 6.5 Implement pause/resume functionality
- [x] 6.6 Implement scheduler statistics tracking
- [x] 6.7 Add unit tests for scheduler execution

## 7. Risk Management

- [x] 7.1 Create `LiveRiskManager` class implementing daily loss tracking
- [x] 7.2 Implement rolling 24-hour loss window calculation
- [x] 7.3 Implement daily reset at configured timezone
- [x] 7.4 Implement emergency stop trigger on loss limit breach
- [x] 7.5 Implement Telegram notification on emergency stop
- [x] 7.6 Implement position exposure tracking
- [x] 7.7 Add unit tests for risk management

## 8. Bot Engine Integration

- [x] 8.1 Update `BotEngine.initialize()` to connect real components
- [x] 8.2 Wire `BybitWebSocketService` for live bar feed
- [x] 8.3 Wire `LiveStrategyExecutor` for strategy execution
- [x] 8.4 Wire `JupiterSwapAdapter` for DEX operations
- [x] 8.5 Wire `LiveScheduler` for pair management
- [x] 8.6 Wire `LiveRiskManager` for risk enforcement
- [x] 8.7 Update `BotEngine.shutdown()` to close real connections
- [x] 8.8 Implement graceful position closure on stop
- [x] 8.9 Implement state persistence on shutdown
- [x] 8.10 Add integration tests for bot lifecycle

## 9. Testing and Validation

- [x] 9.1 Create devnet test environment configuration
- [x] 9.2 Test wallet operations on Solana devnet
- [x] 9.3 Test Jupiter swap on devnet with small amounts
- [x] 9.4 Test live bar feed with real Bybit WebSocket
- [x] 9.5 Test complete bot lifecycle (start → trade → stop)
- [x] 9.6 Test emergency stop functionality
- [x] 9.7 Test reconnection and state recovery

## 10. Documentation

- [x] 10.1 Update `docs/trading-bot.md` with Phase 2 capabilities
- [x] 10.2 Document Solana RPC configuration
- [x] 10.3 Document devnet testing procedures
- [x] 10.4 Document mainnet migration steps
