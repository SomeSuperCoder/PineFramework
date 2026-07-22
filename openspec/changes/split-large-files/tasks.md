## 1. Core Engine: Builtins (leaf modules, no dependents)

- [x] 1.1 Split `src/language/runtime/builtins/other-builtins.ts` (~718 lines) into 6 domain modules: `input-builtins.ts`, `table-builtins.ts`, `drawing-builtins.ts`, `alert-builtins.ts`, `array-builtins.ts`, `utility-builtins.ts`; updated `execution-engine.ts` and `builtins/index.ts` barrel
- [x] 1.2 Split `src/language/runtime/builtins/ta-builtins.ts` (~543 lines) into 4 domain modules under `src/language/runtime/builtins/ta/`: `ta-overlap.ts` (sma, ema, hma), `ta-momentum.ts` (rsi, crossover, crossunder, cross, change), `ta-volatility.ts` (sar, atr), `ta-statistics.ts` (highest, lowest, pivothigh, pivotlow, valuewhen); updated barrel

## 2. Core Engine: Expression Executor & Execution Engine

- [x] 2.1 Extract `src/language/runtime/expression-executor.ts` (~724 lines) array-method dispatch into `src/language/runtime/array-methods.ts`
- [x] 2.2 Extract line/box/label/table method dispatch from `expression-executor.ts` into `src/language/runtime/drawing-methods.ts`
- [x] 2.3 Extract type-constructor logic from `expression-executor.ts` into `src/language/runtime/type-constructors.ts`
- [x] 2.4 Update `index.ts` barrel in `src/language/runtime/` with new exports; verify all language tests pass
- [x] 2.5 Clean up `src/language/runtime/execution-engine.ts` (~441 lines) — **skipped**: file is already at target size (451 lines) post-builtin-split; remaining helpers (`parseMapLength` 6 lines, `evaluateArgValue` 21 lines, `initializeStrategy` 20 lines) are tiny, singly-used, and tightly coupled; extraction would add module overhead without reducing complexity

## 3. Core Engine: Parser

- [x] 3.1 Extract statement-parsing methods from `src/language/parser/parser.ts` (~1505 lines) into `src/language/parser/statement-parser.ts`
- [x] 3.2 Extract expression-parsing methods into `src/language/parser/expression-parser.ts`
- [x] 3.3 Extract parser utility helpers (`match`, `check`, `advance`, `consume`, `error`, `peek`, `previous`, `isAtEnd`, `sync`) into `src/language/parser/parser-utils.ts`
- [x] 3.4 Re-export all new modules from `src/language/parser/index.ts`; verify all 1496 tests pass

## 4. Core Engine: Drawing Engine

- [ ] 4.1 Create `src/rendering/primitives/` directory with barrel `index.ts`
- [ ] 4.2 Extract shape/candlestick rendering from `src/rendering/drawing-engine.ts` (~862 lines) into `src/rendering/primitives/candles.ts`
- [ ] 4.3 Extract label rendering into `src/rendering/primitives/labels.ts`
- [ ] 4.4 Extract line/path rendering into `src/rendering/primitives/lines.ts`
- [ ] 4.5 Extract box/rectangle rendering into `src/rendering/primitives/boxes.ts`
- [ ] 4.6 Extract table rendering into `src/rendering/primitives/tables.ts`
- [ ] 4.7 Extract grid/axes rendering into `src/rendering/primitives/axes.ts`
- [ ] 4.8 Update `drawing-engine.ts` to delegate to primitives; verify all tests pass

## 5. Core Engine: Strategy Engine

- [ ] 5.1 Extract position management from `src/strategy/strategy-engine.ts` (~1438 lines) into `src/strategy/position-manager.ts` (Position interface, PositionLot, position operations)
- [ ] 5.2 Extract order management into `src/strategy/order-manager.ts` (Order, FilledOrder, pending orders, order matching)
- [ ] 5.3 Extract trade tracking into `src/strategy/trade-tracker.ts` (Trade, StrategyMetrics, trade lifecycle)
- [ ] 5.4 Extract trailing-stop logic into `src/strategy/trailing-stop.ts` (TrailingStopState, activation check, price update)
- [ ] 5.5 Update `src/strategy/index.ts` barrel with re-exports; verify all tests pass

## 6. Core Engine: Commission Calculator

- [ ] 6.1 Create `src/strategy/commission-methods/` directory with barrel `index.ts`
- [ ] 6.2 Extract percent-fixed commission into `src/strategy/commission-methods/percent-fixed.ts`
- [ ] 6.3 Extract per-order-fixed commission into `src/strategy/commission-methods/per-order-fixed.ts`
- [ ] 6.4 Extract Jupiter Ultra commission into `src/strategy/commission-methods/jupiter-ultra.ts`
- [ ] 6.5 Extract Jupiter Manual commission into `src/strategy/commission-methods/jupiter-manual.ts`
- [ ] 6.6 Extract none commission into `src/strategy/commission-methods/none.ts`
- [ ] 6.7 Simplify `commission-calculator.ts` to delegate to methods; update `src/strategy/index.ts` barrel; verify all tests pass

## 7. Frontend: Chart Data Hook & Components

- [ ] 7.1 Extract data-transformation pipelines from `frontend/src/hooks/useChartData.ts` (~1224 lines) into `frontend/src/hooks/chart-data-transform.ts`
- [ ] 7.2 Extract indicator merge logic into `frontend/src/hooks/indicator-merge.ts`
- [ ] 7.3 Extract alert/shape/line processing into `frontend/src/hooks/chart-alert-processor.ts`
- [ ] 7.4 Simplify `useChartData.ts` to compose the new helpers; verify tests pass
- [ ] 7.5 Split `frontend/src/chart/PineChart.ts` (~919 lines): extract viewport logic into `frontend/src/chart/viewport-manager.ts`, extract plot-series management into `frontend/src/chart/plot-series-manager.ts`
- [ ] 7.6 Split `frontend/src/components/BacktestSettingsPopup.tsx` (~784 lines) into composable sections: `BacktestGeneralSettings.tsx`, `BacktestCommissionSettings.tsx`, `BacktestOrderSettings.tsx`
- [ ] 7.7 Extract layout sections from `frontend/src/App.tsx` (~546 lines) into separate components

## 8. Validation & Cleanup

- [ ] 8.1 Run full test suite across all packages and confirm 100% pass rate
- [ ] 8.2 Verify all barrel re-exports are correct: run `tsc --noEmit` on all packages
- [ ] 8.3 Verify new files are linted and conform to project conventions
- [ ] 8.4 Remove any commented-out or dead code discovered during splits
