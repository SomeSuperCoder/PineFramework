# Delete tracked jest.config.js.bak
**Date:** 2026-08-11
**Source:** code-reviewer (knip greenification review)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Delete the tracked `jest.config.js.bak` file — it references the removed jest/ts-jest dependencies and is a dead artifact.

## Rationale
After removing jest/ts-jest from the repo (knip greenification), a `.bak` config referencing them is stale and misleading.

## Evidence
Code review Q5 — `jest.config.js.bak` still tracked in git, references removed jest/ts-jest.
