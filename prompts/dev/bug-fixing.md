# Bug Fixing Protocol (Mandatory)

The fundamental principle of bug fixing is:

> **No reproduction → no investigation.
> No investigation → no fix.**

Until a bug has been reliably reproduced, every theory about its cause is speculation. Speculation without evidence wastes tokens, time, and often leads to incorrect fixes.

The purpose of this protocol is to ensure every bug is solved using evidence rather than assumptions.

---

# Guiding Principle

A bug report is **not** evidence of the root cause.

Before the bug can be explained, you must first prove that it exists under controlled conditions.

**Do not attempt to reason about possible causes before a deterministic reproduction exists.**

Without a reproduction:

* you do not know which code path is executing
* you do not know which dependency is involved
* you do not know which configuration matters
* you do not know whether the report is accurate
* you do not know whether multiple bugs are being confused

Therefore, any discussion of possible causes before reproduction is largely guessing and provides little value.

**Reproduce first. Think second. Fix third.**

---

# Step 1 — Create a Deterministic Reproduction

This step is mandatory.

The first objective is **not** understanding the bug.

The first objective is **making the bug happen on demand.**

Prefer:

* integration tests
* end-to-end tests

Only use unit tests when they provide equal or greater confidence.

The reproduction test must:

* fail before any production changes
* reproduce the exact reported behavior
* be deterministic
* be minimal
* clearly describe the expected behavior

If a deterministic reproduction cannot yet be created:

* gather additional information
* inspect logs
* inspect inputs
* inspect configuration
* add temporary instrumentation if necessary

Continue working toward a deterministic reproduction.

**Do not modify production code while the bug still cannot be reproduced unless creating the reproduction is literally impossible.**

---

# Absolutely No Root-Cause Analysis Before Reproduction

Until a failing reproduction exists:

* do **not** generate theories
* do **not** speculate
* do **not** suggest likely causes
* do **not** discuss suspicious code
* do **not** recommend fixes

At this stage, none of those are evidence-based.

Doing so wastes reasoning effort because the actual execution path is still unknown.

Only once the bug can be reproduced is there enough information to begin meaningful investigation.

---

# Step 2 — Generate Hypotheses

Once—and only once—a deterministic failing reproduction exists:

Analyze the codebase and enumerate every plausible root cause.

Consider:

* related modules
* recent changes
* dependencies
* lifecycle
* concurrency
* configuration
* state management
* edge cases
* serialization
* caching
* networking
* timing
* resource ownership
* error handling

Treat every hypothesis as unproven.

Do not change production code yet.

---

# Step 3 — Identify the Actual Root Cause

Systematically verify every hypothesis.

Use evidence:

* debugging
* tracing
* logging
* code inspection
* binary search through execution paths
* temporary instrumentation
* additional focused tests

Reject hypotheses that do not match observed behavior.

Only modify production code once the true cause has been identified.

If multiple independent defects exist, isolate each one separately.

---

# Step 4 — Implement the Minimal Correct Fix

Fix only the verified root cause.

The implementation should:

* be as small as possible
* preserve existing behavior
* avoid unnecessary refactoring
* avoid speculative improvements
* maintain compatibility where appropriate

Do not mix unrelated cleanup with the bug fix.

---

# Step 5 — Verify

Run the reproduction test.

If it still fails:

Return immediately to **Step 3**.

Do **not** guess.

Continue investigating until the verified root cause has been eliminated.

If the reproduction passes:

Run all relevant automated tests, including:

* integration tests
* unit tests
* regression tests
* affected package tests

A bug is **not fixed** until all relevant automated tests pass.

---

# Regression Prevention

Whenever practical:

* keep the reproduction test
* convert it into a permanent regression test
* expand surrounding coverage if appropriate

Every bug fixed should make the test suite stronger.

---

# Never

* Never speculate before reproducing.
* Never guess a fix.
* Never patch symptoms.
* Never skip creating a failing test.
* Never delete a failing test because it is inconvenient.
* Never disable tests to satisfy CI.
* Never claim success without automated verification.
* Never mix unrelated refactors into a bug fix.

---

# Always

* Reproduce first.
* Think only after reproduction exists.
* Verify every hypothesis.
* Fix the verified root cause.
* Prove the fix with automated tests.
* Leave permanent regression protection.

---

# Decision Loop

```text
bug report
     │
     ▼
create deterministic failing reproduction
     │
     ├───────────────┐
     │               │
     ▼               │
cannot reproduce? ───┘
     │
collect more evidence
instrument
inspect logs
clarify inputs
repeat
     │
     ▼
reproduction exists
     │
     ▼
generate hypotheses
     │
     ▼
prove the real root cause
     │
     ▼
implement minimal fix
     │
     ▼
run reproduction test
     │
still failing?
     │
 yes ─────────────► investigate again
     │
 no
     ▼
run full affected test suite
     │
     ▼
done
```

---

# Primary Objective

The objective is **not** to make the bug appear fixed.

The objective is to **prove**, through deterministic reproduction and automated testing, that the verified root cause has been eliminated without introducing regressions.

Every bug fix should move from:

**Report → Reproduction → Evidence → Root Cause → Minimal Fix → Verification**

Never skip a stage.

