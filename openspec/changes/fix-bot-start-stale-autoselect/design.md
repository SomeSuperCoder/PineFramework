## Context

`engine.start()` in `src/trading/bot-engine.ts` currently runs auto-selection inline when `config.autoSelect` is `true` (lines 167-185), blocking the HTTP response and keeping the engine in `Idle` state. The `/bot/backtest` endpoint sets `autoSelect: false` in memory but never persists the change, so any backend restart reloads the stale `autoSelect: true` from `bot-config.json`. The frontend wizard's Review step sends users straight to "Start Bot" on the persisted config path, triggering the inline backtest with no feedback.

## Goals / Non-Goals

**Goals:**
- `engine.start()` never blocks on auto-selection — refuse with a clear error instead
- Persisted config always reflects the actual selection state after backtest completes
- Start errors are visible in the frontend Review step

**Non-Goals:**
- Running auto-selection as part of the `Starting` transition with progress (separate enhancement)
- Changing the wizard step order or auto-select trigger points
- Adding network timeouts to Bybit bar fetching

## Decisions

### Decision 1: Refuse start when autoSelect is true (not self-heal)

**Choice**: `engine.start()` throws immediately if `config.autoSelect === true`, returning a 400 to the caller. The error message directs the user to the Backtest step.

**Alternatives considered**:
- *Self-heal by running selection inline* — the status quo. Rejected because it causes silent multi-minute hangs with no UI feedback, and the selection can run unbounded (no fetch timeouts).
- *Transition to Starting first, then run selection with progress* — architecturally cleaner but requires redesigning the state machine and adding WS progress to the Review step. Out of scope for a bug fix; flagged as a future enhancement.
- *Auto-run the backtest silently on start* — same as status quo with extra steps; still blocks the response.

**Rationale**: A loud failure is strictly better than a silent hang. The wizard already enforces the Backtest step before Review, so this precondition check aligns the API contract with the UI flow.

### Decision 2: Persist config in the backtest endpoint (not in engine.start)

**Choice**: After `/bot/backtest` completes selection, call `configStore.save({...config, autoSelect: false, pairs: [result.best.pair]})` directly in the route handler (`backend/src/routes/bot.ts:364`).

**Alternatives considered**:
- *Persist inside `engine.configure()`* — would couple the config store to the engine, which currently has no store reference. Requires adding a store dependency to BotEngine.
- *Persist inside `engine.start()` after selection* — start() would need the store reference, and the persistence would happen too late (after the blocking backtest).
- *Persist in `onAutoSelect` callback* — the callback lives in `backend/src/index.ts` and has access to `configStore`. This works but duplicates the save logic across multiple call sites.

**Rationale**: The route handler is the single entry point for backtest completion. It already has access to both `engine` and `configStore`. Persisting here is minimal, explicit, and keeps the engine free of store dependencies.

### Decision 3: Surface errors via existing HTTP error response (not new WS channel)

**Choice**: The 400 response from `POST /api/bot/start` is already handled by the frontend's `sendCommand` (which throws on `!res.ok`). The Review step's `handleStart` catch block displays the error via `setStartError`. No new WS channel needed.

**Rationale**: The error is a one-shot response to a user action, not a state change. HTTP 400 is the natural channel for this. Adding a WS error channel would be over-engineering for a precondition failure.

## Risks / Trade-offs

- **Existing bots with stale configs may fail to start after deployment** → The error message clearly directs users to re-run the Backtest step. This is the correct behavior: the old config was incorrect (autoSelect should have been false), and surfacing the error is better than silently re-running a full backtest.

- **Persisting in the route handler couples config state to the API layer** → Acceptable for a bug fix. If config persistence becomes more complex (e.g., multiple write sites), a dedicated `persistPostBacktest()` method on the config store would be warranted.

- **The 400 error doesn't include enough context for automated recovery** → Fine for the current wizard-based flow. If CLI or programmatic callers need richer error handling, the error code (`AUTO_SELECT_PENDING`) can be added in a follow-up.

## Migration Plan

No migration needed. The persisted config on disk is self-healing: once the backtest runs after deployment, the config is saved with `autoSelect: false` and the issue is permanently resolved.

## Open Questions

None. All decisions are resolved and aligned with the spec requirements.
