# AGENTS.md

## Bug Fixing Protocol (MANDATORY)

When fixing **any** bug, defect, regression, or unexpected behavior, you **MUST** follow this process exactly. Never skip steps, never guess, and never declare a bug fixed until it has been verified by automated tests.

---

# Step 1 — Reproduce the Bug

The first objective is to create a deterministic reproduction.

Prefer:

- Integration tests
- End-to-end tests (if appropriate)

Only use a unit test when an integration test is impossible or would provide less confidence.

The reproduction test MUST:

- Fail before any code changes
- Reproduce the exact issue reported
- Be deterministic
- Be minimal while still covering the bug
- Clearly document the expected behavior

Do **NOT** modify production code until a failing test exists unless creating the test is literally impossible.

---

# Step 2 — Generate Hypotheses

After the failing test exists:

Analyze the codebase and identify every plausible root cause.

Do **NOT** immediately start changing code.

Instead:

- inspect related modules
- inspect recent changes
- inspect dependencies
- inspect edge cases
- inspect concurrency/state/lifecycle issues
- inspect configuration
- inspect error handling

Treat each hypothesis as unconfirmed until proven.

---

# Step 3 — Find the Actual Root Cause

Systematically verify each hypothesis.

Use:

- code inspection
- logging
- debugging
- tracing
- binary search through code paths
- additional temporary tests if necessary

Never "fix" code simply because it looks suspicious.

Only modify code after identifying the actual cause of the failure.

If multiple independent bugs exist, identify each separately.

---

# Step 4 — Implement the Fix

Implement the **smallest correct change** that eliminates the root cause.

The fix should:

- preserve existing behavior
- avoid unnecessary refactoring
- avoid introducing technical debt
- avoid speculative improvements
- maintain backward compatibility when appropriate

Do not mix unrelated refactors with the bug fix.

---

# Step 5 — Verify

Run the reproduction test.

If it still fails:

- DO NOT guess
- Return to **Step 3**
- Continue investigating until the true cause is found

If the test passes:

Run all relevant tests, including:

- integration tests
- unit tests
- regression tests
- affected package/module tests

The bug is considered fixed **only after all relevant automated tests pass**.

---

# Regression Prevention

Whenever reasonable:

- leave the reproduction test in the repository
- expand existing tests to cover the scenario
- ensure the bug cannot silently return

Every bug fixed should become a permanent regression test.

---

# Rules

## Never

- Never guess the fix.
- Never patch symptoms.
- Never skip writing a failing test.
- Never remove a failing test because it is inconvenient.
- Never disable tests to make CI pass.
- Never claim success without verification.
- Never introduce unrelated changes.

## Always

- Reproduce first.
- Understand before changing code.
- Fix the root cause, not the symptoms.
- Verify with automated tests.
- Leave behind regression protection.

---

# Decision Loop

```
Create failing reproduction test
            ↓
Generate root-cause hypotheses
            ↓
Investigate until the actual cause is identified
            ↓
Implement the minimal correct fix
            ↓
Run tests
      ↓
Still failing?
      │
   Yes ───────────────► Return to root-cause investigation
      │
      No
      ↓
Run full affected test suite
      ↓
Done
```

---

# Primary Objective

The objective is **not** to make the bug appear fixed.

The objective is to **prove**, through automated testing, that the root cause has been eliminated without introducing regressions.

