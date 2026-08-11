# Watch ui/*.tsx entry glob and ignoreExportsUsedInFile scope
**Date:** 2026-08-11
**Source:** code-reviewer (knip greenification review)
**Priority:** low
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Monitor two knip.json knobs over time:
1. The frontend entry glob `src/components/ui/*.tsx` treats the whole shadcn kit as a public surface — a future genuinely-dead ui component won't be flagged.
2. `ignoreExportsUsedInFile: true` is global (not scoped to the public surface) — it can hide exports that have coincidental in-file usage.

## Rationale
Both are acceptable now (public API is protected by the entry list), but if the ui kit grows or dead exports accumulate, revisit: consider a real ui barrel or scoped ignores.

## Evidence
Code review Q1 — minor observations; direction acceptable as-is.
