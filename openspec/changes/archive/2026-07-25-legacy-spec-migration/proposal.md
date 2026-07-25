# Migrate Legacy Spec System to OpenSpec

## Summary
Migrate the project's existing requirements.md, design.md, and tasks.md files into the OpenSpec format, creating structured capability specs, architecture documentation, and a migration report.

## Motivation
The legacy flat-file spec system (requirements.md = 49 requirements, design.md = 3139 lines of architecture/component specs, tasks.md = 2847+ implementation tasks) was unstructured and hard to navigate. OpenSpec provides:
- Per-capability spec files with formal Requirement/Scenario format
- Architecture docs organized in a docs/ directory
- A change-tracking system for future work
- CLI integration for collaborative development

## Scope
- Preserve all 49 legacy requirements as OpenSpec specs across 48 capability groups
- Extract architecture documentation from design.md
- Produce MIGRATION_REPORT.md tracking coverage
- Do NOT delete legacy files (requires user approval)

## Non-goals
- No code changes
- No restructuring of the implementation
- No changes to test infrastructure

## Design
### Structure
```
openspec/
├── config.yaml                   ← Updated with project context
├── docs/
│   └── architecture/
│       └── system-architecture.md
├── specs/                        ← 48 capability specs
│   ├── language-parser/
│   │   └── spec.md
│   ├── type-system/
│   │   └── spec.md
│   ├── execution-engine/
│   │   └── spec.md
│   ├── ta-functions/
│   │   └── spec.md
│   ... (44 more)
├── changes/
│   └── legacy-spec-migration/
│       └── proposal.md
```

### Capability Group Mapping
| # | Capability | Legacy Requirements |
|---|-----------|-------------------|
| 1 | language-parser | R1 |
| 2 | type-system | R2 |
| 3 | execution-engine | R3 |
| 4 | ta-functions | R4 |
| 5 | multi-symbol-data | R5 |
| 6 | plotting-visualization | R6 |
| 7 | drawing-objects | R7 |
| 8 | strategy-execution | R8 |
| 9 | extensibility | R9 |
| 10 | performance-scalability | R10 |
| 11 | testing-compatibility | R11 |
| 12 | input-configuration | R12 |
| 13 | string-time-functions | R13 |
| 14 | alert-system | R14 |
| 15 | color-system | R15 |
| 16 | script-declaration | R16, R48 |
| 17 | frontend-application | R17 |
| 18 | monorepo-structure | R18 |
| 19 | backend-api-server | R19 |
| 20 | bybit-integration | R20 |
| 21 | canvas-charting-library | R21 |
| 22 | strategy-backtest-engine | R22, R43 |
| 23 | script-bank-management | R24 |
| 24 | unified-script-editor | R25 |
| 25 | telegram-notification | R23 |
| 26 | ai-agent-integration | R26 |
| 27 | file-based-storage | R27 |
| 28 | separate-indicator-panes | R29 |
| 29 | dynamic-indicator-management-ui | R30, R42 |
| 30 | multi-version-support | R31 |
| 31 | progressive-computation | R32 |
| 32 | time-based-rendering | R33 |
| 33 | dark-theme | R34 |
| 34 | auto-scale-toggle | R35 |
| 35 | scroll-re-execution | R36 |
| 36 | parser-lowercase-types | R37 |
| 37 | builtin-test-indicators | R38 |
| 38 | forming-candle-lifecycle | R39 |
| 39 | index-based-rendering | R40 |
| 40 | forming-candle-colors | R41 |
| 41 | quick-indicator-adder | R42 |
| 42 | cli-backtest-tool | R43 |
| 43 | chart-viewport-autofit | R44 |
| 44 | time-module | R45 |
| 45 | go-to-date | R46 |
| 46 | error-console | R47 |
| 47 | single-strategy-enforcement | R48 |
| 48 | footer-bar | R49 |

### Legacy File Status
- requirements.md: Preserved (reference source). All 49 requirements migrated to specs.
- design.md: Preserved (reference source). Architecture overview migrated to openspec/docs/.
- tasks.md: Preserved (reference source). Not migrated (OpenSpec task format differs significantly).

## Tasks
1. Update openspec/config.yaml with project context ✓
2. Create directory structure for 48 capability specs ✓
3. Create spec.md for each capability ✓
4. Create architecture documentation ✓
5. Generate MIGRATION_REPORT.md
6. Present to user for review before removing legacy files
