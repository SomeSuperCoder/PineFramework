# Align backtest-indeterminate motion with §13 durations
**Date:** 2026-08-08
**Source:** Frontend Engineer — lane 1b (overlays conversion)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
The existing `backtest-indeterminate` keyframe in the frontend predates DESIGN.md §13 durations (150ms/200ms). Align its sweep duration to the token scale in a polish pass.

## Rationale
Consistent motion rhythm across components; §13 is the SSOT for duration.

## Evidence
- Lane 1b handoff: "existing `backtest-indeterminate` keyframe pre-dates §13 durations (150ms/200ms), could align in a polish pass"
