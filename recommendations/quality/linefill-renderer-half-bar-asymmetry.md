# LinefillRenderer half-bar renderer asymmetry (Divergence #1)
**Date:** 2026-08-18
**Source:** QA Engineer (misalignment-fix-acceptance) — Bug Hunter Divergence #1
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Remove the `+ barSpacing / 2` bar-CENTER shift in frontend/src/chart/renderers/LinefillRenderer.ts:59-65 so fills render at the bar LEFT EDGE, matching PineChart.ts:559-564 / Viewport.ts:73-75 which render skeleton lines at the bar left edge with no shift. Deliberately NOT fixed in the seed-trim wave (lane boundary — the observed 4-6 cell misalignment was the seedCount drift, which IS fixed; this is a separate, pre-existing 0.5-bar = 0.25-cell constant cosmetic asymmetry).

## Rationale
Same bar renders skeleton at barIndexToPixel(barIndex) (left edge) and fill at barIndexToPixel(barIndex) + barSpacing/2 (center) → constant delta = 0.5 bar = 0.25 cells. Invisible at typical zoom but a persistent 1px-class source of fill/skeleton visual offset; a follow-up wave should fix it + add renderer-level unit coverage (see linefill-renderer-unit-tests.md).

## Evidence
- LinefillRenderer.ts:59-65 `barIndexToPixel(rawBarIndex) + barSpacing / 2` (bar CENTER)
- PineChart.ts:559-564 renders skeleton at `barIndexToPixel(findBarIndex(time))` (bar LEFT EDGE, no shift)
- Viewport.ts:73-75 no shift in barIndexToPixel
- Bug Hunter handoff data/shared.key_facts[4]: "DIVERGENCE #1 (always, verbatim): ... CANNOT explain observed 4-6 cells" — confirmed NOT the root cause of the reported misalignment; root cause was seedCount drift (fixed).
