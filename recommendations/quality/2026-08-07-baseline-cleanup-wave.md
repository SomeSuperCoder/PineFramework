# Baseline test failures + lint-gap need a dedicated cleanup wave
**Date:** 2026-08-07
**Source:** Test Engineer + QA Engineer (command-removal verification)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Before the next release, run a dedicated baseline-cleanup wave:
1. **`backend/tests/stop-engine-shutdown.test.ts`** fails at suite level: `TelegramBotFeature.registerActions:370` → `transport.registerBotCommand is not a function` (pre-existing on HEAD, but it touches the changed feature file — worth an Engineer look).
2. **5 integration baselines**: `backbone-persistence`, `backbone-rightmost-labels`, `break-debug`, `hhll-e2e-pivot`, `higher-high-lower-low` — all fail on HEAD; verify each is an outdated test or a real (old) defect, then fix/update.
3. **Root lint gap**: the root lint script `eslint src tests --ext .ts` excludes `backend/` entirely — `backend/tests/*` are never linted (pre-existing; the bug-repro dir even fails to parse under any eslint project). Add `backend` to lint scope or wire a backend eslint project.
4. **Parked repro**: `backend/tests/bug-repro/notification-truthiness-repro.test.ts` (untracked, RED by design) belongs to the PARKED notification-truth bug — do not commit it; it lands when that bug's fix lands.

## Rationale
The 6 baseline failures + parked repro mask the suite's true signal — every full-suite run looks "7 failed" even when a change is clean. A clean baseline makes future verdicts unambiguous.

## Evidence
- /tmp/vitest-command-removal.log (full-suite: 7 failed files / 6 failed tests = 6 baseline + 1 parked repro)
- Root package.json lint script vs backend/ file locations
