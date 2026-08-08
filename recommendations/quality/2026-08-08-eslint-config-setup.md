# eslint config missing (lint script is no-op / prettier debt)
**Date:** 2026-08-08
**Source:** Frontend Engineer (backtest panel polish pass)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4h)

## Summary
The repo declares lint (`Justfile check` → `eslint src tests --ext .ts`) but **no eslint config exists** anywhere (no `.eslintrc`, no `eslintConfig` field). Running it is a no-op; running eslint directly surfaces 150+ pre-existing `prettier/prettier` errors across untouched code.

## Recommendation
Either add a minimal working eslint config (recommended) or delete the dead `lint` recipe. If adding config: adopt the repo's compact single-quote/no-semicolon style so the prettier rule matches the codebase (currently it doesn't, causing the noise).

## Rationale
A dead lint script invites engineers to skip linting entirely; an eslint run that flags 150+ untouched files hides real issues. The verification lane (typecheck) is healthy; lint should be too.

## Evidence
- `pnpm --dir frontend exec eslint` → 150+ `prettier/prettier` errors on pre-existing files.
- No `.eslintrc`, no `eslintConfig` in any package.json (verified during polish pass).