# e2e: scroll-back.spec.ts flake + chunk-boundary chunk-4 stall
**Date:** 2026-08-15
**Source:** QA Engineer (green-gates acceptance gate) — supersedes TE flake classification
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Two e2e items, reclassified after the QA gate run:

1. **chunk-boundary.spec.ts — NOT flaky, DETERMINISTIC PROJECT ISSUE at chunk 4.** QA's isolated `--workers=1` run reproduced the failure 2/2: after the 4th scroll-back to `firstBarIndex=400`, the indicator re-execution never lands (chunkBorders stays 3, labelCount stays 88, no "Chunk 4" log line). The earlier "flaky parallel artifact" classification (TE e2e-full-gate-v3) is superseded. Fix the chart scroll-back/re-execution orchestration — do NOT treat as a test-isolation issue.
2. **scroll-back.spec.ts — genuine flake, retry #1 passes** — scroll-trigger/route race on prepend; acceptable-with-note for the gate, still worth hardening.

Options for the scroll-back flake (once chunk-4 stall is fixed):
- Give the spec serial execution (`test.describe.configure({ mode: 'serial' })`), or
- Strengthen state isolation: reset/seed guard per test so no shared WS execution can pollute `__pineTestData.indicators`, or
- Per-spec `retries: 2` via `test.describe.configure`.

## Rationale
A flaky or stalled gate erodes trust in `just test` and blocks CI/commits at random. The chunk-4 stall is a real product defect in the scroll-back/re-execution path — the root-cause fix (v2+v3) resolved initial/chunk-2/chunk-3 but not chunk-4.

## Evidence
- data/handoffs/team/quality/qa-engineer/green-gates-acceptance.json (NO-GO: just check exit 0; just test exit 1; chunk-4 deterministic repro 2/2 full + 2/2 isolated)
- data/handoffs/team/quality/test-engineer/e2e-full-gate-v3.json (superseded flaky classification)
- chunk-boundary root-cause chain: data/handoffs/team/quality/bug-hunter/chunk-boundary-rootcause.json → FE fix v2/v3 handoffs

