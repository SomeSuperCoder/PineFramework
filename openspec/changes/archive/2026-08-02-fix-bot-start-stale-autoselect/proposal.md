## Why

Clicking "Start Bot" on the Review step causes an infinite "Starting..." state when the persisted config still has `autoSelect: true`. The backend's `engine.start()` blocks on a full 28-pair auto-selection before transitioning to `Starting`, the HTTP response never returns, and no WS state events reach the frontend. The earlier fix (db287ac) flipped `autoSelect` to false only in memory — the persisted config on disk retains `autoSelect: true`, so any backend restart reintroduces the hang. Live evidence: `backend/data/bot-config.json` has `"autoSelect": true` after successful backtests.

## What Changes

- **engine.start() refuses to start when autoSelect is enabled.** Returns a clear error ("auto-select must run before starting; use the Backtest step first") instead of silently blocking for minutes. State remains Idle; the error surfaces via HTTP 400 and the existing `bot:log` channel.
- **Post-backtest config is persisted to disk.** After `/bot/backtest` completes selection, the final config (`autoSelect: false`, resolved pairs) is saved via `BotConfigStore.save()`. Any subsequent restart loads the clean config — no stale autoSelect.
- **Frontend Review step surfaces the error.** If `POST /api/bot/start` returns an error, the Review step displays the message and re-enables the Start button. No silent hang.

## Capabilities

### New Capabilities

- `bot-start-lifecycle`: Defines how `engine.start()` behaves — the state transition contract, what preconditions are checked, and how errors are reported. Covers the rule: refuse to start when autoSelect is still enabled.

### Modified Capabilities

(none — this is a targeted bug fix with no spec-level behavior changes to existing capabilities)

## Impact

- **Files**: `src/trading/bot-engine.ts` (start precondition check), `backend/src/routes/bot.ts` (post-backtest persistence), `frontend/src/components/TradingBotPanel.tsx` (error display)
- **APIs**: `POST /api/bot/start` may now return 400 with `autoSelect` error — callers should handle
- **Data**: `bot-config.json` will contain `autoSelect: false` + resolved pairs after backtest — persisted across restarts

## Non-goals

- Redesigning the auto-select flow (e.g., running selection as part of the `Starting` transition with progress) — that's a future enhancement
- Changing the wizard step order or when auto-select runs
- Adding timeouts to Bybit bar fetching (separate concern)

## Risks / Trade-offs

- **Risk**: Existing bots that were running with stale configs may fail to start after the fix. **Mitigation**: The error message is clear and tells the user to re-run the Backtest step.
- **Trade-off**: `start()` now has a hard precondition instead of self-healing. This is intentional — silent blocking is worse than a loud refusal.
