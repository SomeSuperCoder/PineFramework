# Multi-indicator pane-index collision (all-overlay + normal non-overlay)

**Date:** 2026-08-17
**Source:** QA Engineer (acceptance sign-off, supertrend-3d pane fix)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
When an all-overlay indicator (e.g. supertrend-3d) is added BEFORE a normal non-overlay indicator, the pane count can under-allocate and the normal indicator's drawings/series stop rendering. Fix `getNonOverlayPaneCount` (or ChartComponent's manual-count computation) so the pane count is `max(paneIndices.size, manualNonOverlayCount, maxPaneIndex+1)` — i.e. derived from the highest pane index actually used, not just the size of the series-pane set.

## Rationale
ChartComponent assigns pane indexes sequentially (`nonOverlayPaneIndex++`) but the plot-series pane count (`paneIndices.size` from `getNonOverlayPaneCount`) counts only series-derived pane indices, while the all-overlay indicator contributes only `manualNonOverlayCount`. Ordering matters:
- [normal, all-overlay] → paneIndices={0} size=1, manual=2 → count=2 → both panes OK.
- [all-overlay, normal] → all-overlay claims pane 0 (manual=1), normal gets paneIndex 1 → paneIndices={1} size=1, count=max(1,1)=1 → only pane 0 allocated → normal indicator's series/drawings (paneIndex 1) never render.

## Evidence
- `frontend/src/components/ChartComponent.tsx` ~line 301-361: `let maxManualNonOverlayCount = 0;` + `maxManualNonOverlayCount = Math.max(maxManualNonOverlayCount, nonOverlayPaneIndex)` only for `!resultIsOverlay && !hasNonOverlayPlot`.
- `frontend/src/chart/plot-series-manager.ts:116-124`: `getNonOverlayPaneCount` returns `Math.max(paneIndices.size, this.manualNonOverlayCount)`.
- The e2e (`frontend/e2e/supertrend-3d-pane.spec.ts`) covers only the single-indicator case; multi-indicator ordering is untested.
- Out of acceptance scope for the supertrend-3d single-indicator fix (which is GREEN); flagged for future multi-indicator work.
## Related test-coverage gap (2026-08-18, QA pane-vanish acceptance)

The new `pane-vanish-classification.test.tsx` covers only the single-indicator supertrend-3d case. Add a test asserting `maxManualNonOverlayCount` accumulates correctly via Math.max across two indicators (all-overlay + normal non-overlay) in one classification run — proving the collision fix above and locking the ordering behavior. Low priority; the 415-suite passes today.

## Evidence
- ChartComponent.tsx:355-357 (Math.max accumulation)
- frontend/src/__tests__/pane-vanish-classification.test.tsx (single-indicator only)
