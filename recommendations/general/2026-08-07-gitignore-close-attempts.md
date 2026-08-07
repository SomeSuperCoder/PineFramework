# gitignore runtime artifact backend/close-attempts.json
**Date:** 2026-08-07
**Source:** Code Reviewer + Test Engineer (Global PnL report review + prior runs)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Add `backend/close-attempts.json` to `.gitignore`. It is a runtime artifact left by tests/engine runs and shows in every `git status` as untracked — a standing risk of being swept into a commit. (The report/Global PNL commit correctly excluded it via selective `git add`.)

## Activity
Prevents accidental commits of runtime state; keeps the working tree surface clean.