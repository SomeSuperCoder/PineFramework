## ADDED Requirements

### Requirement: Source file size limit
Source files SHALL be kept under 400 lines wherever the module contains clearly separable concerns. Files exceeding 700 lines MUST be evaluated for splitting into focused sub-modules.

#### Scenario: Large file identified for splitting
- **WHEN** a source file exceeds 700 lines
- **THEN** an engineer MUST evaluate whether the file contains multiple separable concerns and propose a split

#### Scenario: File with single concern exempt
- **WHEN** a source file exceeds 400 lines but implements a single cohesive concern (e.g., a dense state machine)
- **THEN** it MAY remain unsplit, with a comment explaining the rationale

### Requirement: Barrel re-export preservation
The existing public API surface MUST be preserved after any split. All exports from the original file MUST be re-exported from the containing directory's `index.ts` barrel file.

#### Scenario: Existing import continues to work
- **WHEN** a file is split into sub-modules
- **THEN** existing imports from the original module path MUST continue to resolve without changes

#### Scenario: New sub-module exports are accessible
- **WHEN** a sub-module introduces new internal exports
- **THEN** they MUST be exported from the barrel file if they were previously part of the public API

### Requirement: Behavioral preservation
Splits MUST NOT change runtime behavior. Every existing test MUST pass without modification after a split is applied.

#### Scenario: All tests pass after split
- **WHEN** a file split is completed
- **THEN** the full test suite MUST pass without any test modifications

#### Scenario: Commit includes only structural changes
- **WHEN** a file split is committed
- **THEN** the commit MUST contain no logic changes — only module extraction and import updates

### Requirement: Cohesive module boundaries
Extracted modules MUST group functions by domain responsibility, not by mechanical criteria (e.g., line count, alphabetical order).

#### Scenario: Domain-coherent extraction
- **WHEN** extracting functions from a large file
- **THEN** each new module MUST contain functions that operate on the same domain concept (e.g., all array methods, all drawing operations, all commission strategies)

### Requirement: No circular dependencies
Extracted modules MUST NOT introduce circular dependencies between each other.

#### Scenario: Dependency graph remains acyclic
- **WHEN** all extractions for a file are complete
- **THEN** the dependency graph between extracted modules MUST be acyclic (verified by TypeScript compiler or ESLint rule)
