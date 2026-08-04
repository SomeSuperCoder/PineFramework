## Why

The live trading bot has no way to stress-test its order execution pipeline, position management, and error handling under realistic market conditions without risking real capital. Manual testing with real strategies is slow, predictable, and doesn't expose the system to the chaotic edge cases that occur in production (rapid signal changes, alternating positions, partial fills, etc.). A chaos test mode would generate random signals on every candle close, forcing the system to exercise all code paths continuously.

## What Changes

- **New chaos mode flag** in `BotConfig` — when enabled, the system ignores the user's Pine Script strategy and generates random long/short/exit signals instead
- **Random signal generator** — on each real-time candle close, produces a random action (`long`, `short`, `exit`) with equal probability
- **Fixed 10% capital sizing** — chaos mode always uses 10% of current equity per position, regardless of strategy config
- **Chaos mode activation** — toggled by repeatedly tapping a hidden area on the review/backtest screen (easter-egg style)
- **Dashboard warning banner** — when chaos mode is active and the trading dashboard opens, display a prominent full-screen warning ("⚠️ CHAOS MODE ACTIVE — RANDOM SIGNALS")
- **Chaos mode state tracking** — log all generated signals, executed orders, and position changes for post-test analysis

## Capabilities

### New Capabilities
- `chaos-test-mode`: Random signal generation mode for stress-testing the live trading pipeline — covers signal generation, capital sizing override, activation UX, and dashboard warning

### Modified Capabilities
- `bot-start-lifecycle`: Chaos mode must integrate with the bot startup flow (config flag, initialization)
- `strategy-execution`: Chaos mode bypasses normal strategy execution, so the executor must handle the override

## Impact

- **Backend**: `BotConfig` type, `BotEngine`, `LiveStrategyExecutor`, `LiveScheduler` — chaos mode hooks into the candle-close pipeline
- **Frontend**: `TradingBotPanel` (dashboard warning), `BacktestResults` or review screen (hidden activation area), `App.tsx` (state management)
- **Types**: New `ChaosModeConfig` interface, additions to `BotConfig`
- **No breaking changes** — chaos mode is opt-in and off by default

## Non-goals

- Not a replacement for proper backtesting or paper trading
- Not implementing configurable signal distributions (uniform random is sufficient for v1)
- Not implementing chaos mode for backtesting — only real-time candle execution
