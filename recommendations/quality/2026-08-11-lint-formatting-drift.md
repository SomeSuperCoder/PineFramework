# 104 prettier errors block `just check` before knip
**Date:** 2026-08-11
**Source:** DevOps Engineer (work report, knip wiring)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Fix the 104 `prettier/prettier` errors in `tests/` files (all auto-fixable via `pnpm run lint:fix`), and consider adding lint:fix to the pre-commit path to prevent formatting drift.

## Rationale
`just check` runs `typecheck:all → lint → knip → build` and **exits 1 at lint** due to these pre-existing formatting errors — this masks the new knip step until fixed. Formatting drift accumulates when `format`/`lint:fix` aren't run routinely.

## Evidence
- `pnpm run lint` on `just check` run: 104 `prettier/prettier` errors, all auto-fixable
- `just check` never reaches `pnpm run knip` while lint is red
