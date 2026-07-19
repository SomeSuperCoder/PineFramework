# Audit Tasks

## Audit Summary
- **Date:** 2026-07-19
- **Project:** pine-framework
- **Overall Health Score:** 42/100
- **Security Score:** 55/100
- **Architecture Score:** 45/100
- **Code Quality Score:** 35/100
- **Performance Score:** 25/100
- **Test Coverage Confidence:** 30%
- **Maintainability Score:** 30/100
- **Scalability Score:** 25/100

## Task List

### Critical (Fix Immediately)

- [x] **C-001** | [Race Condition / Global State] | `src/strategy/strategy-engine.ts:161-165` | Global mutable `orderIdCounter` causes cross-instance ID collisions
  - **Issue:** `orderIdCounter` is a module-level variable (`let orderIdCounter = 0`). When multiple `StrategyEngine` instances are created (e.g., in a concurrent backtest server), they share the same counter. Worse, `resetOrderIdCounter()` is only called in tests (via `beforeEach`), not in production code. This means parallel executions produce duplicate order IDs, causing data integrity issues in trade records, markers, and order references. The `generateOrderId()` function reads and increments this shared mutable state without any synchronization.
  - **Impact:** Duplicate order IDs across concurrent backtests or real-time sessions. Trade/marker lookup failures. Corrupted strategy state when sessions interleave. Undefined behavior under concurrency.
  - **Fix:** Move `orderIdCounter` into the `StrategyEngine` class as an instance field (`private nextOrderId: number = 0`). Remove the module-level `resetOrderIdCounter()` function. Update `generateOrderId()` to accept the instance counter or make it a method on `StrategyEngine`.
  - **Test:** Create two `StrategyEngine` instances, submit orders to both, verify all IDs are unique.
- **Confidence:** High

- [x] **C-002** | [Incorrect PnL Calculation] | `src/strategy/strategy-engine.ts:751-755` | MAE/MFE calculation uses wrong extreme prices for short positions
  - **Issue:** `getExtremePrice()` returns `{ maxPrice: low, minPrice: high }` for short direction (line 731). Then MAE is computed as `(maxPrice - avgPrice) / avgPrice * 100` (lines 753-755). For shorts, MAE should measure adverse price movement — price moving UP (against short). The max adverse price for a short is `high`, not `low`. The current code uses `maxPrice` (which is `low` for shorts) making MAE always negative or zero for shorts, completely wrong. MFE is similarly wrong.
  - **Impact:** MAE and MFE metrics are completely incorrect for short trades. Trade analysis, risk metrics, and strategy evaluation using these values are unreliable. Backtest reports show meaningless adverse/excursion metrics for short strategies.
  - **Fix:** In `closeOrReducePosition()`, compute MAE and MFE directly without `getExtremePrice()`:
    - Long MAE = `(avgPrice - minPrice) / avgPrice * 100` (adverse = price drops)
    - Long MFE = `(maxPrice - avgPrice) / avgPrice * 100` (favorable = price rises)
    - Short MAE = `(maxPrice - avgPrice) / avgPrice * 100` (adverse = price rises)
    - Short MFE = `(avgPrice - minPrice) / avgPrice * 100` (favorable = price drops)
    Remove `getExtremePrice()` or fix its semantics.
  - **Test:** Test short trade with known high/low values, verify MAE captures upward price move, MFE captures downward move.
- **Confidence:** High

- [x] **C-003** | [Memory Blowup / O(n²) Perf] | `src/index.ts:68-93` | `barsToContext` creates O(n²) memory copies — each bar creates full-length slices
  - **Issue:** `barsToContext()` creates a separate `Series` for each bar, each containing a `slice()` of ALL previous bars for each OHLCV field. For 1500 bars, this creates 1500 Series objects, each with an array growing from 1 to 1500 elements — total ~1.1M array elements stored. The backtest route (`backend/src/routes/backtest.ts:95-104`) uses this pattern directly, so every backtest suffers O(n²) memory. For the max 1500 bars limit, this is ~9MB of redundant data. The `executeBars()` function then iterates these pre-built contexts.
  - **Impact:** Memory usage explodes with bar count. Backtests with 1500 bars use ~9x more memory than needed. Slows down both creation and GC. Limits maximum backtestable bar count. Could cause OOM on memory-constrained deployments.
  - **Fix:** Instead of pre-building all contexts with full slices, build contexts incrementally during the execution loop. Pass only the current bar's values and let the engine maintain series internally (as it already does via `pushBarValues`). Alternatively, use a single `ExecutionContext` that mutates `barIndex` and reuses series arrays. The `ExecutionEngine.executeBars()` already has access to bar data — refactor to accept `Bar[]` instead of pre-built contexts.
  - **Test:** Run backtest with 1500 bars, measure memory usage before and after fix — should drop from O(n²) to O(n).
- **Confidence:** High

- [x] **C-004** | [Equity Calculation Inconsistency] | `src/strategy/backtest-engine.ts:115-121` | `equityCurve` and `equityPoints` use different equity values
  - **Issue:** Line 115: `equityCurve.push(engine.getEquity())` pushes `this.equity` (cash balance only). Line 119: `equityPoints.push({ equity: account.equity })` pushes `account.equity` which is `this.equity + this.position.unrealizedPnl`. These two curves represent different concepts (cash vs total equity) but are both labeled "equity". The drawdown curve is computed from `engine.getMaxDrawdown()` which is based on peak total equity (see `updatePositionPnL` line 941-943). So the drawdown curve is based on total equity, but the equity curve is cash-only, producing a misleading report.
  - **Impact:** Backtest reports show two different "equity" values. Users comparing `equityCurve[i]` against `equityPoints[i].equity` will see different numbers for the same bar. Any code computing drawdown from `equityCurve` will get wrong results. The `computeMonthlyReturns` in BacktestEngine uses `equityPoints` (total equity), but the `computeMonthlyReturns` in the backend route uses its own version also with total equity — at least consistent there, but the internal inconsistency remains.
  - **Fix:** Make `equityCurve` use total equity (matching `account.equity`), or rename one to `balanceCurve`. Add documentation explaining the difference. Fix `BacktestResult` documentation.
  - **Test:** Verify both curves return the same values when no open position exists (unrealizedPnl=0). Verify they differ as expected during open positions.
- **Confidence:** High

- [x] **C-005** | [Forming Candle ATR State Restoration] | `src/language/runtime/execution-engine.ts:2214` | ATR state `values` array is shared by reference across snapshots
  - **Issue:** Line 2214: `preAtrState = new Map([...this.atrState].map(([k, v]) => [k, { ...v }]))` — the spread `{ ...v }` creates a shallow copy of the ATR state object, but `v.values` is a reference to `PineValue[]`. The `preAtrState` copy's `values` property points to the SAME array as the live state. When `computeFormingCandle` executes the bar and pushes to `state.values`, both the pre-state and live state arrays are mutated. After rollback, the state restoration copies back the shallow copy, but the `values` array already contains the extra elements. The `atr_${len}_${...}` key matches, so the restored state reuses the original array reference.
  - **Impact:** ATR values accumulate across forming candle ticks that should be rolled back. Each tick pushes a new value and the rollback fails to remove it, causing ATR to see extra "phantom" data points. This corrupts ATR calculations and any derived indicators. Real-time charts show wrong ATR values.
  - **Fix:** Deep-copy the `values` array: `preAtrState = new Map([...this.atrState].map(([k, v]) => [k, { ...v, values: [...v.values] }]))`. Same fix needed for any other state that has array references inside objects.
  - **Test:** Create a forming candle scenario with ATR(14). Send 15 ticks, verify the ATR value matches a fresh calculation after rollback.
- **Confidence:** High

- [x] **C-006** | [Division by Zero / Infinite Loop Risk] | `src/language/runtime/execution-engine.ts:2666-2676` | For-loop with fractional `step` may never terminate
  - **Issue:** The traditional for-loop uses `for (let i = start; i <= end; i += step)` where `start`, `end`, and `step` are all PineScript values. If `step` is very small or zero, the loop may take extremely long or never terminate. There's no iteration limit (unlike `WhileStatement` which has `maxIterations = 10000`). With `step = 0`, this is an infinite loop. With `step` very close to 0 but positive, floating-point accumulation may cause the condition `i <= end` to never be reached (e.g., `0.1 + 0.2 !== 0.3`).
  - **Impact:** PineScript `for` loops with fractional steps can hang the engine indefinitely, both in backtest and real-time. Denial of service via crafted script. Frozen UI.
  - **Fix:** Add a maximum iteration limit (e.g., 1000000) to `executeForStatement`, matching the pattern used in `executeWhileStatement`. Also guard against `step <= 0` by treating it as 1 or throwing. Use integer arithmetic or counter-based iteration instead of floating-point accumulation.
  - **Test:** Script `for i = 0 to 10 by 0` should either use step=1 or throw an error. Script `for i = 0 to 1 by 0.1` should complete within bounded iterations.
- **Confidence:** High

### High

- [x] **H-001** | [Commission Double-Counting Architecture] | `src/strategy/strategy-engine.ts:608-639` | Pluggable commission charges on EVERY fill, but legacy commission also fires on entry+exit
  - **Issue:** `fillOrder()` calls `calculateCommission(order, fillPrice)` (line 610), which first checks the pluggable calculator, then falls back to legacy. However, `fillOrder()` is called for both entry fills and exit fills. In PineScript, `strategy.entry` commission and `strategy.exit` commission should each charge once. But the commission amount is stored on the `Order` object at creation time (`order.commission = this.config.commission`) and then `fillOrder()` calls `calculateCommission()` which re-computes it and adds it again. This means for a standard round-trip trade, commission is charged at least twice (entry + exit). For `closeOrReducePosition`, trade.pnl is recorded as `pnl - commission` (line 773) where commission is the fill-time commission. But `equity` is also reduced by commission in `fillOrder` (line 638), so equity gets reduced once at fill time and the subtraction in trade PnL isn't redundant — it's recorded correctly. However, if both pluggable and legacy commission are configured, both charge.
  - **Impact:** Trades charged commission twice (entry + exit) which is correct for round-trips. But if pluggable AND legacy methods both fire, double commission. Legacy docs unclear. Each fill charges commission independently — correct for most brokers but must be documented.
  - **Fix:** Add a guard: if `commissionMethod` is set, skip legacy commission calculation entirely (the code does this). Add validation in constructor to warn if both paths are configured. Document the commissioning model clearly.
  - **Test:** Verify that with `commissionMethod: 'percent_fixed'`, the legacy `commission` field is ignored. Verify total commissions equal sum of all fill commissions.
- **Confidence:** Medium

- [x] **H-002** | [Floating-Point Drift in Viewport] | `frontend/src/chart/Viewport.ts:59-61` | `pan()` accumulates floating-point error in `firstBarIndex`
  - **Issue:** `pan(deltaPixels)` computes `deltaBars = deltaPixels / this.state.barSpacing` and subtracts it from `firstBarIndex`. Since `firstBarIndex` is a floating-point number after division, repeated pan operations accumulate rounding errors. `getVisibleRange()` uses `Math.floor(this.state.firstBarIndex)` so fractional parts are truncated, causing the visible range to drift by 1 pixel per pan operation. After many pans, the drift becomes visually noticeable. Also, `firstBarIndex` can become fractional in `setTotalBars`, `scrollTo`, and `zoom` as well.
  - **Impact:** After ~50 scroll operations, the chart's visible range drifts by ~1 bar. Over time, scrolling to the same location yields different visible areas. Users notice the chart position slowly shifting.
  - **Fix:** Store `firstBarIndex` as an integer after every operation by rounding. In `pan()`, compute as `Math.round(this.state.firstBarIndex - deltaPixels)`. In `scrollTo()`, use integer math. In `zoom()`, round the new `firstBarIndex`.
  - **Test:** Write unit tests: pan right 100px, pan left 100px, verify `firstBarIndex` returns to original value. Repeat 100 times, verify drift is 0.
- **Confidence:** High

- [x] **H-003** | [Backtest PnL% Uses Wrong Denominator] | `src/strategy/strategy-engine.ts:773-779` | `pnlPercent` is price change % not return on capital
  - **Issue:** `pnlPercent` is computed as `((price - this.position.avgPrice) / this.position.avgPrice) * 100 * (direction === 'long' ? 1 : -1)`. This measures percentage price change, not the actual return on invested capital. A long trade with 1 contract at $100, exiting at $110, shows 10% PnL% regardless of whether the position used $100 capital (1:1 leverage) or $10 capital (10:1 leverage). In PineScript and real trading, PnL% should be relative to the capital at risk (margin or position value). The `totalPnlPercent` metric is also wrong — it uses `totalPnl / initialCapital * 100`, which is correct for the total portfolio return but inconsistent with individual trade PnL%.
  - **Impact:** Trade-level `pnlPercent` is misleading. A 10% price move with 10:1 leverage should show ~100% return but shows 10%. Users comparing with PineScript or broker reports see inconsistent numbers. Risk management based on this value is unreliable.
  - **Fix:** For trade PnL%, use the margin/capital at risk: `pnl / (avgPrice * quantity / leverage)` or for unleveraged: `pnl / (avgPrice * quantity) * 100`. Or, if margin is 0 (unleveraged), use: `pnl / (position.avgPrice * position.quantity) * 100` which gives the return on the full position value.
  - **Test:** Trade with $100 entry, $10 price move, verify PnL% = 10% for 1:1, higher for leveraged. Trade with marginLong=0.5 (2:1 leverage), verify PnL% doubles.
- **Confidence:** High

- [x] **H-004** | [SMA/EMA/Highest/Lowest O(n) shift() Per Bar] | `src/language/runtime/execution-engine.ts:370-371` | `buf.shift()` is O(n) causing O(n²) overall for sliding windows
  - **Issue:** Every SMA/Highest/Lowest buffer uses `buf.push(val)` then `if (buf.length > len) buf.shift()`. `Array.shift()` is O(n) in JavaScript V8 (re-indexes all remaining elements). For length=100, each bar shift moves 99 elements. Over 1500 bars with multiple SMA calls, this creates millions of unnecessary element moves. Same pattern in `highestBuffers` (line 606), `lowestBuffers` (line 625), `hmaBuffers` (lines 649, 652, 685), `atrState.values` (line 586).
  - **Impact:** Strategies using multiple SMA/EMA indicators see O(n²) runtime degradation. A strategy with 10 SMA(200) calls over 1500 bars performs ~3M element shifts unnecessarily. Real-time forming candle ticks with many indicators are slow. CPU usage scales quadratically with lookback period.
  - **Fix:** Use a circular buffer (ring buffer) with a fixed-size array and head/tail pointers. Replace `push`/`shift` with `buf[pos % len] = val; pos++`. This makes push-and-evict O(1). For `smaBuffers`, maintain a running sum so you don't need to iterate.
  - **Test:** Benchmark SMA(200) over 10000 bars — should drop from ~seconds to <10ms. Verify numeric output matches precisely.
- **Confidence:** High

- [x] **H-005** | [Viewport `pan()` Lacks Boundary Check on Right Edge] | `frontend/src/chart/Viewport.ts:59-61` | Panning right can overshoot totalBars causing blank space at end
  - **Issue:** `pan()` only clamps `firstBarIndex` to `Math.max(0, ...)` preventing left-side bleed, but doesn't prevent right-side bleed. If `firstBarIndex` becomes too negative (panning right when already at end), `getVisibleRange().end` can exceed `totalBars`, and `barIndexToPixel` for bars near the end can return negative pixel values. The chart renders blank space on the right and bars get clipped on the left.
  - **Impact:** Users can scroll past the last bar and see an empty area. Navigation feels broken. The `scrollTo` method (line 43-46) also doesn't clamp right edge — `firstBarIndex` can be > `totalBars - barCount`.
  - **Fix:** Add right-edge clamping: in `pan()` and `scrollTo()`, ensure `firstBarIndex <= Math.max(0, totalBars - barCount)`.
  - **Test:** Pan right past the last bar, verify `firstBarIndex` is clamped. Scroll to index > totalBars, verify clamping.
- **Confidence:** High

- [x] **H-006** | [Analyitics Math uses `NaN` but PineScript expects `na`] | `src/analysis/math-functions.ts:8,28` | Math functions return `NaN` instead of PineScript's `na` (SYMBOL)
  - **Issue:** The analysis layer functions (`highest`, `lowest`, `sum`, `dev`, `variance`, etc.) return JavaScript `NaN` for insufficient-data periods. However, PineScript's runtime uses a Symbol `NA` (`Symbol.for('pine.na')`) as the sentinel. The TAEngine wrappers pass single values to these functions, so they get `[source]` arrays and return `[NaN]` on first call. The `ta-engine.ts` checks `result[result.length - 1] ?? NaN` which returns `NaN`. But then this `NaN` flows back into the PineScript engine's type system where `isNa()` checks `=== NA` (Symbol), not `isNaN()`. The `isValidNumber()` function checks `typeof value === 'number' && !isNa(value)` — a `NaN` would pass this check since `NaN !== NA` and `typeof NaN === 'number'`.
  - **Impact:** Analysis math results that should be `na` show as `NaN` numbers. `isNa()` returns `false` for them. Comparison like `value > 0` returns `false` instead of `false` (since `NaN > 0` is `false`). Plots show `NaN` values which the JSON serializer handles via `pineValueToJSON` (line 9 of execute.ts: `if (typeof v === 'number' && !isFinite(v)) return null`) — but this only works on the backend route, not in the direct engine API.
  - **Fix:** After calling analysis functions, replace `NaN` with `NA` symbol before returning. In `ta-engine.ts` implementations: `return Number.isNaN(result) ? NA : result`.
  - **Test:** Call `ta.lowest(close, 14)` on first 10 bars, verify result is `NA` symbol, not `NaN`.
- **Confidence:** High

- [x] **H-007** | [Backtest Commission% Mismatches PineScript] | `src/strategy/commission-calculator.ts:113-115` | `percent_fixed` uses rate fraction but legacy uses percent
  - **Issue:** The legacy commission path (strategy-engine.ts:690) computes `price * quantity * (commission / 100)` treating `commission` as a percentage. The pluggable `PercentFixedCalculator` computes `tradeValue * rate` treating `rate` as a fraction (0.001 = 0.1%). These two paths are inconsistent — a user migrating from legacy `commission: 0.1` (0.1%) to `commissionMethod: 'percent_fixed'` with `rate: 0.001` expects the same result. But the legacy path does `price * qty * (0.1/100) = price * qty * 0.001` while the pluggable path does `price * qty * 0.001`. They happen to match only when `commission = rate * 100`. This is confusing and undocumented.
  - **Impact:** Users switching from legacy to pluggable commission get different results unless they carefully convert. Difficult to compare backtest results across migration. Risk of misconfiguration.
  - **Fix:** Add a method descriptor for both systems that clearly documents the unit. Better yet, add a `PercentCommissionCalculator` that takes the same percentage value for drop-in replacement. Document the conversion.
  - **Test:** Legacy `commission: 0.1` with `commissionType: 'percent'` should produce identical results to `commissionMethod: 'percent_fixed'` with `rate: 0.001`.
- **Confidence:** High

- [x] **H-008** | [`executeBars()` Returns Wrong `strategyMarkers`] | `src/language/runtime/execution-engine.ts:2134-2169` | Strategy markers are aggregated wrong due to snapshot rollback
  - **Issue:** `executeBars()` creates a local `allMarkers: StrategyMarkerEntry[] = []`, then for each bar, calls `executeBar()` which internally calls `getNewMarkers()` (via `getStrategyMarkers()`). But `getNewMarkers()` checks `this._lastMarkerCount` which is a `StrategyEngine` field. After `executeBar()` returns, `_lastMarkerCount` has advanced past the markers produced for that bar. The next iteration appends the SAME set of markers (since markers accumulated in the engine are cumulative). But actually, `strategyMarkers` in the result from `executeBar` gets all markers from `engine.getNewMarkers()` — which only returns NEW markers since last call. So the accumulation in `executeBars` does capture new markers each time. However, `lastResult` stores `strategyMarkers` from the iterator variable, and the final accumulator adds them to `allMarkers`. If an error occurs midway (line 2158-2160), the function returns early with partial markers, but the error result's strategyMarkers still contains the full set from the last bar. This is confusing but not catastrophic.
  - **Impact:** After an execution error, returned `strategyMarkers` contains markers from the LAST bar only, not all bars. The caller receives inconsistent data.
  - **Fix:** On error, ensure `allMarkers` (which contains markers from all successfully executed bars) is included in the error result, not just the last bar's markers.
  - **Test:** Execute 10 bars with failure on bar 5, verify markers from bars 0-4 are included.
- **Confidence:** Medium

- [x] **H-009** | [`color.from_gradient` Variable Shadowing Bug] | `src/language/runtime/execution-engine.ts:1688-1691` | Variable `g2` conflicts with parameter `g2v`
  - **Issue:** Line 1688: `const [r1, g1, b1] = parseRgb(bot);` — destructures `g1`. Line 1689: `const r = Math.round(r1 + (r2 - r1) * t);` — correct. Line 1690: `const g2v = Math.round(g1 + (g2 - g1) * t);` — `g2` is destructured from `parseRgb(top)` on line 1688 and is correctly named `g2v` in the destructuring, wait, actually line 1688 destructures `[r2, g2, b2]` from `top` — but the variable is named `g2` and line 1690 uses `g2`. BUT the variable on line 1690 is declared as `g2v` using `g2` (from destructuring), so `g2v = Math.round(g1 + (g2 - g1) * t)`. It's confusing but `g2` is properly defined from line 1688. Actually, wait — line 1688: `const [r2, g2, b2] = parseRgb(top);` defines `g2`. Then line 1690: `const g2v = Math.round(g1 + (g2 - g1) * t);` uses `g2` and defines `g2v`. The returned string on line 1692 uses `g2v`. This is actually correct, just poorly named. BUT there's a real bug: the variable on line 1690 is named `g2v` while the one on line 1691 uses `g2` (the destructured name from `parseRgb(top)`). The returned string on line 1692 uses `g2v.toString(16)` which uses the local variable. Actually, let me re-read: line 1692: `` return `#${r.toString(16).padStart(2, '0')}${g2v.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`; `` — uses `g2v` which is `Math.round(g1 + (g2 - g1) * t)`. And `b` — where's `b`? Line 1688: `const [r2, g2, b2] = parseRgb(top);` — `b2` is destructured, then line 1691 uses `b = Math.round(b1 + (b2 - b1) * t)`. But `b` is declared with `const b = ...` on line 1691. That's fine. BUT there's actually NO declared variable `b` in scope before line 1691 — line 1688 declares `b2`, not `b`. So line 1691 creates a new `const b`. So the code works but is confusing. The real problem is that the `b` on line 1692 refers to the `const b` from line 1691, not a destructured `b`. This is OK.
  - **Impact:** No functional bug, but readability is poor. The variable naming is confusing.
  - **Fix:** Rename for clarity: `const [r2, g2, b2] = parseRgb(top);` then `const gOut = Math.round(g1 + (g2 - g1) * t); const bOut = Math.round(b1 + (b2 - b1) * t);` and use `gOut`/`bOut` in the template.
  - **Test:** Verify gradient colors are correct visually.
- **Confidence:** Low (mostly a code quality issue)

### Medium

- [x] **M-001** | [Commission Default Type Inconsistency] | `src/strategy/backtest-engine.ts:51` vs `src/strategy/strategy-engine.ts:133` | `BacktestEngine` defaults `commissionType: 'percent'` but `StrategyConfig` type says it's `CommissionType` which is `'percent' | 'fixed' | 'per_contract' | 'per_order'` 
  - **Issue:** BacktestEngine (line 51) defaults `commissionType: 'percent'` but `DEFAULT_STRATEGY_CONFIG` (strategy-engine.ts:133) doesn't exist — wait, it does. Actually the DEFAULT has `commissionType: 'percent'`. But `BacktestEngine` redefines its own defaults (lines 47-64) instead of spreading `DEFAULT_STRATEGY_CONFIG`. This means changing the default in `DEFAULT_STRATEGY_CONFIG` doesn't propagate to `BacktestEngine`. The defaults are duplicated.
  - **Impact:** Technical debt. Changing defaults requires updating two places. The two sets of defaults can diverge.
  - **Fix:** In `BacktestEngine.constructor`, spread `DEFAULT_STRATEGY_CONFIG` first, then override with `config`. Remove the manual defaults list.
  - **Test:** Verify BacktestEngine with no config produces same defaults as StrategyEngine with no config.
- **Confidence:** High

- [x] **M-002** | [Type `CommissionType` is Duplicated] | `src/strategy/strategy-engine.ts:6` | Two `CommissionType` types exist in different modules
  - **Issue:** `strategy-engine.ts` line 6: `export type CommissionType = 'percent' | 'fixed' | 'per_contract' | 'per_order';` — this is a DIFFERENT type from `src/strategy/commission-calculator.ts` line 10-ish (which doesn't have one). Actually, `commission-calculator.ts` doesn't define a `CommissionType` — it uses `CommissionMethodId`. But `src/language/script-declarations.ts` has its own `CommissionType = 'percent' | 'per_order' | 'per_contract'`. So there are THREE different commission type definitions in the codebase, all with slightly different values. The `strategy-engine.ts` one includes `'fixed'` while `script-declarations.ts` doesn't.
  - **Impact:** Inconsistency across the codebase. Moving between layers requires type casting. A valid commission type in one module may not be recognized in another.
  - **Fix:** Consolidate into a single `CommissionType` in `strategy-engine.ts` (or a shared types module). Have `script-declarations.ts` import from there. Remove duplicate.
  - **Test:** All existing tests pass after consolidation.
- **Confidence:** High

- [x] **M-003** | [FormingCandleManager `tick()` Doesn't Fully Re-execute] | `backend/src/session/FormingCandleManager.ts:31-46` | Tick updates replace bar but only runs `computeFormingCandle` which rolls back state
  - **Issue:** On a tick with existing bar (line 33-37), `tick()` replaces the last bar in the array, rebuilds all contexts (expensive), then calls `computeFormingCandle`. This method saves pre-state, executes, then rolls back. But the rollback restores the PRE-bar-tick state, losing the effect of the new tick's OHLCV update. However, the `diffOutputs` captures the difference, which is returned to the caller. The caller is expected to update its display with the diff. This means the engine's internal state is always rolled back to pre-tick — which is intentional for forming candle diff calculation. But the `bars` array and `contexts` array ARE updated with the new candle data (lines 34-41), so next tick starts from the updated values. This is correct but inefficient — `barsToContext` rebuilds ALL contexts for every tick.
  - **Impact:** Each tick rebuilds every context from scratch (O(n) per tick). For 1500 bars, each tick copies 1500 entries × 5 series = 7500 array entries. This is wasteful but not critical for low-frequency updates.
  - **Fix:** Optimize by only updating the last context in-place instead of rebuilding all of them. Replace `const fullContexts = barsToContext(this.bars); this.contexts[this.contexts.length - 1] = fullContexts[fullContexts.length - 1]!;` with a direct update of the last context's OHLCV series.
  - **Test:** Tick updates produce same diffOutputs with optimized code.
- **Confidence:** High

- [x] **M-004** | [Backtest Buy & Hold Uses Close-Close Only] | `src/strategy/backtest-engine.ts:218-223` | `computeBuyHoldReturn` only uses first and last close, ignoring dividends/splits
  - **Issue:** Buy & Hold return = `((lastClose - firstClose) / firstClose) * 100`. This is a simple price return, not a total return. It doesn't account for reinvested dividends, stock splits, or corporate actions. It also assumes buying exactly at first bar close and selling at last bar close, which doesn't match a realistic buy-and-hold strategy (which would buy at first bar open).
  - **Impact:** Buy & Hold return is a rough approximation, not comparable to a real buy-and-hold benchmark. Users comparing strategy returns "vs buy & hold" get misleading comparisons.
  - **Fix:** Compute buy & hold using the first bar open (entry) and last bar close (exit), matching a market-order buy-and-hold. Consider adding dividend data when available.
  - **Test:** Simple 2-bar case: buy at open=100, sell at close=110, B&H return should be 10%.
- **Confidence:** Medium

- [x] **M-005** | [Backtest `computeMonthlyReturns` Misses Months Between Trades] | `src/strategy/backtest-engine.ts:197-216` | Only records months where equity changes occur
  - **Issue:** `computeMonthlyReturns` iterates `equityPoints` (one per bar) and records the first equity value encountered in each month. It only records months present in the data. If there are no trades/equity changes in a month, that month is missing from the result entirely. A user wouldn't know if a month had 0% return or if data is missing.
  - **Impact:** Monthly returns dictionary may have gaps (missing months). Users can't distinguish 0% return months from absent data. Analysis that sums monthly returns will get incorrect totals.
  - **Fix:** Iterate over all months in the date range, filling missing months with 0% return.
  - **Test:** Strategy over Jan-Mar with only Feb trades, verify all three months appear with Jan/Mar at 0%.
- **Confidence:** High

- [x] **M-006** | [Indicator Plot Data Extension Assumes Continuous Last Value] | `frontend/src/components/ChartComponent.tsx:143-152` | Fills missing plot data by repeating last value, possibly incorrectly
  - **Issue:** When a plot has fewer data points than the OHLCV data (lines 143-152), the code extends the series by repeating the last point's value for all remaining bars. This assumes the indicator value remains constant from its last computed point to the end. But the gap could be at the BEGINNING (indicator starts later than bar 0) or MIDDLE. The code always fills at the END, which is wrong for pre-2010 indicators on 2020 data.
  - **Impact:** Charts show incorrect indicator values for bars before the indicator started computing. The line appears flat at the first computed value for early bars. Visually misleading.
  - **Fix:** Pad with `null` (no display) instead of repeating the last value. The chart renderer should handle null values gracefully (skip connecting line segments).
  - **Test:** Indicator with 50 values over 100 bars should show a gap in the first 50 bars, not a flat line at the first indicator value.
- **Confidence:** High

- [x] **M-007** | [SAR State Keys Collide Across Instances] | `src/language/runtime/execution-engine.ts:445` | SAR always uses key `'sar'` regardless of instance
  - **Issue:** The SAR state key is hard-coded as `'sar'` (line 445). All other TA functions (SMA, EMA, RSI, etc.) use `this.currentCallSiteId` as part of their key, so multiple calls to `ta.sma(close, 14)` at different call sites don't interfere. But SAR ignores `callSiteId`, meaning if a script calls `ta.sar()` from two different places, they share the same state, producing wrong results. Also, multiple Engine instances share nothing (they're separate objects), so that part is fine. But within one script/multiple calls, SAR collides.
  - **Impact:** Multi-SAR strategies produce corrupted SAR values. Charts show incorrect Parabolic SAR when used in multiple contexts.
  - **Fix:** Use `sar_${this.currentCallSiteId}` as the key, matching the pattern of other TA functions.
  - **Test:** Two SAR calls with different parameters should maintain independent state.
- **Confidence:** High

- [x] **M-008** | [Unhandled `na()` Function Call Inconsistency] | `src/language/runtime/execution-engine.ts:1453-1455,3054-3066` | `na()` builtin is a function but also passed through as identifier
  - **Issue:** There are TWO `na()` implementations: one as a registered builtin (line 1453) that calls `isNa(value)`, and one in `executeCallExpression` (lines 3054-3066) that handles `NaLiteral` callee and falls back to `isNa(args[0] ?? NA)`. If the callee is `NaLiteral`, the second path runs. If the callee is `Identifier('na')`, the first path runs (line 3036). The `parse` layer determines which AST node is produced for `na(...)`. If the parser produces different node types for `na(x)` vs `na(close)`, the behavior differs. The second path has a bug: the fallback on line 3066 calls `isNa(args[0] ?? NA)` where `args` is computed from line 3055 `const args = expr.arguments.map(...)` but `args` is computed BEFORE line 3057's `namedArgs` — that's fine. But if there's no `NaLiteral` match and the builtin lookup for `'na'` fails (line 3060), it falls through to `isNa(args[0] ?? NA)`. But line 3060 should always succeed since `'na'` is registered.
  - **Impact:** Redundant code path. If the builtin registration is ever removed or renamed, the fallback provides silent wrong behavior.
  - **Fix:** Remove the fallback on line 3066 and let it throw if `na` is not found as a builtin. Keep the `member expression` handler for `NaLiteral` only.
  - **Test:** `na(close)` should return `true` for the first bar and `false` otherwise. Both identifier and NaLiteral parse paths produce same result.
- **Confidence:** Medium

- [x] **M-009** | [Backtest Route Uses `executeBars` Which Re-creates Engine Per Batch] | `backend/src/routes/backtest.ts:115-126` | Batch execution creates redundant work
  - **Issue:** The backtest route batches contexts into groups of 100 and calls `executeBars()` for each batch. But `executeBars()` creates an `ExecutionResult` with full output snapshots for every batch, and only the last batch's result is used (line 117: `execResult = execEngine.executeBars(batch)`). The intermediate results are discarded. Moreover, the `await new Promise(r => setTimeout(r, 50))` in the batch loop (line 124) adds artificial 50ms delays between batches, making the overall backtest 750ms slower for no good reason (1500 bars / 100 batch = 15 batches × 50ms = 750ms).
  - **Impact:** Backtests are artificially slowed by 50ms × number-of-batches. The async delay doesn't yield to any other work since Node.js is single-threaded for this CPU-bound task. The delay doesn't improve responsiveness.
  - **Fix:** Remove the artificial 50ms delay. Use `executeBars(contexts)` directly (no batching) since the engine already handles all bars. Remove the batching logic entirely.
  - **Test:** Backtest with 1500 bars completes in same or less time as before.
- **Confidence:** High

- [x] **M-010** | [Profit Factor Infinity/Division Edge Cases] | `src/strategy/strategy-engine.ts:1050` | Profit factor returns Infinity when grossLoss=0
  - **Issue:** Line 1050: `profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0`. When `grossLoss === 0` and `grossProfit > 0`, profit factor is `Infinity`. The backend route (backtest.ts:169) calls `sanitize(metrics.profitFactor)` which converts `Infinity` to `0` via `Number.isFinite(v) ? v : 0`. This silently replaces Infinity with 0, which is wrong — a strategy with no losing trades should show Infinity or a very large number, not 0.
  - **Impact:** Perfect strategies (no losses) show profit factor as 0 instead of Infinity. This is misleading and could cause users to think the strategy is terrible.
  - **Fix:** In the backend route, when profit factor is Infinity, either keep it as `null` (with documentation) or use a sentinel like `-1` or a very large number. Update the API contract to document this case. In the frontend, display "∞" when profit factor is Infinity.
  - **Test:** Strategy with 5 winning trades and 0 losing trades shows profit factor as Infinity or documented sentinel.
- **Confidence:** High

### Low

- [x] **L-001** | [Alert Conditions Are Accumulated Without Cleanup] | `src/language/runtime/execution-engine.ts:224` | `alertConditionEntries` and `alertTriggers` grow unbounded
  - **Issue:** `alertConditionEntries` and `alertTriggers` arrays are never cleared or bounded. Every bar that triggers an alert condition adds an entry. Over a long backtest or continuous real-time session, these arrays grow without bound, leaking memory.
  - **Impact:** Memory leak in long-running sessions. Backtests with many alerts consume increasing memory.
  - **Fix:** Add a maximum size (e.g., 1000 entries) and trim oldest when exceeded. Or, for `alertTriggers`, only keep the last N entries and return the full set in the execution result (which the FormingCandleManager consumes). The backend should not accumulate triggers indefinitely.
  - **Test:** Run a strategy that triggers alerts on every bar for 5000 bars, verify memory doesn't grow beyond the cap.
- **Confidence:** High

- [x] **L-002** | [Backtest Date Filtering `undefined` Non-null Assertions] | `src/strategy/backtest-engine.ts:86,89` | Uses `this.config.startDate!` with non-null assertion after undefined check
  - **Issue:** Lines 85-90: `if (this.config.startDate !== undefined) { filteredBars = filteredBars.filter((b) => b.timestamp >= this.config.startDate!) }`. The `!` is a lie — TypeScript knows `startDate` could be `undefined` from the `BacktestConfig` type (line 37: `startDate?: number`). While the check ensures it's defined, it's a code smell. The same for `endDate`.
  - **Impact:** No runtime issue, but hides potential type errors. If someone changes the `BacktestConfig` type, the non-null assertion could mask the undefined case.
  - **Fix:** Use a local const: `const startDate = this.config.startDate; if (startDate !== undefined) { ... b.timestamp >= startDate ... }`.
  - **Test:** All existing backtest tests pass.
- **Confidence:** Medium

- [x] **L-003** | [FormingCandleManager.confirm() Skips Last Bar When Timestamp Already Confirmed] | `backend/src/session/FormingCandleManager.ts:53-62` | Edge case: confirm called for already-confirmed bar doesn't update lastConfirmedTimestamp
  - **Issue:** On line 54: `if (bar.timestamp <= this.lastConfirmedTimestamp)` — if a bar with the same timestamp as the last confirmed bar arrives again, the method replaces the bar data and runs `computeFormingCandle` but does NOT update `lastConfirmedTimestamp`. This seems fine for a re-confirm. But what if the bar's timestamp is LESS than `lastConfirmedTimestamp` (older bar)? It still runs the forming candle path, but the bar data has already been replaced with the closing price of that old bar. The `lastConfirmedTimestamp` isn't updated, so future confirmations with a timestamp between the old bar and the new bar could be missed. This is a very edge case and unlikely in normal operation, but shows the logic is fragile.
  - **Impact:** Under unusual data arrival order (e.g., delayed data), the confirmation logic could miss bars or process them incorrectly.
  - **Fix:** Add a guard for the `bar.timestamp < this.lastConfirmedTimestamp` case: emit a warning and skip. Only allow re-confirm of the most recent bar (timestamp === lastConfirmedTimestamp).
  - **Test:** Send a stale bar (older timestamp), verify it's rejected.
- **Confidence:** Low

- [x] **L-004** | [`plot` Builtin Uses Title Heuristic That May Conflict] | `src/language/runtime/execution-engine.ts:3025-3033` | heuristically assigns default title from first argument identifier name
  - **Issue:** Lines 3025-3033: if a `plot()` call has no named `title` and the first argument is an `Identifier` node, the code assigns `namedArgs.title = firstArg.name`. This means `plot(close)` becomes equivalent to `plot(close, title='close')`. But what about `plot(close + high)`? The first argument is a `BinaryExpression`, not an `Identifier`, so no title is set (line 3026: `if (funcName === 'plot' && !namedArgs.title) { const hasPositionalTitle = expr.arguments.length > 1 && expr.arguments[1]!.kind === 'StringLiteral'; if (!hasPositionalTitle && expr.arguments.length > 0) { const firstArg = expr.arguments[0]; if (firstArg.kind === 'Identifier') { namedArgs.title = firstArg.name; } } }`). This means the auto-title only works for simple `plot(close)` but not `plot(close + high)`. Users get inconsistent plot titles.
  - **Impact:** Some plots get auto-titles, others get generic "plot" title. UI shows confusing labels.
  - **Fix:** Use a more descriptive auto-title based on the expression text, or always require explicit titles. At minimum, document the behavior.
  - **Test:** `plot(close + high)` should not silently use a bad title.
- **Confidence:** Medium

- [x] **L-005** | [`str.plot()` Not a Real Function] | `src/language/runtime/execution-engine.ts:3464-3467` | `plot` as member of `str` namespace incorrectly handled
  - **Issue:** Lines 3464-3467: `if (objName === 'plot') { return expr.property; }` — This handles `plot.xxx` member expressions by returning `expr.property` as a string. This is wrong — there is no `plot` namespace object in PineScript. This is likely dead code or a misinterpretation. If a user writes `plot.something`, it would return the property name string instead of throwing an error.
  - **Impact:** Silent wrong behavior for invalid `plot.xxx` syntax. The user gets a string instead of a compile error.
  - **Fix:** Remove this code path or handle it only if `plot` is a known builtin namespace. Let the undefined variable error occur naturally.
  - **Test:** `plot.nonexistent` should throw a compile or runtime error, not return a string.
- **Confidence:** High

- [x] **L-006** | [`ema` Initialization Uses `source.Value` Not SMA] | `src/language/runtime/execution-engine.ts:388-396` | EMA first value is raw source, not SMA as in standard PineScript
  - **Issue:** Line 391: `this.emaState.set(key, { prev: source as number, initialized: false }); return source as number;` — The first EMA value is initialized with the raw source value, not with an SMA of the first `length` values. In TradingView's PineScript, EMA seeds with SMA(source, length) for the first `length-1` bars. This implementation uses the first source value directly, which gives different EMA values for the early bars.
  - **Impact:** EMA values differ from TradingView's output for the first `length` bars. Cross-verification with PineScript fails. Users comparing strategies across platforms see discrepancies.
  - **Fix:** Accumulate the first `length` values and compute their average as the EMA seed. Return `NA` for the first `length-1` bars, matching PineScript behavior.
  - **Test:** EMA(close, 5) on first 6 bars should match TradingView's output within 0.01%.
- **Confidence:** High

- [x] **L-007** | [Plot Colors Array Length Grows Unbounded] | `src/language/runtime/execution-engine.ts:997-1000` | `plotColors` arrays grow with every bar call including forming candle re-execution
  - **Issue:** Each call to `plot()` pushes a color value to `plotColors[key]`. In `computeFormingCandle`, the pre-state saves `plotColors` and restores it after execution, but the output snapshot (`diffPlotColors`) directly references the slice. The state restoration (line 2343) sets `this.plotColors = prePlotColors` which replaces the map. However, the colors that were pushed during the forming candle execution are discarded via the map reassignment. But for `executeBar` (full execution), every push is permanent.
  - **Impact:** No actual bug, but the pattern is fragile. If any code path fails to restore `plotColors`, the arrays grow without bound.
  - **Fix:** No immediate fix needed, but add comments documenting the lifetimes and state management contract for all mutable arrays.
  - **Test:** Existing tests pass.
- **Confidence:** Low

- [x] **L-008** | [Frontend `ChartComponent` Ignores `fetchError` Return Value] | `frontend/src/components/ChartComponent.tsx:86` | The `fetchOlderOHLCV` promise result is ignored
  - **Issue:** Line 86: `await fetchRef.current(sy, iv);` — the function `fetchOlderOHLCV` returns `Promise<number>` (the number of bars fetched) but the return value is ignored. The `isLoadingHistoryRef` flag is set false in `finally`, but if the fetch was triggered by one `onRangeChange` call and another fires before the first completes, the `finally` block on line 87-89 will set `isLoadingHistoryRef = false` for the first call, then the second call's `finally` also sets it false. The guard on line 88 `if (!isLoadingHistoryRef.current) return;` is a no-op since it always returns after setting to false.
  - **Impact:** The loading guard is ineffective. If `onVisibleRangeChange` fires rapidly, multiple concurrent fetches can occur, causing data races.
  - **Fix:** Use an AbortController or a sequential queue. Or use a counter-based guard (`loadingCounter++ / loadingCounter--`) instead of a boolean.
  - **Test:** Simulate rapid scrolling past the load boundary, verify only one fetch is in flight at a time.
- **Confidence:** Medium

- [x] **L-009** | [Backtest Route's `buildEquityCurve` Uses Only Trade PnL] | `backend/src/routes/backtest.ts:322-330` | Doesn't account for open position unrealized PnL
  - **Issue:** `buildEquityCurve` starts at `initialCapital` and adds realized PnL from closed trades. It doesn't include unrealized PnL from open positions. The resulting equity curve jumps only when trades close, rather than showing continuous equity changes as the market moves. The `BacktestEngine`'s own `equityCurve` also doesn't include unrealized PnL (just `engine.getEquity()`, which is cash balance). So both curves have the same limitation.
  - **Impact:** Equity curves look like stair-steps (flat during open positions, jump on close). Users can't see drawdowns during open positions. Max drawdown may be understated.
  - **Fix:** Include unrealized PnL in equity curve values. Use `account.equity` (which includes unrealized PnL) instead of `engine.getEquity()`.
  - **Test:** Compare equity curves from BacktestEngine vs. manual calculation with unrealized PnL included.
- **Confidence:** High

### Suggestions

- [ ] **S-001** | [Architecture] | `src/language/runtime/execution-engine.ts` | Monolithic 3660-line ExecutionEngine should be decomposed
  - **Issue:** `ExecutionEngine` is a single file with 3660 lines handling: builtin function registration (100+ functions), AST interpretation, state management (snapshot/rollback), bar execution, forming candle diff computation, and all PineScript runtime operations. It has 30+ instance-level Maps and arrays for various state. This violates the Single Responsibility Principle and makes the code extremely difficult to understand, test, and maintain.
  - **Impact:** High cognitive load for developers. Bugs in state management (like the ATR values reference issue C-005) are hard to spot. Adding new features risks breaking existing functionality.
  - **Fix:** Decompose into separate modules:
    - `builtins/` directory with one file per category (math.ts, ta.ts, str.ts, color.ts, plot.ts, etc.)
    - `state-manager.ts` for snapshot/rollback logic
    - `interpreter.ts` for AST walking
    - `forming-candle.ts` for diff computation
  - **Test:** No behavioral change, just refactoring. All existing tests must pass.
- **Confidence:** High

- [ ] **S-002** | [Architecture] | `src/analysis/` | TAEngine registers functions that create single-element arrays for every call — wasteful
  - **Issue:** Every TAEngine function wrapper creates a `[source]` (single-element) array and calls the underlying analysis function which returns a full array result, then picks the last element. This is ~100x overhead per call (creating arrays, running loops for `length` on single elements, returning full arrays, indexing). The analysis layer was designed for batch array processing but is being used for per-bar scalar calls.
  - **Impact:** ~100x more computation than necessary for each TA function call. O(n²) in practice since each call loops through `length` elements (e.g., SMA(200) loops 200 times for a single value).
  - **Fix:** Add scalar versions of all TA functions (e.g., `smaScalar(value, length, buffer)`). Or use the ExecutionEngine's builtins (which already have correct O(1) per-bar behavior with ring buffers) instead of the analysis layer for PineScript execution.
  - **Test:** `ta.sma(close, 100)` returns same value from both analysis and execution-engine paths.
- **Confidence:** High

- [ ] **S-003** | [Architecture] | `src/strategy/commission-calculator.ts` | Abstract commission calculator pattern is over-engineered for the current needs
  - **Issue:** The pluggable `CommissionCalculator` interface with registries, descriptors, and UI field schemas adds significant complexity for what should be simple arithmetic. The legacy system (`price * qty * rate / 100`) is 1 line. The new system is ~335 lines with interfaces, registries, descriptors, and 5 implementations (2 identical to legacy, 2 for Jupiter DEX, 1 for none). The Jupiter-specific calculators (`jupiter_ultra`, `jupiter_manual`) are domain-specific and likely unused by 99% of users.
  - **Impact:** 335 lines of mostly dead code. Increased maintenance burden. Confusion between legacy and pluggable systems.
  - **Fix:** Simplify to a single commission calculation method type with parameters. Remove Jupiter-specific calculators (they can be added as plugin extensions). Use a single function instead of interface+registry.
  - **Test:** All commission tests pass with simplified implementation.
- **Confidence:** Medium

- [ ] **S-004** | [Testing] | `tests/` | Critical areas have no test coverage
  - **Issue:** Analysis of test coverage reveals:
    - `FormingCandleManager`: only 2 backend tests exist (`forming-candle.test.ts`, `realtime-execution.test.ts`) — insufficient coverage
    - `CommissionCalculator`: only unit test exists, no integration test with StrategyEngine
    - `Viewport`: no dedicated unit tests (only via interaction-handler tests)
    - `PineChart`: no dedicated tests
    - `barsToContext`: not tested
    - `computeFormingCandle`: only basic backend tests
    - `math-functions.ts`: no tests at all
    - `moving-averages.ts`: no tests at all
    - `oscillators.ts`: no tests at all
    - `BacktestEngine.run`: only 1 test with 3 sub-tests covering basic path
  - **Impact:** Regressions are undetectable. Refactoring is dangerous. Bugs like C-002 (MAE wrong for shorts) survive because no test exercises that path.
  - **Fix:** Add unit tests for:
    1. All math-functions with edge cases (zero-length, NaN inputs, single-element)
    2. All moving-averages with known-answer tests
    3. All oscillators with TradingView-comparison test vectors
    4. `computeFormingCandle` rollback for every TA function state
    5. `Viewport` boundary conditions (negative scroll, over-scroll)
    6. BacktestEngine with short trades, verifying MAE/MFE
  - **Test:** The new tests themselves become the test infrastructure.
- **Confidence:** High

- [ ] **S-005** | [Performance] | `src/analysis/math-functions.ts:3-19` | `highest`/`lowest` recompute from scratch each bar (O(n²))
  - **Issue:** All window functions (`highest`, `lowest`, `sum`, `dev`, `variance`, `rank`, `quantile`, etc.) recompute the entire window from scratch for each bar by looping over the last `length` elements. This is O(n × length) = O(n²) when n >> length. For length=200 and n=1500, each bar loops 200 times = 300K iterations.
  - **Impact:** Slow backtests for strategies using these functions. Unnecessary CPU usage in real-time.
  - **Fix:** Use sliding window algorithms: maintain a deque of values, update incrementally. For `highest`/`lowest`, a monotonic deque gives O(1) amortized per bar. For `sum`, maintain a running sum. For `dev`/`variance`, use Welford's online algorithm.
  - **Test:** Results must match within floating-point tolerance. Benchmark shows O(n) instead of O(n²).
- **Confidence:** High

- [ ] **S-006** | [Type Safety] | `src/strategy/backtest-engine.ts:25,29` | `direction: string` should be `PositionDirection` type
  - **Issue:** `BacktestResult.positions[].direction` is typed as `string` (line 25) but the actual value is `PositionDirection` ('flat' | 'long' | 'short') from `strategy-engine.ts`. The `equityPoints` also uses `balance: number` (line 14) but this is always the same as `equity` — not actually a separate balance concept.
  - **Impact:** Type system doesn't catch invalid direction assignments. Users of the API don't know valid direction values.
  - **Fix:** Import `PositionDirection` from strategy-engine.ts and use it. Remove `balance` from `EquityPoint` since it's always equal to `equity`.
  - **Test:** TypeScript compilation succeeds with no errors.
- **Confidence:** Medium

- [ ] **S-007** | [Documentation] | `src/` | Major public APIs lack JSDoc comments
  - **Issue:** The following public APIs have no or minimal documentation:
    - `barsToContext()` — no description of the O(n²) memory behavior
    - `FormingCandleManager` — no documentation of the tick/confirm lifecycle
    - `BacktestEngine.run()` — no docs on the strategyFn callback contract
    - `CommissionCalculator.calculate()` — no docs on the expected return value unit
    - `ExecutionEngine.executeBars()` — no docs on batch processing behavior
    - `Series.push()` — no docs on the fact that it appends indefinitely
  - **Impact:** Developers must read source code to understand behavior. Subtle contracts (like state rollback in forming candle mode) are easily missed.
  - **Fix:** Add JSDoc comments to all public API methods, especially describing invariants, side effects, and expected behavior.
  - **Test:** N/A — documentation only.
- **Confidence:** High

- [ ] **S-008** | [Error Handling] | `src/language/runtime/execution-engine.ts:2102-2131` | Error handler shadows the original error stack trace
  - **Issue:** Line 2106: `console.error(\`[ExecutionEngine] Error at bar ${context.barIndex}: ${error instanceof Error ? error.message : String(error)}\`)` — logs only the error message, not the full stack trace. The returned error object (line 2115) also only includes the message. Lost stack traces make debugging impossible.
  - **Impact:** When a PineScript execution error occurs, developers have no way to trace the origin. Debugging user scripts is extremely difficult.
  - **Fix:** Include the full error stack in the error response. Log the full error with `console.error(error)` (not just the message). Add a `stack` field to `ExecutionResult`.
  - **Test:** Trigger a runtime error in a script, verify full stack trace is available.
- **Confidence:** High

- [ ] **S-009** | [Concurrency] | `backend/src/session/FormingCandleManager.ts:11` | FormingCandleManager is not safe for concurrent tick/confirm calls
  - **Issue:** `FormingCandleManager.tick()` and `confirm()` mutate `this.bars`, `this.contexts`, and call `this.engine` methods. If called concurrently (e.g., two WebSocket messages arrive simultaneously), the state can be corrupted. There are no locks, mutexes, or async guards.
  - **Impact:** Racy updates to candle data can produce wrong indicator values, corrupted internal state, or engine crashes under real-time data load.
  - **Fix:** Add a simple mutex or queue for tick/confirm operations. Use a single-threaded event loop pattern (Node.js is single-threaded for CPU, but async interleaving can still cause issues if `tick()` is called while `confirm()` is awaiting). Use a task queue.
  - **Test:** Fire 100 concurrent tick/confirm calls, verify final state is consistent.
- **Confidence:** Medium

- [ ] **S-010** | [Performance] | `frontend/src/components/ChartComponent.tsx:221-223` | Building ohlcvMap on every render is O(n) and unnecessary
  - **Issue:** Every time the chart data or script results change (the `useEffect` dependency array), the code builds a full `ohlcvMap` from the data array (lines 221-223) and then, for each shape marker, searches the data array by iterating (lines 231-237). The `ohlcvMap` is a `Map<number, CandlestickData>` keyed by timestamp, but then the code does a linear scan `for (let i = 0; i < data.length; i++) { if (data[i] === candle) { barIdx = i; break; } }` which defeats the purpose of the map. This is O(n × m) where n = data length and m = shape count.
  - **Impact:** Slow rendering with many shapes/markers. UI freezes on large datasets.
  - **Fix:** Build the map as `Map<number, number>` (timestamp → index) in one pass. Then use `ohlcvIdxMap.get(s.time)` for O(1) lookup. Remove the linear scan entirely.
  - **Test:** Dataset with 1000 bars and 2000 shapes renders in < 50ms.
- **Confidence:** High

- [ ] **S-011** | [Dependency Risk] | `backend/src/session/FormingCandleManager.ts:1` | Import uses `'pine-framework'` package name from monorepo
  - **Issue:** The backend imports from `'pine-framework'` which resolves via `node_modules` symlinks (workspaces). If the workspace link is broken (e.g., `npm install` re-run, pnpm lock regression), the imports silently fail at runtime. There's no fallback or validation.
  - **Impact:** Runtime crashes on startup if workspace links are broken. Hard to debug.
  - **Fix:** Use relative imports (e.g., `../../src/index.js`) or add a startup check that validates `require.resolve('pine-framework')` resolves to the expected local path.
  - **Test:** Remove `node_modules/pine-framework` symlink, verify startup error is clear and actionable.
- **Confidence:** Medium

- [ ] **S-012** | [Edge Case] | `src/language/runtime/execution-engine.ts:2952-2953,2955-2956` | Division by zero returns `NA` but should return `+Inf` or `-Inf` in PineScript
  - **Issue:** PineScript's `/` operator returns `±Infinity` when dividing by zero (matching IEEE 754), not `na`. The implementation returns `NA` on line 2952: `if ((right as number) === 0) return NA;`. Same for `%` on line 2955. This breaks PineScript compatibility. TradingView's PineScript returns `+Inf`, `-Inf`, or `NaN` depending on the operands.
  - **Impact:** Indicators that divide by zero (e.g., in edge cases) get `na` instead of `Infinity`, producing wrong chart values compared to TradingView.
  - **Fix:** Follow IEEE 754: `return (left as number) / (right as number)` without the guard. JavaScript division already returns `Infinity` for `/0`.
  - **Test:** `x / 0` returns `Infinity`. `-x / 0` returns `-Infinity`. `0 / 0` returns `NaN`.
- **Confidence:** High
