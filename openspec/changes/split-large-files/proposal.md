## Why

Several source files in the pine-framework monorepo exceed 700 lines (with the largest at 1505 lines). These monolithic files are hard for AI coding assistants to process in a single context window, slow down code reviews, increase merge conflicts, and make it difficult to reason about individual responsibilities. Splitting them into focused modules preserves the project's ability to evolve with AI-assisted development.

## What Changes

- Split `src/language/parser/parser.ts` (~1505 lines) — extract statement-parsing methods into `statement-parser.ts`, expression-parsing into `expression-parser.ts`, and utility helpers into `parser-utils.ts`
- Split `src/strategy/strategy-engine.ts` (~1438 lines) — extract position management into `position-manager.ts`, order management into `order-manager.ts`, trade tracking into `trade-tracker.ts`, and trailing-stop logic into `trailing-stop.ts`
- Split `frontend/src/hooks/useChartData.ts` (~1224 lines) — extract data transformation pipelines into `chart-data-transform.ts`, indicator merge logic into `indicator-merge.ts`, and alert/shape processing into `chart-alert-processor.ts`
- Split `src/rendering/drawing-engine.ts` (~862 lines) — separate each drawing primitive (lines, labels, boxes, tables, shapes) into its own module under `src/rendering/primitives/`
- Split `src/language/runtime/expression-executor.ts` (~724 lines) — extract array-method dispatch into `array-methods.ts`, line/box method dispatch into `drawing-methods.ts`, and type-constructor logic into `type-constructors.ts`
- Split `src/language/runtime/builtins/other-builtins.ts` (~718 lines) — extract into per-domain modules: `array-builtins.ts`, `color-builtins.ts`, `time-builtins.ts`, `math-builtins.ts`, `utility-builtins.ts`
- Split `src/strategy/commission-calculator.ts` (~801 lines) — extract each commission method into its own module under `src/strategy/commission-methods/`
- Split `frontend/src/components/BacktestSettingsPopup.tsx` (~784 lines) — split into smaller composable form sections
- Split `src/language/runtime/builtins/ta-builtins.ts` (~543 lines) — extract into per-indicator-group modules under `src/language/runtime/builtins/ta/`
- Split `frontend/src/App.tsx` (~546 lines) — extract layout sections into separate components
- Split `src/language/runtime/execution-engine.ts` (~441 lines) — extract state-management concerns already delegated to state-manager; clean up delegation layer
- **No behavioral changes** — all splits preserve public API surface via barrel re-exports (`index.ts`)
- **No breaking changes** — existing imports continue to work through barrel files

## Capabilities

### New Capabilities
- `codebase-organization`: Structural refactoring to keep individual source files under ~400 lines for AI-friendliness, with clear module boundaries and barrel re-exports

### Modified Capabilities
*(None — this is a pure structural refactoring with no behavioral changes)*

## Impact

- All existing imports into these files must be redirected through new barrel `index.ts` files
- The `src/strategy/index.ts` and `src/language/parser/index.ts` barrel exports will re-export from the new sub-modules
- No runtime behavior changes — every existing test must pass with zero modifications
- Affected packages: `pine-framework` (core engine), `pine-framework-frontend` (React app)
- No dependency changes, no API contract changes, no configuration changes
- Estimated split count: ~20-30 new files created, ~10-15 files reduced in size
