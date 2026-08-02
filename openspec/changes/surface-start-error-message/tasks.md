## 1. Surface error message in handleStart

- [x] 1.1 In `TradingBotPanel.tsx`, change the `handleStart` catch block from `catch {` to `catch (err) {` and set `setStartError(err instanceof Error ? err.message : 'Failed to start bot')` instead of the hardcoded string. Ref: spec "Start error message surfaced to user", design Decision 1.
