## ADDED Requirements

### Requirement: Unified Script Editor
The frontend SHALL provide a unified code editor for Pine Script with syntax highlighting, autocomplete, error highlighting, and multi-tab support.

#### Scenario: Syntax Highlighting
- **WHEN** the user types in the editor
- **THEN** Pine Script keywords, types, and functions SHALL be syntax highlighted

#### Scenario: Autocomplete
- **WHEN** the user types a partial identifier
- **THEN** the editor SHALL suggest completions

#### Scenario: Error Highlighting
- **WHEN** the script has a syntax or compilation error
- **THEN** the error SHALL be highlighted in the editor with a description

#### Scenario: Multi-Tab Editing
- **WHEN** the user opens multiple scripts
- **THEN** each SHALL appear in a separate editor tab

#### Scenario: Script Name Rename
- **WHEN** the user double-clicks a script tab name
- **THEN** the name SHALL become editable inline
