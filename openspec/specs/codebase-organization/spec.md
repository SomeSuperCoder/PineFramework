## Purpose
Establish rules for source file organization including size limits, barrel exports, and cohesive module boundaries.

## Requirements

### Requirement: Source file size limit
Source files SHALL be kept under 400 lines wherever the module contains clearly separable concerns. Files exceeding 700 lines MUST be evaluated for splitting.

#### Scenario: Large file identified for splitting
- **WHEN** a source file exceeds 700 lines
- **THEN** an engineer MUST evaluate whether the file contains multiple separable concerns and propose a split

#### Scenario: File with single concern exempt
- **WHEN** a source file exceeds 400 lines but implements a single cohesive concern
- **THEN** it MAY remain unsplit, with a comment explaining the rationale

### Requirement: Barrel re-export preservation
The existing public API surface MUST be preserved after any split.

#### Scenario: Existing import continues to work
- **WHEN** a file is split into sub-modules
- **THEN** existing imports from the original module path MUST continue to resolve without changes

### Requirement: Behavioral preservation
Splits MUST NOT change runtime behavior. Every existing test MUST pass without modification.

#### Scenario: All tests pass after split
- **WHEN** a file split is completed
- **THEN** the full test suite MUST pass without any test modifications

### Requirement: Cohesive module boundaries
Extracted modules MUST group functions by domain responsibility, not by mechanical criteria.

#### Scenario: Domain-coherent extraction
- **WHEN** extracting functions from a large file
- **THEN** each new module MUST contain functions that operate on the same domain concept

### Requirement: No circular dependencies
Extracted modules MUST NOT introduce circular dependencies.

#### Scenario: Dependency graph remains acyclic
- **WHEN** all extractions for a file are complete
- **THEN** the dependency graph between extracted modules MUST be acyclic
