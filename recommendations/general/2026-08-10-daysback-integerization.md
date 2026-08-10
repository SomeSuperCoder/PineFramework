# Integerize stored daysBack in backtestStorage sanitize
**Date:** 2026-08-10
**Source:** Tech Lead review (W4, after Code Reviewer agent failed to report)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
In frontend/src/utils/backtestStorage.ts `sanitize()`, `positiveNumber(raw.daysBack)` accepts non-integer values (e.g. 3.7). The days-back slider uses step=1 and clamp-on-change bounds values, so the UI never produces non-integers — but a hand-edited localStorage value could persist one. Apply `Math.floor` (with a `>= 1` guard) when accepting daysBack.

## Rationale
Guarantees the stored daysBack is always an integer matching the slider's step=1 semantics; prevents a future consumer from seeing fractional days.

## Evidence
backtestStorage.ts:85 — `const daysBack = positiveNumber(raw.daysBack);` (no integerization); Test Engineer also flagged this as a minor gap (W3b1 handoff).
