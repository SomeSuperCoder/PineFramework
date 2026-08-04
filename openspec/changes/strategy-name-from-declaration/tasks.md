## 1. Shared helper

- [ ] 1.1 Create `src/utils/script-name.ts` exporting `extractScriptName(source: string): string | null` — positional `"Name"` first, then `title="Name"`; return `null` when absent (per spec `strategy-name-derivation`)
- [ ] 1.2 Export `./utils/script-name` subpath in root `package.json` exports (mirroring `./utils/time`)
- [ ] 1.3 Unit tests for `extractScriptName` (`src/utils/script-name.test.ts` or existing unit test convention): double-quote positional, single-quote positional, `title=`, and null cases

## 2. Backend snapshot

- [ ] 2.1 `src/trading/bot-engine.ts` `getSnapshot()`: import `extractScriptName`, derive `strategyName` from `strategySource` (null/absent → `(not configured)`; truncate >50 chars)
- [ ] 2.2 Update/extend `tests/unit/trading/bot-engine.test.ts`: snapshot `strategyName` is the derived name; `(not configured)` fallback

## 3. Frontend surfaces

- [ ] 3.1 Review step (`frontend/src/components/TradingBotPanel.tsx`): replace `strategySource.split('\n')[0]?.substring(0, 60)` with `extractScriptName(configValues.strategySource) ?? '(unnamed strategy)'` (import from `pine-framework/utils/script-name`)
- [ ] 3.2 Verify `LiveDashboard` left panel `Strategy` metric renders `status.strategyName` (no change expected — backend D4 supplies the derived name)
- [ ] 3.3 Refactor `frontend/src/App.tsx` `extractScriptName` to import the shared helper (remove local duplicate)
- [ ] 3.4 Refactor `frontend/src/components/CodeEditor.tsx` `extractName` to import the shared helper (remove local duplicate)
- [ ] 3.5 Frontend tests: Review step shows derived name for a `strategy("Name")` source and `(unnamed strategy)` fallback for a pasted source with no declaration

## 4. Verification

- [ ] 4.1 Regression: run root unit suites (`bot-engine`, `script-name`) — no new failures
- [ ] 4.2 Regression: run `frontend` tests (Review step, bot dashboard/stop-step, backtest flow, chaos frontend) — no new failures
- [ ] 4.3 Run lint + typecheck/build on touched files (root `pnpm build:lib` limited to pre-existing errors; `frontend` typecheck/lint)
- [ ] 4.4 Full-suite comparison vs base: identical failure set, no regressions
