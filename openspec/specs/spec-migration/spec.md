## Purpose
Migrate legacy flat-file requirements into structured OpenSpec capability specs.

## Requirements

### Requirement: Capability Spec Migration
All legacy requirements SHALL be migrated from the flat-file system into structured OpenSpec capability specs.

#### Scenario: Spec File Creation
- **WHEN** the migration is executed
- **THEN** 48+ capability spec files SHALL be created in `openspec/specs/<capability>/spec.md`

#### Scenario: Purpose Section
- **WHEN** each spec is created
- **THEN** it SHALL include a `## Purpose` section describing the capability

#### Scenario: Requirements Section
- **WHEN** each spec is created
- **THEN** it SHALL include a `## Requirements` section with at least one Requirement and Scenario block

### Requirement: Architecture Documentation
The system architecture SHALL be extracted into `openspec/docs/architecture/system-architecture.md`.

#### Scenario: Architecture Doc Creation
- **WHEN** the architecture documentation is created
- **THEN** it SHALL document the 8-layer architecture, component map, and data flow
