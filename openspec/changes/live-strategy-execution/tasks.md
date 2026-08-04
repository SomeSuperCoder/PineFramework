## 1. Live execution plumbing (specs: strategy-execution Live Trading Mode, Strategy State in Live Mode; design D1)

- [ ] 1.1 Add a single-bar context builder helper in `src/api.ts` (e.g. `closedCandleToContext(candle, barIndex)`) reusing the `createSeries` pattern from `barsToContexts`
- [ ] 1.2 Change `StrategyState.engine` in `live-strategy-executor.ts` to hold a compiled `ExecutionEngine`; keep a typed accessor to its internal `StrategyEngine` for markers/position
- [ ] 1.3 Replace `initializeStrategy`'s bare `new StrategyEngine` with `parse` → `compile` → `new ExecutionEngine(compileResult)` from the configured `strategySource`; thread parse/compile errors up as start failures (design D6)

## 2. Warm start (specs: strategy-execution Live mode warm start; design D2)

- [ ] 2.1 Add a per-pair `warmUpComplete` flag on `StrategyState` and a helper to fetch seed history (Bybit/ohlcv cache) for a pair
- [ ] 2.2 Seed each pair's `ExecutionEngine` with `max(300, maxLookback + 1)` historical bars via `executeBars` on start, consuming markers without generating orders
- [ ] 2.3 Set `warmUpComplete` after seeding; expose current warm-up status on the bot snapshot

## 3. Marker → order bridge in the live path (specs: strategy-execution Signal-to-order bridge, Exit-to-order bridge; design D3)

- [ ] 3.1 Rewrite the non-chaos `processCandle` to call `engine.executeBar` with the live candle context and read `result.strategyMarkers`
- [ ] 3.2 Translate `entry(long)` → `buy`, `exit`/`close` → `sell`, attaching `marker`; keep the existing short-signal interpretation (close-if-long, warn-if-flat/short) intact
- [ ] 3.3 Reconcile executor position state from markers each candle (entry/close), removing the now-dead `shouldEnterLong`/`shouldExitLong` stubs

## 4. Execution hardening (specs: strategy-execution Real-Time Position Tracking; design D4)

- [ ] 4.1 Add `timeframe` to `TradeSignal` and fix `updatePositionState` to key on `symbol:timeframe` so post-fill position updates land on the right state
- [ ] 4.2 Replace `walletManager: null as any`, `initialCapital: 0n`, and hardcoded sizing in `bot-engine.ts:initialize` with real config values
- [ ] 4.3 Add guard to ignore duplicate candles (same last-fed barIndex per pair) so the engine is never double-advanced

## 5. Tests (specs: strategy-execution Deterministic live vs backtest, mock-trading-test harness; design D5)

- [ ] 5.1 Unit test: feed the same bar sequence through the live incremental path and through batch `executeBars`; assert identical markers (types, directions, quantities, prices, timestamps)
- [ ] 5.2 Unit test: warm start produces no orders; first live candle continues `ta.ema`/`close[1]`/`var` state from the seed
- [ ] 5.3 Unit test: live path with mock DEX records exactly the orders implied by the strategy markers (extend `mock-trading-test` harness)
- [ ] 5.4 Unit test: strategy source with a parse/compile error fails start with a descriptive error instead of silently starting
- [ ] 5.5 Regression: run existing `live-strategy-executor`, `chaos-*`, and `scheduler` suites; no regressions in chaos mode or the batch chart path

## 6. Verification

- [ ] 6.1 `pnpm build` + `pnpm lint` clean on touched files
- [ ] 6.2 Run full test suite; all new and existing tests green
