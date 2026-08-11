# Update openspec config.yaml test framework doc
**Date:** 2026-08-11
**Source:** code-reviewer (knip greenification review)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Update `openspec/config.yaml:10` — it still documents "Jest with ts-jest" as the test framework. Change to vitest.

## Rationale
The repo runs vitest; jest/ts-jest were removed in the knip greenification. Stale docs mislead future work.

## Evidence
Code review Q5 — `openspec/config.yaml:10` documents "Jest with ts-jest".
