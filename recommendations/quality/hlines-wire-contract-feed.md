# Hlines wire-contract serialization + PineChart.setHLines feed (latent)
**Date:** 2026-08-18
**Source:** QA (qqe-mod acceptance)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
The hline builtin emits HLineEntry records and the frontend HLineRenderer handles 'dotted', but `chart-data-transform.ts` has NO hlines feed — `PineChart.setHLines` is unwired. The qqe-mod e2e proves pane+plots render but NOT hline visuals. Wire the hlines through the execution-result contract (ExecutionResultMessageInput) + chart-data-transform → PineChart.setHLines, and add a test that asserts hline visibility.

## Rationale
The zero-line of qqe-mod (hline style_dotted) currently compiles+runs but its visual is not proven to reach the canvas. It's the one remaining latent gap in the qqe-mod compatibility surface. Non-blocking because the indicator's core plots render; blocking for "full render parity" with TradingView.

## Evidence
QA acceptance criterion 3 (feed latent); HLineEntry style union matches HLineData exactly; HLineRenderer dotted path ready; qqe-mod-pane.spec.ts passes without asserting hlines.