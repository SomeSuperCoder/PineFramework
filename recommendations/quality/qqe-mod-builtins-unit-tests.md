# Unit tests for new builtins ta.stdev + hline
**Date:** 2026-08-18
**Source:** QA (qqe-mod acceptance)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Add unit tests for the two new engine builtins: `ta.stdev` (population stdev semantics, call-site keyed state, NA warm-up) and `hline` (emits HLineEntry with correct style/color/title, member-constant namespace resolution). The existing ta-statistics-exactness suite (36 tests) covers highest/lowest but not stdev.

## Rationale
The e2e test proves qqe-mod end-to-end but the builtins are exercised indirectly. Direct unit coverage locks their semantics (population vs sample, call-site isolation for the two QQE instances, namespace resolution for hline.style_*).

## Evidence
QA acceptance criterion 5 / recommendation 2; ta-statistics-exactness suite lacks stdev; hline has no direct unit test.