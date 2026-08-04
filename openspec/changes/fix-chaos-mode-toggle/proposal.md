## Why

Chaos mode cannot be toggled while the bot is running. The frontend's `useChaosMode` hook calls `PATCH /bot/config/chaos-mode` which only persists to the config store—it does not update the running engine. The `POST /bot/chaos-mode` endpoint attempts `engine.configure()` but throws because the engine requires Idle/Stopped state. As a result, users who enable chaos mode via the UI after starting the bot see no random markers on the mini chart and no trades are executed.

## What Changes

- Add a `toggleChaosMode(enabled)` method to `BotEngine` that hot-swaps the chaos signal generator on a running engine without requiring a full stop/restart cycle
- Update `POST /bot/chaos-mode` to use the new hot-swap method instead of `engine.configure()`, allowing chaos mode to be toggled while the bot is Running
- Update the frontend `useChaosMode` hook to call `POST /bot/chaos-mode` (which now works while running) instead of `PATCH /bot/config/chaos-mode`
- The `PATCH /bot/config/chaos-mode` endpoint remains for persisting the preference to disk (for next bot start)

## Capabilities

### New Capabilities

- `chaos-mode-hot-swap`: Ability to enable/disable chaos mode on a running BotEngine, hot-swapping the ChaosSignalGenerator and reinitializing the strategy executor's chaos state per pair without stopping the bot

### Modified Capabilities

<!-- No existing spec-level capability requires delta specs — this is additive behavior -->

## Impact

- **Backend**: `src/trading/bot-engine.ts` (new `toggleChaosMode` method), `backend/src/routes/bot.ts` (updated POST endpoint), `backend/src/index.ts` (wiring)
- **Frontend**: `frontend/src/hooks/useChaosMode.ts` (switch from PATCH to POST)
- **Tests**: New unit tests for hot-swap, updated integration tests
- **Risk**: Low — chaos mode is a testing/stress feature; hot-swap only affects the chaos generator and executor state, not the core trading loop
