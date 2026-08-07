# Direct unit test for renderGlobalPnlCard (SVG pipeline untested)
**Date:** 2026-08-07
**Source:** Code Reviewer + QA Engineer (Global PnL report review)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
`renderGlobalPnlCard` (backend/src/telegram/report/renderCard.ts) is only exercised through `vi.mock` fakes in the two bot suites — the actual SVG templating (XML-escape of injected symbols, sign-rule color selection, bar geometry incl. maxAbsPnl=0 dot-branch, empty-state group, 800x440 output) has no direct unit test. Add a unit test that (a) asserts all 18 placeholders get replaced (no orphans/extras), (b) XML-escapes `<`/`&` in symbol names, (c) correct green/red per pnl sign, and (d) empty state emits the neutral group. Optionally render to a Buffer and assert non-trivial size without sharp-in-CI by mocking sharp.

## Rationale
The image is the centerpiece of the directive ("pretty design"); its internal correctness is currently asserted only indirectly (the mock just returns a Buffer). A DOM/PngSize unit test closes the gap.

## Evidence
Code Review finding 2 (MINOR); QA R1.