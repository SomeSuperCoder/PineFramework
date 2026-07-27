## Context

The pine-framework currently supports backtesting Pine Script strategies via its strategy execution engine. Users can write strategies, run them against historical data, and view results on the chart. There is no mechanism to run strategies live against real markets.

The existing codebase provides:
- A PineScript execution engine (`src/`) that compiles and runs Pine Script v5/v6 bar-by-bar
- A strategy backtest engine (`src/strategy/`) with commission modeling, OCA groups, trailing stops
- Bybit market data integration (WebSocket + REST) in the backend
- Telegram notification integration in the backend
- A React frontend with charting, tabs, and bottom panel
- A backend Express server with WebSocket support

The live trading bot must integrate with these existing systems while adding entirely new capabilities for wallet management, DEX execution, bot lifecycle, and risk management.

## Goals / Non-Goals

**Goals:**
- Headless trading engine with deterministic state machine (Idle → Starting → Running → Stopping → Stopped → Error)
- Secure Solana wallet management (seed phrase import, encrypted storage, memory wiping)
- Jupiter DEX integration (Swap + Ultra) via a pluggable DEX abstraction layer
- Symbol × Timeframe matrix scheduler with deterministic, race-condition-free execution
- Automatic market selection via historical backtest ranking
- Risk management (daily stop loss, emergency stop, safe shutdown, SIGTERM handling)
- Real-time live dashboard with streaming logs and metrics
- Persistent trade history and debug data for post-mortem analysis
- Extended Telegram notifications for live trading events
- Frontend bottom panel (Start, Stop, Dashboard) that reflects actual backend state

**Non-Goals:**
- Short selling or leveraged trading (spot only in initial implementation)
- Multiple simultaneous bots (architecture supports it, but only one active at a time)
- Centralized exchange integration (CEX support deferred)
- Distributed/remote worker execution (deferred)
- Mobile trading app (frontend is desktop web only)
- Wallet creation or key generation (import-only)

## Decisions

### Decision 1: New `src/trading/` module for the headless engine
**Rationale**: The existing `src/` code is focused on PineScript compilation and backtesting. Live trading introduces orthogonal concerns (state machine, wallet, DEX, risk) that don't belong in any existing module. A clean `src/trading/` namespace keeps concerns separated.
**Alternatives considered**:
- Add to `backend/` — rejected because the engine itself is framework-level, not backend-specific
- Add to `src/strategy/` — rejected because strategy execution is one component the engine uses, not the engine itself

### Decision 2: State machine as a generic `StateMachine<T>` class
**Rationale**: All bot lifecycle transitions are deterministic and must be logged. A generic, type-safe state machine class encapsulates transition rules, guards, and hooks. Each transition emits events that the rest of the system observes.
**States**: `Idle` | `Starting` | `Running` | `Stopping` | `Stopped` | `Error`
**Transitions**:
- Idle → Starting (on start command)
- Starting → Running (on initialization complete)
- Starting → Error (on initialization failure)
- Running → Stopping (on stop command)
- Running → Error (on unrecoverable error)
- Stopping → Stopped (on cleanup complete)
- Stopping → Error (on cleanup failure)
- Error → Stopped (on user acknowledgement)
- Stopped → Idle (on reset)

### Decision 3: Pluggable DEX interface via abstract class
**Rationale**: Jupiter is the initial DEX, but the architecture must support future DEXs with minimal code changes. An abstract `DexAdapter` class defines `quote()`, `swap()`, `getBalance()`, `getTransactionStatus()`. Each DEX implements this interface. Commission models are part of the implementation, shared across live trading, backtesting, and auto-selection.
**Interface**:
```typescript
abstract class DexAdapter {
  abstract readonly name: string;
  abstract readonly commissionModel: CommissionModel;
  abstract quote(inputMint: string, outputMint: string, amount: bigint, slippage: number): Promise<Quote>;
  abstract swap(quote: Quote, wallet: Wallet): Promise<SwapResult>;
  abstract getBalance(mint: string, wallet: Wallet): Promise<bigint>;
  abstract getTransactionStatus(signature: string): Promise<TxStatus>;
}
```

### Decision 4: Scheduler uses a single-threaded event loop with mutex
**Rationale**: JavaScript is single-threaded by nature, but async operations (WebSocket, DEX API calls) can interleave. The scheduler must serialize all wallet-affecting operations behind a mutex to prevent race conditions on balance checks and order submissions. Candle processing for each pair runs sequentially within a single execution tick.
**Architecture**: `Scheduler` owns a `Mutex` and a `Map<PairId, CandleConsumer>`. On each tick it iterates pairs in deterministic order, processes closed candles, collects signals, acquires the mutex, and submits orders.

### Decision 5: Wallet encryption via AES-256-GCM with derived key
**Rationale**: Node.js `crypto` module provides AEAD encryption natively. The seed phrase is encrypted with a key derived from a user-provided passphrase (or auto-generated key stored in a separate config file). The encrypted wallet is written to `~/.pine-framework/wallets/<publicKey>.enc`.
**Memory safety**: Decrypted secrets are stored in a `SensitiveData<T>` wrapper that:
- Implements `dispose()` to zero-fill buffers
- Is never JSON-serialized
- Is never included in error messages
- Uses `Buffer.alloc()` (not `allocUnsafe`) to prevent residual data exposure

### Decision 6: Dashboard data flows via WebSocket with snapshot + delta pattern
**Rationale**: A fresh WebSocket connection sends a full state snapshot. Subsequent updates are deltas (new trade, updated PnL, log entries). This minimizes bandwidth while ensuring reconnecting clients always get the complete picture.
**Channels**:
- `bot:state` — state machine transitions
- `bot:metrics` — aggregated performance metrics
- `bot:position` — position open/close/update
- `bot:log` — streaming log entries
- `bot:trade` — completed trade records

### Decision 7: Auto-selection delegates to backtest engine
**Rationale**: The existing `strategy-backtest-engine` already computes all the metrics needed for ranking (Sharpe ratio, profit factor, drawdown, etc.). Auto-selection is simply a batch mode of the same engine, iterating over candidate (Symbol × Timeframe) pairs with the same DEX commission model. No duplicate logic.

### Decision 8: Trade history stored as JSONL files
**Rationale**: JSONL (newline-delimited JSON) is append-only, human-readable, and trivial to parse. Each trade is one line. Debug snapshots are separate files in a `debug/` subdirectory. No database dependency is needed for the initial implementation. Migrating to SQLite later is straightforward.
**Structure**:
```
~/.pine-framework/trades/
  <bot-id>/
    trades.jsonl
    debug/
      2026-07-27T12:00:00Z_snapshot.json
```

### Decision 9: SIGTERM/SIGINT handler performs safe shutdown
**Rationale**: Process termination must never leave positions unmanaged. The handler triggers the same safe shutdown sequence as a normal stop request: reject new entries → finish current bar → close positions → persist state → terminate.
**Implementation**: `process.on('SIGTERM', () => engine.safeShutdown())` and `process.on('SIGINT', () => engine.safeShutdown())`. The handler is idempotent.

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| Wallet key compromise from memory dump | Total loss of funds | `SensitiveData<T>` wrapper with explicit zero-fill; limit window of exposure |
| Jupiter API downtime | Bot cannot trade | DEX adapter interface allows fallback routing; log and notify on failure; retry with backoff |
| Race condition on concurrent candle closes | Double-spend or overspend | Mutex on all wallet operations; single-threaded scheduler |
| Backtest and live execution diverge | False confidence in strategy | Share commission model between backtest and live; use same DEX adapter for both |
| Frontend disconnect during emergency stop | User thinks stop didn't happen | Frontend always polls actual backend state; WebSocket reconnection gets fresh snapshot |
| Seed phrase in terminal history | Permanent credential leak | CLI import reads from stdin with `readline` password mode; never from argv |
| SIGKILL (cannot intercept) | Orphaned positions | Impossible to prevent fully; trade history allows recovery; user is warned |
| Large number of Symbol × Timeframe pairs | Memory pressure | Scheduler caps concurrent pairs; backpressure on candle processing |

## Migration Plan

1. **Phase 1 — Core engine** (no live execution): State machine, wallet management, scheduler, DEX interface, risk manager — all testable in isolation
2. **Phase 2 — Jupiter integration**: Implement `JupiterSwapAdapter` and `JupiterUltraAdapter`; real order submission
3. **Phase 3 — Backend services**: WebSocket dashboard stream, trade history persistence, Telegram extension
4. **Phase 4 — Frontend**: Bottom panel controls, dashboard components, log stream
5. **Phase 5 — Polish**: Auto-selection, SIGTERM handling, edge cases, integration tests

Rollback: Disable the trading bot feature flag; the rest of the application (backtesting, charting) is unaffected.

## Open Questions

1. Should the wallet passphrase for decryption be stored in an environment variable or prompted at startup?
2. Which Solana RPC provider should be used for Jupiter transactions (public, Helius, QuickNode)?
3. What is the maximum number of Symbol × Timeframe pairs the scheduler should support?
4. Should auto-selection rank by Sharpe ratio, profit factor, or be user-configurable?
5. How should swap failures be retried? (automatic with backoff, or manual only)
