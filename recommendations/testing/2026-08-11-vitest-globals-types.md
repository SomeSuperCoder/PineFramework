# Migrate test global types to vitest/globals
**Date:** 2026-08-11
**Source:** code-reviewer (knip greenification review)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Add `"types": ["vitest/globals"]` to the test tsconfig(s) and drop `@types/jest` from root devDeps.

## Rationale
Currently `@types/jest` is load-bearing: with no tsconfig `types` array, it provides the `describe/it/expect` global types under vitest `globals: true`. Keeping jest's global types while running vitest risks silent type drift between the two frameworks' APIs. The clean end-state is vitest's own global types.

## Evidence
Code review Q5 — `@types/jest` still in root devDeps; removing it without adding vitest/globals would break typecheck. Not this commit's job.
