## Context

The chaos mode system has three layers: (1) `ChaosSignalGenerator` produces random signals, (2) `LiveStrategyExecutor.processCandleChaos()` drives a real `StrategyEngine` with those signals to produce genuine markers, (3) `BotEngine` orchestrates the executor, broadcasts chaos signals via WebSocket, and exposes history for dashboard replay.

Currently, `BotEngine.configure()` requires the engine to be in Idle or Stopped state (enforced by the state machine). The `POST /bot/chaos-mode` endpoint calls `configure()` directly, so it throws when the engine is Running. The frontend's `PATCH /bot/config/chaos-mode` only persists to the config store.

## Goals / Non-Goals

**Goals:**
- Allow chaos mode to be toggled while the bot is Running
- Hot-swap the ChaosSignalGenerator per pair without stopping the bar feed or scheduler
- Preserve the existing pre-start configuration path (PATCH for config store)

**Non-Goals:**
- Changing the chaos mode signal generation algorithm
- Adding new chaos mode UI controls
- Modifying the StrategyEngine or StrategyMarker internals

## Decisions

### D1: Add `toggleChaosMode(enabled)` to BotEngine

**Decision:** Add a public method `toggleChaosMode(enabled: boolean)` that:
- When enabling: creates a `ChaosSignalGenerator` and passes it to the strategy executor via a new `setChaosGenerator()` method
- When disabling: calls `clearChaosGenerator()` on the strategy executor

**Rationale:** This avoids calling `configure()` (which requires Idle/Stopped) and directly mutates the executor's chaos state. The bar feed and scheduler continue running uninterrupted.

**Alternatives considered:**
- Stop/restart cycle: Too slow, drops WebSocket connections, loses position state
- Event-based approach: Overly complex for a binary toggle

### D2: Add `setChaosGenerator()` / `clearChaosGenerator()` to LiveStrategyExecutor

**Decision:** Add methods to `LiveStrategyExecutor` to set or clear the chaos generator at runtime:
- `setChaosGenerator(generator: ChaosSignalGenerator)`: Sets the generator and reinitializes strategy engines for each pair (bare `StrategyEngine` with `CHAOS_INITIAL_CAPITAL_LAMPORTS`)
- `clearChaosGenerator()`: Sets the generator to `undefined`

**Rationale:** The executor's `processCandle()` checks `this.config.chaosGenerator` to decide whether to call `processCandleChaos()`. Swapping the generator at the config level is the cleanest way to redirect the processing path.

### D3: Frontend uses POST instead of PATCH

**Decision:** Change `useChaosMode` to call `POST /bot/chaos-mode` instead of `PATCH /bot/config/chaos-mode`. Keep the PATCH endpoint for backward compatibility.

**Rationale:** POST is the existing endpoint that updates the running engine. PATCH only persists to disk.

### D4: Update config store on hot-swap

**Decision:** When `toggleChaosMode()` is called on a Running engine, also persist the updated config to the config store (via the route handler, not the engine itself).

**Rationale:** Ensures the preference survives a restart.

## Risks / Trade-offs

- **[Risk] Position state inconsistency during hot-swap** → Mitigation: When enabling chaos mode, the existing executor position state is preserved. New pair engines are created fresh with `CHAOS_INITIAL_CAPITAL_LAMPORTS`. When disabling, the executor resumes with its existing position state.
- **[Risk] Race condition if candle arrives during generator swap** → Mitigation: JavaScript is single-threaded; the generator swap is atomic (single assignment). No lock needed.
- **[Trade-off] PATCH endpoint kept but not used by frontend** → Acceptable for backward compatibility with any external tools or scripts using PATCH.
