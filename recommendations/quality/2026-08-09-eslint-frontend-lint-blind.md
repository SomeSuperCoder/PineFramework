# Root ESLint never type-lints frontend/src
**Date:** 2026-08-09
**Source:** frontend-engineer (Microtask A handoff)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Fix root `.eslintrc.cjs` so it type-lints `frontend/src`: `parserOptions.project` points at the root tsconfig (`include: ["src/**/*"]` = backend only), so frontend files fail identically to untouched App.tsx/button.tsx. Add an override pointing `parserOptions.project` at `frontend/tsconfig.json` (or run eslint per-package).

## Rationale
The whole frontend currently runs lint-blind under the repo config — only prettier formatting is caught, no rule violations. Type errors ARE caught by tsc, but lint rules on frontend code are never enforced.

## Evidence
- `eslint` on the new TelegramConfigPanel/ files: 26 findings, ALL `prettier/prettier` formatting, zero rule violations — same result on untouched `App.tsx`/`button.tsx`.
- Root `.eslintrc.cjs` `parserOptions.project` → root tsconfig (backend `src/**/*`).
