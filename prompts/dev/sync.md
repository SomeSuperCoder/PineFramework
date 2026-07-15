# Specification Synchronization Task

Your task is to synchronize the project documentation with the current implementation.

## 1. Determine the commit range

Locate the **most recent commit that intentionally changed the project specification or documentation** (`requirements.md`, `design.md`, or `tasks.md`).

Analyze **every commit after that point**.

## 2. Reconstruct the current project state

Do **not** simply replay commits in chronological order.

Instead:

* Read every relevant diff.
* Resolve conflicts between commits.
* If a later commit modifies or replaces an earlier change, only document the final result.
* Ignore reverted or obsolete implementations.
* Treat the repository's current source code as the source of truth whenever commit history is ambiguous.

Your goal is to reconstruct the **current** requirements, architecture, and completed work.

## 3. Update the documentation in this exact order

### Step 1 — `requirements.md`

Update the requirements so they accurately describe everything the project currently supports.

Include:

* new features
* changed behavior
* removed functionality
* API changes
* configuration changes
* user-visible behavior

Do not include implementation details.

---

### Step 2 — `design.md`

Update the technical design to match the current implementation.

Reflect:

* project architecture
* modules
* component interactions
* data flow
* important implementation decisions
* newly introduced systems
* removed or refactored systems

The document should describe the architecture **as it exists today**, not as it evolved.

---

### Step 3 — `tasks.md`

Update the task list so it represents the work that has already been completed.

For every implemented feature:

* add completed tasks if they do not already exist
* mark them as completed
* write them as if they were the original implementation plan that has now been finished

The document should read naturally, as though these tasks had been completed during normal project development.

## 4. DRY

Some historical changes may already be reflected in the documentation.

Do **not** duplicate information.

Merge related items where appropriate.

Prefer improving existing sections over creating redundant ones.

## 5. Handle commit history correctly

Be careful when analyzing history:

* later commits may overwrite earlier ones
* features may have been refactored
* code may have been moved
* implementations may have changed significantly
* commits may partially revert previous work

Document only the final, effective behavior.

## 6. Quality requirements

Before finishing, verify that:

* every implemented feature is documented
* obsolete information has been removed
* there are no contradictions
* there are no duplicate requirements
* architecture matches the current codebase
* completed tasks correspond to implemented functionality

The three documents should provide enough context that a future AI agent can understand the project without reading the commit history.

