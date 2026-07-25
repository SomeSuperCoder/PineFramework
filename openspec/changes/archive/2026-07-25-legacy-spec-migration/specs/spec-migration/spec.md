## ADDED Requirements

### Requirement: Capability Spec Migration
All 48 legacy requirements SHALL be migrated from the flat-file system (requirements.md, design.md, tasks.md) into structured OpenSpec capability specs with formal Requirement/Scenario format.

#### Scenario: Spec File Creation
- **WHEN** the migration is executed
- **THEN** 48 capability spec files SHALL be created in `openspec/specs/<capability>/spec.md`

#### Scenario: Purpose Section
- **WHEN** each spec is created
- **THEN** it SHALL include a `## Purpose` section describing the capability

#### Scenario: Requirements Section
- **WHEN** each spec is created
- **THEN** it SHALL include a `## Requirements` section with at least one `### Requirement:` and `#### Scenario:` block

#### Scenario: Coverage
- **WHEN** the migration is complete
- **THEN** all 49 legacy requirements SHALL be covered by at least one capability spec

### Requirement: Architecture Documentation
The system architecture from design.md SHALL be extracted into `openspec/docs/architecture/system-architecture.md`.

#### Scenario: Architecture Doc Creation
- **WHEN** the architecture documentation is created
- **THEN** it SHALL document the 8-layer architecture, component map, and data flow

#### Scenario: Legacy Files Preserved
- **WHEN** the migration is complete
- **THEN** legacy files (requirements.md, design.md, tasks.md) SHALL remain in the repository until user approval for deletion
