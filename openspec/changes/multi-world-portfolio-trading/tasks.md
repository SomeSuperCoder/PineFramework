# Tasks — multi-world-portfolio-trading

## B. Backend

- [ ] B1: Top-N + PnL>0 gate in `AutoMarketSelector.select` — filter positive PnL before truncation; return typed `{ blocked: true }` on zero positives; unit tests for N>qualifying, zero-positive, normal cases
- [ ] B2: Parallel backtests — p-limit (~4) around per-candidate fetch+backtest in `select()`; deterministic post-collection ranking; tests
- [ ] B3: Config v2 — `worlds` list in bot-config.json + legacy migration; strategy-state.json schemaVersion:2 with legacy-key recovery; migration tests against legacy fixtures
- [ ] B4: Multi-world executor — world-keyed states `${symbol}:${timeframe}:${strategyId}`, per-world order mutexes, N concurrent worlds in one engine; wire `bot.ts` completion handler to persist worlds and consume `{blocked}` payload
- [ ] B5: CapitalAllocator — PnL-weighted split, largest-remainder rounding, DI into sizing seam (`positionFraction`); property test: allocations sum to capital, example 4/6/10 case locked

## F. Frontend

- [ ] F1: UX flow design — wizard restructure spec (strategies → backtest-all → ranking → allocation → review), block-state CTA
- [ ] F2: SetupWizard rework — new steps array, progression gate blocking on zero-positive worlds, "go back and pick another strategy"
- [ ] F3: StrategyMultiSelect + world list builder (tf+sym+stg rows)
- [ ] F4: AutoSelectGrid rework — design-token styling, auto-scroll to active symbol, shared subcomponents extraction
- [ ] F5: WorldRankingPanel (PnL sort, N picker) + CapitalAllocationPanel (weighted USDC split display)

## V. Verification

- [ ] V1: Test Engineer — backend unit/integration suite (B1–B5) GREEN
- [ ] V2: Playwright user-flow — full wizard journey incl. zero-positive block, top-N selection, allocation sum display
- [ ] V3: Code Reviewer OR QA verdict (pick one) on the combined diff
