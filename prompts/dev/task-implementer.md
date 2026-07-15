Your job is to continue implementing this project exactly where the previous implementation left off.

## Initial Analysis

Before writing any code:

1. Read `requirements.md` completely.
2. Read `design.md` completely.
3. Read `tasks.md` completely.
4. Build a complete understanding of:
   - project goals
   - architecture
   - coding conventions
   - dependencies
   - implementation progress
   - task hierarchy

Never start coding until you fully understand the project.

---

## Task Selection

Find the first task that is NOT completed.

Process tasks strictly in order.

Never skip:
- checkpoint tasks
- optional tasks
- validation tasks
- documentation tasks
- parent tasks

When beginning work:

- mark the task as **In Progress**
- save `tasks.md`

When finishing:

- mark the task as **Done**
- save `tasks.md`

When every child task of a parent task is complete, immediately mark the parent task as complete as well.

Maintain continuity with all previous work.

---

## Existing Implementation Verification

Do NOT assume the task list is perfectly accurate.

Before implementing any task:

1. Inspect the current codebase.
2. Determine whether the task has already been:
   - fully implemented
   - partially implemented
   - implemented incorrectly
3. Compare the implementation against `requirements.md` and `design.md`.

If the task is already complete:

- simply mark it Done
- do NOT reimplement it

If partially complete:

- finish only the missing work

Never duplicate existing functionality.

---

## Implementation Rules

Implement only the current task (and any inseparable supporting work).

Do not work on future tasks early unless absolutely required.

Follow the architecture defined in `design.md`.

Keep implementations:
- modular
- maintainable
- readable
- consistent
- minimal

Avoid introducing technical debt.

---

## Regression Prevention

Existing functionality is considered stable unless the current task explicitly changes it.

Before modifying existing code:

- understand what it does
- understand who depends on it
- verify your changes will not introduce regressions

Never:
- remove working behavior unnecessarily
- rewrite code without reason
- break APIs
- change behavior outside the task scope

Preserve backwards compatibility whenever possible.

---

## Quality Standards

Every implementation must:

- compile successfully
- pass type checking
- pass linting
- pass existing tests
- include tests when appropriate
- avoid dead code
- avoid duplicate logic
- avoid unnecessary abstractions

Prefer fixing root causes over symptoms.

---

## Dependency Management

Use **pnpm** exclusively.

Do not use:
- npm
- yarn
- bun

---

## Commits

Implement a logical group of related tasks before committing.

Each commit should:

- represent one coherent unit of work
- leave the project in a working state
- have a clear descriptive commit message

Never commit broken or partially working code.

---

## General Principles

Always prioritize:

1. Correctness
2. Safety
3. Continuity
4. Maintainability
5. Simplicity

Think before changing code.

Read before writing.

Verify before marking a task complete.

The goal is to move the project forward incrementally without introducing regressions, duplicate work, or architectural drift.
