# qqe-mod-pane e2e failing — engine missing ta.stdev / hline runtime builtins
**Date:** 2026-08-20
**Source:** Test Engineer (landing feature sweep) + QA Engineer
**Priority:** high
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Implement the missing Pine runtime builtins `ta.stdev` and `hline` in the engine (`src/language/runtime/builtins/`) so the `qqe-mod-pane.spec.ts` e2e goes green.

## Rationale
`frontend/e2e/qqe-mod-pane.spec.ts` is documented as by-design RED: the engine lacks these builtins, so the QQE-Mod indicator cannot compute/plot. This is a production gap in the Pine v6 runtime, surfaced during a full e2e sweep — unrelated to the landing feature, but it blocks a real indicator and keeps the suite red.

## Evidence
- Test Engineer handoff `data/handoffs/team/quality/test-engineer/landing-tests.json`
- QA Engineer handoff `data/handoffs/team/quality/qa-engineer/landing-qa.json` (noted, not blocking)
- File: `frontend/e2e/qqe-mod-pane.spec.ts`