## Context

The trading bot Phase 1 MVP provides the lifecycle shell (state machine, API, wallet management) but lacks the execution engine. The `BotEngine.initialize()` method is a placeholder that logs "no real components connected". The Jupiter DEX adapter can fetch quotes but returns fake swap results without signing transactions. The `getBalance()` method returns hardcoded zeros.

This design connects all the missing pieces to make the bot actually trade.

## Goals / Non-Goals

**Goals:**
- Enable live trading on Solana DEXes via Jupiter with real funds
- Maintain the existing state machine and API interface
- Support multiple Symbol × Timeframe pairs with deterministic execution
- Implement risk management with daily loss limits and emergency stop
- Keep the architecture modular for future DEX additions

**Non-Goals:**
- Multi-leg strategies (only long-only spot trading initially)
- Advanced order types (limit orders, stop-losses on-chain)
- Portfolio rebalancing or complex position management
- Mainnet deployment safety guarantees (devnet testing first)

## Decisions

### 1. Bar Feed: Bybit WebSocket (Existing Integration)

**Decision**: Use the existing Bybit WebSocket integration for live bars, not a new data source.

**Rationale**: The backend already has Bybit WebSocket code for market data. Reusing it avoids duplication and leverages tested code.

**Alternatives considered**:
- Jupiter historical API: No real-time WebSocket, only REST polling
- Custom WebSocket: More work, no benefit over existing Bybit integration

### 2. Strategy Execution: Separate Compiler from Executor

**Decision**: Keep strategy compilation separate from live execution. The compiler produces a runnable module; the executor runs it on each candle.

**Rationale**: This maintains the existing backtest architecture. The same compiled strategy works in both backtest and live modes, ensuring deterministic behavior.

**Alternatives considered**:
- Inline compilation: Tightly coupled, harder to test
- WASM compilation: Overkill for Pine Script, adds complexity

### 3. DEX Integration: Complete Jupiter Adapter with @solana/web3.js

**Decision**: Add `@solana/web3.js` as a dependency and implement real transaction signing/submission in the existing `JupiterSwapAdapter`.

**Rationale**: The adapter already has the correct API structure. Completing it minimizes changes to the rest of the system.

**Alternatives considered**:
- New adapter class: More code, no benefit
- Jupiter Ultra API: Different endpoint, same complexity

### 4. Wallet Management: Extend Existing Encryption

**Decision**: Extend the existing `WalletManager` to support Solana keypair derivation from seed phrases using BIP44 path `m/44'/501'/0'/0'`.

**Rationale**: The wallet infrastructure already handles encryption and secure memory. Adding Solana-specific derivation is a natural extension.

**Alternatives considered**>
- External wallet integration (Phantom, Solflare): Requires user interaction, not suitable for automated trading
- Hardware wallet support: Future enhancement, not Phase 2

### 5. Position Scheduler: Mutex-Serialized Execution

**Decision**: Use the existing `Scheduler` class with mutex-serialized order submission.

**Rationale**: The scheduler already handles deterministic pair processing. Adding mutex ensures no race conditions on wallet operations.

**Alternatives considered**:
- Parallel execution: Risk of race conditions on wallet balance
- Queue-based: More complexity, no benefit for single-wallet scenario

### 6. Risk Manager: Rolling 24-Hour Window

**Decision**: Implement rolling 24-hour loss tracking in addition to daily resets.

**Rationale**: Daily resets alone allow "loss chasing" across midnight. Rolling windows provide continuous protection.

**Alternatives considered**:
- Only daily limits: Simpler but less protective
- Position-based limits: Not implemented in Phase 2

## Risks / Trade-offs

**Risk: Real fund loss on mainnet**
- Mitigation: Thorough devnet testing, default to devnet RPC, require explicit mainnet configuration
- Trade-off: Slower testing cycle vs. safety

**Risk: Jupiter API changes**
- Mitigation: Pin API version, monitor changelog, implement adapter pattern for easy updates
- Trade-off: Maintenance burden vs. stability

**Risk: Solana network congestion**
- Mitigation: Configurable priority fees, transaction simulation before submission, timeout handling
- Trade-off: Higher fees during congestion vs. transaction reliability

**Risk: Strategy bugs in live mode**
- Mitigation: Extensive backtest coverage, paper trading mode (future), position size limits
- Trade-off: Testing overhead vs. production safety

**Risk: WebSocket disconnection**
- Mitigation: Exponential backoff reconnection, state persistence across restarts
- Trade-off: Potential missed candles during disconnection

## Migration Plan

1. **Devnet Testing**: Deploy with Solana devnet RPC, test with small amounts
2. **Paper Trading**: Add dry-run mode that logs trades without execution (future enhancement)
3. **Gradual Rollout**: Start with single pair (SOL/USDC), monitor for 24 hours
4. **Mainnet Migration**: Switch RPC endpoint, increase position sizes gradually

## Open Questions

- Should we implement a paper trading mode before mainnet? (Future enhancement, not blocking Phase 2)
- What's the optimal slippage tolerance for different pair categories? (Can be tuned post-deployment)
