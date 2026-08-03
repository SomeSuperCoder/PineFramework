## Why

When a user manually selects a trading pair, the bot refuses to start with the error "auto-select must run before starting; use the Backtest step first." This happens because the frontend always sends `autoSelect: true` in the initial configure, and the manual pair selection is only stored in local React state — never sent to the backend. The backend uses `autoSelect` as a hard gate instead of a conditional trigger.

## What Changes

- **BotEngine.start()** logic changes: instead of blocking when `autoSelect=true`, it checks whether pairs are already configured. If pairs exist (from auto-select, manual selection, or API), the engine uses them directly. Auto-select only runs when pairs are empty.
- Frontend no longer needs to coordinate `autoSelect` flags — the backend is self-correcting.

## Capabilities

### Modified Capabilities

- `bot-start-lifecycle`: The `autoSelect` flag becomes a trigger ("pick pairs if needed") instead of a gate ("refuse to start"). Start permission depends on whether pairs are configured, not the flag value.

## Impact

- **File**: `src/trading/bot-engine.ts` — `start()` method (~5 lines changed)
- **No API changes** — the `/api/bot/start` endpoint behavior becomes more permissive
- **No frontend changes** — existing frontend flow works correctly once the backend is smarter
- **No breaking changes** — existing auto-select flow continues to work; this only unblocks the manual selection path
