## Context

The test suite has accumulated 82 test files over the project's lifecycle. During rapid development, many tests were created as debugging tools (console.log dumps) and never cleaned up. Others were created as "placeholder" tests with tautological assertions (`expect(true).toBe(true)`) and the real assertions were never written.

This creates three problems:
1. **False sense of security** — a green test suite that can't detect real regressions
2. **CI bloat** — several files fetch live Bybit API data with 120s timeouts
3. **Signal dilution** — real failures hide among noise

## Goals / Non-Goals

**Goals:**
- Remove every test file that has zero meaningful assertions
- Remove tautological assertions from files that also have real tests
- Remove files whose coverage is fully duplicated by other tests
- Rename misleadingly-named debug files that have real assertions
- Merge highly-overlapping test files (~70%+ overlap)

**Non-Goals:**
- Extracting shared test helpers — the boilerplate reduction is real but a separate task
- Changing any production code
- Changing test runner, config, or CI pipeline
- Adding new tests to fill coverage gaps
- Refactoring code style in tests that stay

## Decisions

### Decision 1: Remove, don't comment out
These files have zero regression value. Removing them cleanly (git rm) maintains a meaningful git history and avoids accumulating dead code. If a debug dump is genuinely needed later, git log has the full file contents.

### Decision 2: Keep supertrend-debug2, rename it
`supertrend-debug2.test.ts` has 9 real expect calls testing k-means clustering in isolation — it's a legitimate unit test with a misleading name. Rename to `supertrend-kmeans.test.ts`.

### Decision 3: Merge ema-cross-strategy-alignment into simple-ema-cross-strategy
The alignment test's unique assertions (entry/label alignment) are worth keeping but don't justify a separate 198-line file. Fold those 2-3 unique assertions into the main simple-ema-cross test.

### Decision 4: Fix or remove backbone-rightmost-labels
A 389-line file with 1 assertion is a liability. The options are:
- **Option A** (preferred): Add real assertions about line positions, label counts, and pivot detection (estimated +3-5 assertions)
- **Option B**: Remove the file. The HHLL indicator is already tested by `higher-high-lower-low.test.ts` and `backbone-persistence.test.ts`
- **Recommendation**: Add real assertions. The test setup (carefully crafted OHLC data) is valuable, it just needs the payoff.

## Risks / Trade-offs

- **[Low risk] Removing a test that actually catches bugs** — Mitigation: Every file being removed was manually audited for expect() calls. All files with 0 expect() calls can't catch anything. The `fill-color-data` tautologies explicitly state "verified by code inspection" — they're comments, not tests.
- **[Medium risk] People rely on console.log output from debug tests** — Mitigation: These were one-off debugging sessions, not monitoring. The author would re-run locally if needed again.
- **[Low risk] Merge loses test coverage from ema-cross-alignment** — Mitigation: Each assertion from the merged file will be explicitly preserved in the target file.
- **[Low risk] backbone-rightmost-labels has some value** — Mitigation: Task will add real assertions rather than blindly removing it.
