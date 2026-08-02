## 1. Engine Start Preconditions (spec: bot-start-lifecycle)

- [x] 1.1 Add autoSelect precondition check in `BotEngine.start()` (`src/trading/bot-engine.ts`): if `this._config.autoSelect === true`, throw an error with message "auto-select must run before starting; use the Backtest step first" and do NOT proceed to the `Starting` transition. Ref: design Decision 1.
- [x] 1.2 Add a test for the new precondition: `engine.start()` throws when `config.autoSelect` is true, engine state remains `Idle`.

## 2. Post-Backtest Config Persistence (spec: bot-start-lifecycle)

- [x] 2.1 In the `/bot/backtest` route handler (`backend/src/routes/bot.ts:364`), after `engine.configure({...config, autoSelect: false, pairs: [result.best.pair]})`, call `configStore.save(...)` with the same config to persist the final selection to disk. Ref: design Decision 2.
- [x] 2.2 Verify that `GET /api/bot/config` returns the persisted config with `autoSelect: false` and the resolved pairs after a backtest completes.
- [x] 2.3 Add a test: after backtest completes, `configStore.load()` returns `autoSelect: false` and non-empty `pairs`.

## 3. Frontend Error Surfacing (spec: bot-start-lifecycle)

- [x] 3.1 In the Review step's `handleStart` catch block (`TradingBotPanel.tsx:1096`), the error is already set via `setStartError`. Verify the error message from the 400 response is displayed to the user. No code change expected — the existing error display already works.
- [x] 3.2 Manually test: with a stale config (autoSelect true), clicking Start on the Review step shows the error message and re-enables the button.

## 4. Cleanup and Verification

- [x] 4.1 Delete the stale `backend/data/bot-config.json` to reset state, restart backend, run a full Config → Backtest → Review → Start flow, verify no hang.
- [x] 4.2 After step 4.1, restart backend and verify Start on Review step works without re-running backtest (persisted config has autoSelect false).
- [x] 4.3 Run `just check` (typecheck + lint + build) to verify no regressions.
