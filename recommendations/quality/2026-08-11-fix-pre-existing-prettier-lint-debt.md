# Fix pre-existing prettier/prettier lint debt (104 errors, 20 files)
**Date:** 2026-08-11
**Source:** refactoring-engineer (removal microtask — surfaced while running `pnpm lint`)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr — auto-fixable with `eslint --fix`)

## Recommendation
`pnpm lint` reports ~104 `prettier/prettier` formatting errors across ~20 files (`src/pnl/decimal.ts`, `src/trading/dex/dex-adapter.ts`, `src/trading/telegram-bot.ts`, + 17 test files incl. `trade-history-store-extension.test.ts`, `bot-engine.test.ts`, etc.). Auto-fix with `eslint --fix` in a dedicated formatting microtask.

## Rationale
The lint gate is red repo-wide, so every future change inherits a red `pnpm lint` regardless of the change's own correctness. Fixing it once makes lint a meaningful gate again.

## Evidence
- `pnpm lint` output (104 errors, all `prettier/prettier`, all in files untouched by the alternating-strategy removal)
- Pre-existing — not caused by any recent change.
