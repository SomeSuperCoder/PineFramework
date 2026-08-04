## 1. LiveStrategyExecutor — Chaos Generator Hot-Swap

- [ ] 1.1 Add `setChaosGenerator(generator: ChaosSignalGenerator)` method to `LiveStrategyExecutor` that sets `this.config.chaosGenerator` and reinitializes strategy engines for each configured pair (bare `StrategyEngine` with `CHAOS_INITIAL_CAPITAL_LAMPORTS`)
- [ ] 1.2 Add `clearChaosGenerator()` method to `LiveStrategyExecutor` that sets `this.config.chaosGenerator = undefined`
- [ ] 1.3 Add unit tests for `setChaosGenerator` / `clearChaosGenerator` — verify generator swap takes effect on next `processCandle` call

## 2. BotEngine — toggleChaosMode Method

- [ ] 2.1 Add `toggleChaosMode(enabled: boolean)` method to `BotEngine` (spec: chaos-mode-hot-swap)
  - When Running: delegate to `this.strategyExecutor.setChaosGenerator()` / `clearChaosGenerator()`, update `this._config.chaosMode`, log state change
  - When Idle/Stopped: update `this._config.chaosMode` (same as configure path)
- [ ] 2.2 Emit `configUpdate` event after toggle so downstream listeners are notified
- [ ] 2.3 Add unit tests for `toggleChaosMode` in all states (Running, Idle, Stopped, Error)

## 3. Backend Route — POST /bot/chaos-mode

- [ ] 3.1 Update `POST /bot/chaos-mode` route handler to call `engine.toggleChaosMode(enabled)` instead of `engine.configure(updatedConfig)` when engine is Running (spec: chaos-mode-hot-swap)
- [ ] 3.2 Preserve existing behavior for Idle/Stopped states (configure + persist to store)
- [ ] 3.3 Persist updated config to config store after successful toggle
- [ ] 3.4 Update or add integration tests for the route handler

## 4. Frontend — useChaosMode Toggle

- [ ] 4.1 Change `useChaosMode` hook to call `POST /bot/chaos-mode` instead of `PATCH /bot/config/chaos-mode` (spec: chaos-mode-hot-swap)
- [ ] 4.2 Keep initial state load from `GET /api/bot/config` unchanged
- [ ] 4.3 Verify frontend chaos mode toggle works while bot is running (manual or Playwright test)

## 5. Tests & Quality

- [ ] 5.1 Update `chaos-realistic-engine.test.ts` — add test for hot-swap enabling chaos on a running executor
- [ ] 5.2 Update `chaos-mode-integration.test.ts` — add test for toggleChaosMode on running BotEngine
- [ ] 5.3 Run full test suite, lint, typecheck — verify zero new errors
