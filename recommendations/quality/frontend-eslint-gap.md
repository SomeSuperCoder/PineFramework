# Frontend has no eslint config — root lint script skips frontend/src
**Date:** 2026-08-13
**Source:** frontend-engineer (native-selects-shadcn wave)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Wire an eslint config for `frontend/` (flat config with `frontend/tsconfig.json` parser options + typed rules + prettier) and make the root `lint` script cover `frontend/src` — today it only covers root `src/tests`, so frontend code is effectively lint-gated only by whoever happens to run tsc/eslint manually.

## Rationale
During the select swaps, `eslint src/components/...` failed for lack of config; the implementer had to pass a manual parser-options override. Without a config, prettier/eslint drift silently accumulates (BotControls.tsx had 143 pre-existing prettier violations at HEAD).

## Evidence
- Root `lint` script in package.json targets root `src/tests` only.
- `frontend/` has no `.eslintrc` / `eslint.config.*`; `tsc --noEmit` is the only enforced frontend check.
