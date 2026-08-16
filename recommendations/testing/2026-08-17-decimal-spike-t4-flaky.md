# Flaky: decimal-spike T4 — supertrend-3d accumulation primitives
**Date:** 2026-08-17
**Source:** Test Engineer (M5a verify)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
decimal-spike.test.ts `T4: supertrend-3d accumulation primitives — no drift at DP=20` (lines 90–141) flaked once under parallel test load during the M5a verification run: 1 RED in the combined `decimal-spike + math-builtins-exactness` run, then PASS in isolation (3.1s) and PASS again in the full combined re-run (3.4s). The test does a 100k-bar RMA recursion at DP=20 AND DP=50 plus a float contrast — ~3.4s of heavy numeric work. decimal.js math is deterministic, so a RED→GREEN flip across identical inputs is a timing/resource-contention failure, not a logic regression.

Fix options (pick one):
1. Raise the test timeout for this single test: `it(..., { timeout: 15_000 })` — cheapest, removes the default 5s vitest cap under load.
2. Split the heavy sub-assertions ((a) constant fixed point, (b) DP=20 vs DP=50 agreement, (c) float contrast) into separate `it` blocks so one slow section can't fail a monolithic test.
3. Reduce N from 100_000 to 10_000 (drift contrast still holds at 1e-13 scale, ~10× faster).

## Rationale
A flaky gate test corrupts the RED/GREEN signal: a single spurious RED during a migration verification can be misread as a real regression (as it was initially here), burning a full triage cycle. The 100k×3 recursion is the only test in the numeric suites that exceeds ~3s; it is the likely contention point under vitest file parallelism.

## Evidence
- M5a verify run: `pnpm exec vitest run tests/numbers/decimal-spike.test.ts tests/numbers/math-builtins-exactness.test.ts` → 1 failed | 62 passed (T4 RED)
- Isolation: `vitest run tests/numbers/decimal-spike.test.ts -t "T4"` → 1 passed | 16 skipped (3.1s)
- Full re-run: same combined command → 2 passed | 63 passed (T4 GREEN, 3.4s)
- T4 uses a local pure-decimal `rmaFinal` helper; imports only `numbers/` module — proven independent of the M5a `ta.sma` DecimalRingBuffer change (which is in ta-overlap.ts).