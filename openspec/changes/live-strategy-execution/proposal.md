## Why

The live trading bot never actually executes the configured strategy. The mini chart runs the full Pine interpreter (`/api/execute`) and renders the strategy's signals, but the bot's real (non-chaos) path in `LiveStrategyExecutor.processCandle` is a stub: it never feeds candles into the strategy engine, never compiles the Pine source, and its entry/exit logic hard-codes `return false`. Chaos mode is the only path that drives the engine, so a real strategy signal is produced on the chart and then silently ignored by the bot.

## What Changes

- **Wire real Pine strategy execution into the live path**: `LiveStrategyExecutor` compiles the configured Pine `strategySource` and runs it bar-by-bar on live candles via the incremental `ExecutionEngine.executeBar`, so live decisions come from the actual strategy code.
- **Warm start**: on bot start, seed each pair's engine with recent historical bars (batch `executeBars`) so indicator state (`ta.ema`, `close[1]`, `var` variables) is populated before live candles are processed — parity with how the mini chart evaluates the strategy.
- **Marker-driven order bridge**: translate the strategy engine's genuine markers each live bar into `TradeSignal`s — `entry(long)`→`buy`, `entry(short)` on a flat spot position→ignored with warning (existing contract), `exit`/`close`→`sell`. Position state is kept in sync from markers.
- **Execution hardening**: resolve the current stubs/`null` wiring in `BotEngine.initialize` — real `WalletManager`, real `initialCapital` and `positionSizePercent` from bot config, balance-checked sizing.
- **Determinism guarantee**: the same source + same bars produce identical markers whether evaluated live (bar-by-bar) or on the mini chart / backtest (batch), satisfying the existing "live vs backtest identical signals" requirement.

## Capabilities

### New Capabilities

- *(none — extends the existing `strategy-execution` capability)*

### Modified Capabilities

- `strategy-execution`: The existing "Live Trading Mode", "Signal-to-order bridge", "Real-Time Position Tracking", and "Strategy State in Live Mode" requirements are currently implemented as placeholder logic. This change replaces the stub with real, engine-driven execution and adds the warm-start and determinism requirements.
- `mock-trading-test`: Extend the mock execution harness so live-mode path can be validated end-to-end (engine-driven signals → mock DEX fills) without blockchain.

## Impact

- **Engine**: `src/trading/live-strategy-executor.ts` (replace `processCandle` stub with `ExecutionEngine.executeBar` wiring + marker bridge), `src/trading/bot-engine.ts` (real wallet, capital, sizing config; per-pair engine warm-up), `src/strategy/backtest-engine.ts` (shared warm-up helper), `src/api.ts` (streaming/incremental execution entry point if needed).
- **Backend**: `backend/src/routes/bot.ts` (start wiring passes real config), bar feed seed history for warm start.
- **Types**: `StrategyState` gains the live `ExecutionEngine` runtime; scheduler `TradeSignal.marker` already flows to `BotEventMap`.
- **Tests**: `tests/unit/trading/live-strategy-executor.test.ts`, `mock-trading-test` harness, determinism parity test (same bars → same markers live vs batch).
- **Non-chaos only**: no changes to chaos mode, the mini chart batch path, or the main strategy editor.

## Non-goals

- No changes to the chaos-mode simulated trading path.
- No changes to the mini chart's batch `/api/execute` rendering.
- No new strategy features (pyramiding, OCA, trailing) beyond what the engine already supports.
- No partial-fill / order-reconciliation beyond balance-checked immediate fills.
- No persistence of full bar history; only the warm-start seed buffer is retained in memory.