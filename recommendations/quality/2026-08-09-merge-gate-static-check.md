# Materialize the merge-gate static check (no new PnL arithmetic outside src/pnl)
**Date:** 2026-08-09
**Source:** code-reviewer (M9 re-gate), qa-engineer (M9 re-gate)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Implement tasks.md §1.7's merge-gate static check as a CI script: grep/ast check that no new gross/net/fee arithmetic is added outside `src/pnl/` (except edge conversions).

## Rationale
The F1–F8 contract suite pins behavior but doesn't grep the codebase. A static gate would have caught the `bot-engine.ts` notification inline PnL (flagged separately) automatically. Currently enforced by review alone.

## Evidence
- Code reviewer m2: "merge-gate static check not implemented — only behavioral contract tests; enforced by review alone."
- QA re-gate found the notification-path inline arithmetic via grep sweep — a CI grep would find such drift on every PR.
