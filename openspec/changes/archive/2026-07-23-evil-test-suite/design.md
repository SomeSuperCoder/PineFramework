## Context

The pine-framework codebase has ~75 test files across `tests/` (integration, language, strategy, backend, rendering, etc.) with 45% coverage confidence per the audit. Existing tests focus on correctness of expected behavior. There is no systematic adversarial testing layer that deliberately feeds invalid, extreme, or unexpected inputs to verify graceful handling.

The audit identified bugs — series returning NA on getRelative(0), first-month returns always 0, stale bar detection edge cases, O(n²) memory in bar context creation — that adversarial tests would have caught. A dedicated `tests/evil/` suite provides structural coverage of the gap between "works for valid inputs" and "survives anything."

## Goals / Non-Goals

**Goals:**
- Create `tests/evil/` directory with 12 test files covering all major subsystems
- Each test file exercises adversarial scenarios systematically grouped by `describe` blocks
- Tests are self-contained, fast (<50ms each), and require no external dependencies
- All tests pass on the current codebase as-is (they verify existing behavior, not change it)
- Clear failure messages identify exactly which defensive behavior is expected
- Structure mirrors the source layout so developers find the evil counterpart of any module

**Non-Goals:**
- No production code changes — these are tests only
- No new test infrastructure or dependencies — uses existing Jest + ts-jest
- No fuzzing or property-based testing (that's a follow-up concern)
- No coverage of frontend React components or Vite config
- No mutation testing infrastructure
- Not a stress/load test suite — individual tests, not performance benchmarks

## Decisions

### Decision 1: Single-`describe`-per-scenario grouping
Each test file groups adversarial scenarios by topic within `describe` blocks (e.g., `describe('NaN propagation in binary ops')`). This keeps output readable and lets devs run specific scenario families with `jest --testNamePattern`.

**Rationale:** Flat list of `it()` blocks is hard to navigate. Deep nesting is unnecessary for tests that follow a uniform pattern (evil input → verify graceful handling). Single describe level with descriptive names hits the sweet spot.

### Decision 2: Helper factories shared via a `tests/evil/helpers.ts` file
Common evil-building utilities — `makeEvilContext()`, `compileEvilScript()`, `extremeNumbers` array, `NaNVariants` array — live in a shared helper file, not copy-pasted across test files.

**Rationale:** The `makeBars()` / `barsToContexts()` pattern is already duplicated across 5+ test files with minor variations. Evil tests should not repeat this mistake. A single `helpers.ts` provides:
- `makeEvilBarContext()` — creates ExecutionContext with configurable OHLCV, including degenerate values
- `compileEvilScript(source)` — parse+compile in one call, wraps errors for inspection
- `evilPrices` — array of extreme numeric values: 0, -0, Infinity, -Infinity, NaN, Number.MAX_VALUE, Number.MIN_VALUE, Number.EPSILON
- `evilSeries(length, fill)` — creates Series with specific evil fill values
- `assertGraceful(result)` — common assertion that no crash/throw occurred

### Decision 3: Pattern — Arrange / Act / Assert with explicit "expect no crash" first
Each test follows: set up evil input → execute (may throw or return) → verify no uncaught exception AND verify defensive output (NA, error, fallback, etc.).

**Rationale:** Evil tests serve two masters: proving the system doesn't crash, and proving the response is reasonable. The "no crash" assertion comes first so a test failure is immediately interpretable ("crash on empty series" vs "wrong fallback value").

### Decision 4: Each test file imports from source directly (same as existing tests)
Tests import from `src/language/...`, `src/strategy/...`, `src/rendering/...` using the same module paths as existing integration tests. No barrel/index imports that might mask circular dependencies.

**Rationale:** Consistency with existing test style. Direct imports make it obvious what's being tested and allow focused isolation.

### Decision 5: All NaN/Infinity edge cases use the existing `NA` symbol from `src/language/types/na.ts`
Rather than introducing new sentinel values, tests feed `NA` (Pine's na value), `NaN`, `Infinity`, and `-Infinity` through the runtime and verify the engine's `float-guards.ts` and existing NA propagation handle them. This validates the existing defensive layer works end-to-end.

**Rationale:** The engine already has `safeAdd`, `guardFinite`, `isNa`, etc. Evil tests should exercise these guards, not bypass them.

## Risks / Trade-offs

- **[False positives]** If a subsystem genuinely lacks defenses for an evil input, the test captures current behavior (even if it's a crash). That's a valid regression baseline. When defenses are added later, the test must be updated to expect the new graceful behavior.
  → **Mitigation:** Test comments document what behavior was observed at creation time. `// Current behavior: throws TypeError on NaN price` makes intent clear.

- **[Test brittleness]** Tests that check exact error messages may break if error formatting changes.
  → **Mitigation:** Prefer `toThrow()` without message match, or match on a substring. Only match exact messages for deliberately stable error paths (parser errors).

- **[Coverage gaps]** Evil tests are manual and scenario-based. They can't catch what the author didn't think of.
  → **Mitigation:** This suite is the foundation. Property-based testing and fuzzing should follow as a separate change.

- **[Test run time]** 12 files × 20-30 tests each ≈ 300 tests. Each is fast (<50ms), so total <15s.
  → **Mitigation:** If any test exceeds 100ms, isolate it for investigation.
