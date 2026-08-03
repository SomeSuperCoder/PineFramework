## 1. Types & Configuration

- [x] 1.1 Add `ChaosModeConfig` interface and `chaosMode` field to `BotConfig` in `src/trading/types.ts` (Design §2)
- [x] 1.2 Add default `chaosMode: { enabled: false }` to config loading in `src/trading/config-store.ts`
- [x] 1.3 Add chaos mode to the bot status snapshot type (`BotStatusSnapshot`) so frontend can read it

## 2. Chaos Signal Generator

- [x] 2.1 Create `src/trading/chaos-signal-generator.ts` with `ChaosSignalGenerator` class (Design §1)
- [x] 2.2 Implement `generate(equity: number): ChaosSignal` — random selection of `long`/`short`/`exit` with equal probability, 10% equity sizing
- [x] 2.3 Implement signal logging via `BotLogger` with structured `chaos.signal` event (Design §5)
- [x] 2.4 Write unit tests for `ChaosSignalGenerator` — verify equal distribution over many runs, correct 10% sizing

## 3. LiveStrategyExecutor Integration

- [x] 3.1 Modify `LiveStrategyExecutor` to accept optional `ChaosSignalGenerator` in config (Design §1)
- [x] 3.2 Add chaos mode check in `processCandle()` — delegate to generator when active instead of running strategy (Design §1, spec `strategy-execution`)
- [x] 3.3 Ensure chaos mode ignores `positionSizePercent` and always uses 10% (spec `chaos-test-mode` Requirement: Fixed 10% capital sizing)
- [x] 3.4 Write tests for executor chaos mode path — verify random signals produced, strategy bypassed

## 4. BotEngine Startup Integration

- [x] 4.1 Modify `BotEngine.initialize()` to skip strategy compilation when `chaosMode.enabled: true` (spec `bot-start-lifecycle`)
- [x] 4.2 Ensure `engine.start()` succeeds without strategy source when chaos mode is on (spec `bot-start-lifecycle` Requirement: Chaos mode startup integration)
- [x] 4.3 Verify backtests are unaffected by chaos mode flag (spec `bot-start-lifecycle` Scenario: Chaos mode does not affect backtest)

## 5. Frontend — Hidden Activation Gesture

- [x] 5.1 Add hidden tap target to the review/backtest screen (invisible div, fixed position) (Design §3)
- [x] 5.2 Implement 5-tap-in-3-seconds detection logic
- [x] 5.3 Wire tap detection to toggle `BotConfig.chaosMode.enabled` via config API
- [x] 5.4 Show confirmation toast on toggle ("Chaos mode enabled" / "Chaos mode disabled")

## 6. Frontend — Dashboard Warning

- [x] 6.1 Create `ChaosModeWarning` component — full-screen overlay with "⚠️ CHAOS MODE ACTIVE — RANDOM SIGNALS" text and "I understand" button (Design §4)
- [x] 6.2 Integrate warning into `TradingBotPanel` / `LiveDashboard` — render overlay when `chaosMode.enabled` and dashboard opens
- [x] 6.3 Block dashboard interaction until user acknowledges the warning
- [x] 6.4 Add persistent chaos mode status indicator (badge/icon) visible in review screen and dashboard (spec `chaos-test-mode` Requirement: Chaos mode status indicator)

## 7. Backend API & WebSocket

- [x] 7.1 Expose `chaosMode` in the `/bot/status` WebSocket message so frontend can read state
- [x] 7.2 Add endpoint or WebSocket message to toggle chaos mode from frontend (or reuse existing config update flow)
- [x] 7.3 Ensure chaos mode toggle persists to config store on disk

## 8. Testing & Polish

- [x] 8.1 Write integration test: bot starts with chaos mode, processes candles, generates random signals
- [x] 8.2 Write integration test: chaos mode does not affect backtest execution
- [x] 8.3 Manual E2E test: enable chaos mode via hidden gesture, verify dashboard warning appears
- [x] 8.4 Run full test suite, lint, typecheck
