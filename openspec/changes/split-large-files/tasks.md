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

- [x] 4.1 Create `src/rendering/primitives/` directory with barrel `index.ts`
- [x] 4.2 Extract drawing types/interfaces into `src/rendering/primitives/drawing-types.ts` (LineObject, BoxObject, LabelObject, TableObject, etc.)
- [x] 4.3 Extract label CRUD operations into `src/rendering/primitives/label-operations.ts` (labelNew/Copy/Get/Set/Delete)
- [x] 4.4 Extract line CRUD operations into `src/rendering/primitives/line-operations.ts` (lineNew/Copy/Get/Set/Delete)
- [x] 4.5 Extract box CRUD operations into `src/rendering/primitives/box-operations.ts` (boxNew/Copy/Get/Set/Delete)
- [x] 4.6 Extract table CRUD operations into `src/rendering/primitives/table-operations.ts` (tableNew/Clear/MergeCells/CellSet/Delete)
- [x] 4.7 Extract linefill/polyline operations into `src/rendering/primitives/linefill-operations.ts`
- [x] 4.8 Update `drawing-engine.ts` (862→210 lines) to delegate to primitives; all 1496 tests pass

## 5. Core Engine: Strategy Engine

- [x] 5.1 Extract all type interfaces into `src/strategy/strategy-types.ts` (Order, FilledOrder, Position, Trade, StrategyMetrics, StrategyConfig, TrailingStopState, StrategyMarker, etc.)
- [x] 5.2 Extract trailing-stop logic into `src/strategy/trailing-stop-manager.ts` (TrailingStopManager class with update/saveState/restoreState/clear); integrated into StrategyEngine
- [x] 5.3 Extract metrics calculation into `src/strategy/strategy-metrics.ts` (pure function computeMetrics)
- [x] 5.4 Position/order/trade management kept in `strategy-engine.ts` (~1148 lines, down from 1438) due to tight state coupling; well-organized by domain sections
- [x] 5.5 Update `src/strategy/index.ts` barrel with re-exports from new modules; all 1496 tests pass

## 6. Core Engine: Commission Calculator

- [x] 6.1 Create `src/strategy/commission-methods/` directory with barrel `index.ts`
- [x] 6.2 Extract percent-fixed commission into `src/strategy/commission-methods/percent-fixed.ts`
- [x] 6.3 Extract per-order-fixed commission into `src/strategy/commission-methods/per-order-fixed.ts`
- [x] 6.4 Extract Jupiter Ultra commission into `src/strategy/commission-methods/jupiter-ultra.ts`
- [x] 6.5 Extract Jupiter Manual commission into `src/strategy/commission-methods/jupiter-manual.ts`
- [x] 6.6 Extract none commission into `src/strategy/commission-methods/none.ts`
- [x] 6.7 Simplify `commission-calculator.ts` (801→353 lines) to delegate to methods; all 1496 tests pass

## 7. Frontend: Chart Data Hook & Components

- [x] 7.1 Extract data-transformation pipelines from `frontend/src/hooks/useChartData.ts` (1224→~370 lines) into `frontend/src/hooks/chart-data-transform.ts`
- [x] 7.2 Extract indicator merge logic into `frontend/src/hooks/indicator-merge.ts`
- [x] 7.3 Extract alert/shape/line processing into `frontend/src/hooks/chart-alert-processor.ts`
- [x] 7.4 Simplify `useChartData.ts` to compose the new helpers; all 12 useChartData tests pass
- [ ] 7.5 Split `frontend/src/chart/PineChart.ts` (~919 lines): extract viewport logic into `frontend/src/chart/viewport-manager.ts`, extract plot-series management into `frontend/src/chart/plot-series-manager.ts`
- [ ] 7.6 Split `frontend/src/components/BacktestSettingsPopup.tsx` (~784 lines) into composable sections: `BacktestGeneralSettings.tsx`, `BacktestCommissionSettings.tsx`, `BacktestOrderSettings.tsx`
- [ ] 7.7 Extract layout sections from `frontend/src/App.tsx` (~546 lines) into separate components

## 8. Validation & Cleanup

- [ ] 8.1 Run full test suite across all packages and confirm 100% pass rate
- [ ] 8.2 Verify all barrel re-exports are correct: run `tsc --noEmit` on all packages
- [ ] 8.3 Verify new files are linted and conform to project conventions
- [ ] 8.4 Remove any commented-out or dead code discovered during splits
