# ChartComponent skip-guard re-add on reclassification (pane-vanish hardening)
**Date:** 2026-08-18
**Source:** QA Engineer (inherited from Bug Hunter + Backend Engineer)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Implement optional hardening in ChartComponent's classification effect: when a WS reclassification would drop an existing manual non-overlay pane (skip-guard currently keeps old overlay series with paneIndices=0), re-add the pane instead of letting setManualNonOverlayPaneCount(0) remove it. Optionally decouple the maxManualNonOverlayCount branch from hasNonOverlayPlot.

## Rationale
The shipped fix makes WS carry the same keys as REST, so the vanish is fixed at the source. But the frontend classification path remains fragile: any future path that replaces a result without overlay keys (new indicator types, serializer drift) can still drop panes permanently (mergeDiffIntoResult keeps it gone until re-add). Defense-in-depth at the consumer.

## Evidence
- Bug-hunter handoff: data/handoffs/team/quality/bug-hunter/pane-vanish-root-cause.json (OPTIONAL hardening note)
- ChartComponent.tsx:342-361 classification + skip-guard branch
