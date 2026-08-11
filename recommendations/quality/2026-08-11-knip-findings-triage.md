# Triage knip findings (196 items) before treating `just check` as dead-code-clean
**Date:** 2026-08-11
**Source:** DevOps Engineer (work report, knip wiring)
**Priority:** medium
**Status:** pending
**Effort:** large (>4hr)

## Recommendation
Triage the initial knip report before deciding fix-vs-configure. Findings (exit 1, full list in `/tmp/knip-full.log`):
- 12 unused files (e.g. `frontend/src/components/AppToolbar.tsx`, `src/utils/logger/index.ts`, `tests/helpers/mock-exchange.ts`)
- 1 unused dependency — `chokidar` (backend)
- 4 unused devDependencies — `vite-plugin-node-polyfills` (frontend), `@playwright/test` (root — **now genuinely orphaned after the suite move**; frontend has its own copy → remove it), `jest`, `ts-jest` (root; vitest replaced jest)
- 112 unused exports + 71 unused exported types + 1 duplicate export (mostly shadcn/ui primitives, `src/frontend-safe.ts` re-exports, backend security utils)

Recommend grouping: (a) clearly dead code → delete, (b) library convention exports (shadcn/ui) + intentional re-exports → `knip.json` ignore entries with documented rationale, (c) remove root `@playwright/test` devDep.

## Rationale
knip detects dead code correctly, but without triage `just check` will stay red indefinitely on 196 findings — and some may be false positives (library convention exports are NOT dead code).

## Evidence
- `pnpm run knip` exits 1 with the full detection list (verified run)
- Zero references to root `playwright.config.ts` after the move (grep-verified)
