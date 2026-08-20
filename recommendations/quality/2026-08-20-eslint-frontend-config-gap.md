# Root ESLint config cannot lint frontend files (tsconfig project gap)
**Date:** 2026-08-20
**Source:** Frontend Engineer + Animations Engineer (landing feature)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Fix the repo-root ESLint setup so a plain `eslint` invocation lints `frontend/**` without needing a `--parser-options '{"project":"./frontend/tsconfig.json"}'` override. The root `.eslintrc.cjs` / tsconfig excludes `frontend/**`, so frontend linting is currently only possible with the manual override.

## Rationale
Two engineers independently hit the same gap during the landing feature. A CI/dev command that lints the whole repo would silently skip the frontend (or fail) without the override. This is a harness/config defect, not a code defect.

## Evidence
- Frontend Engineer handoff `data/handoffs/team/frontend/frontend-engineer/landing-shell.json`
- Animations Engineer handoff `data/handoffs/team/frontend/frontend-animations-engineer/motion.json`
- Root: `.eslintrc.cjs`, `tsconfig.json` (frontend excluded)