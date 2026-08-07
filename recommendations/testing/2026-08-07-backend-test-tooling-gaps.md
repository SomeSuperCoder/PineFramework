# Backend test tooling gaps (lint + artifact hygiene)
**Date:** 2026-08-07
**Source:** Test Engineer (force-close notification suite)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr) each

## 1. backend/tests/bug-repro/ is not lintable
**Recommendation:** The `backend/tests/bug-repro/` directory is outside every eslint project (`parserOptions.project` gap) — eslint reports a *parsing error* on those files, so new bug-repro tests can never be linted. Wire `backend/tests/**` into the backend tsconfig/eslint project (or a dedicated project).
**Rationale:** Bug-repro tests are exactly where subtle regressions live; they should be type- and lint-checked like everything else.
**Evidence:** eslint parsing error on `backend/tests/bug-repro/*.test.ts`, identical on HEAD — pre-existing config gap.

## 2. backend/close-attempts.json untracked artifact
**Recommendation:** Test runs leave an untracked `backend/close-attempts.json`. Add it to `.gitignore` or ensure tests fully mock fs.
**Rationale:** Prevents accidental commits of runtime artifacts.
**Evidence:** observed by Test Engineer during full-suite runs.

## 3. Pre-existing prettier debt in trading unit tests
**Recommendation:** `tests/unit/trading/close-manager.test.ts` (103 fix-lines) and `tests/unit/trading/bot-engine.test.ts` (52) carry pre-existing prettier violations. A dedicated `prettier --write` pass would clear them (out of scope for the bug fix).
**Rationale:** Keeps lint output readable; new changes in these files otherwise surface as "violations" that are actually baseline.
**Evidence:** prettier diff HEAD vs current identical — all violations pre-existing.
