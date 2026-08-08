# Token mirror-consistency vitest test
**Date:** 2026-08-08
**Source:** team/lead/frontend-lead (orchestration plan, W1)
**Priority:** high
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Add a vitest test that parses `:root` in `frontend/src/index.css` and asserts every CSS variable equals the corresponding value in `frontend/src/theme/tokens.ts`. If they diverge, the suite goes RED.

## Rationale
Makes "single token source" machine-enforced, not a convention — prevents CSS/TS palette drift returning (the old canvas-vs-CSS divergence disease).

## Evidence
Frontend Lead orchestration plan, E2E drift risk; frontend/src/index.css:19-73 vs src/chart/types.ts:128.
