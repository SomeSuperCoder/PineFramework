## Why

When `engine.start()` fails (e.g., autoSelect is still true), the backend returns a specific, actionable error message. But the frontend's `handleStart` catch block discards it and shows a generic "Failed to start bot" — the user has no idea what went wrong or how to fix it.

## What Changes

- Surface the backend error message in the Review step's Start button error display.
- Show a user-friendly message when the start fails due to auto-select being pending.

## Capabilities

### Modified Capabilities

- `bot-start-lifecycle`: The error message shown when start fails is now the backend's specific message, not a hardcoded generic string.

## Impact

- `frontend/src/components/TradingBotPanel.tsx` — one catch block in `handleStart`

## Non-goals

- Redesigning the error message format or adding error codes
- Changing the backend error messages
- Adding retry logic or error recovery flows

## Risks / Trade-offs

- **Risk**: Exposing raw backend error strings to the UI could leak internal details. **Mitigation**: The backend errors are already user-facing by design (they describe what the user should do next).
