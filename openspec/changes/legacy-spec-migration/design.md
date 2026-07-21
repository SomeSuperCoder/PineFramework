## Context

The project used a flat-file legacy spec system (requirements.md, design.md, tasks.md) that was unstructured and hard to navigate across 49 requirements spanning 3 files (requirements.md, design.md, tasks.md). These files accumulated over the development lifecycle without consistent cross-referencing. The project had already initialized OpenSpec but the specs directory was empty and no content had been migrated.

## Goals / Non-Goals

**Goals:**
- Migrate all 48 legacy requirements into OpenSpec capability specs with formal Requirement + Scenario format
- Extract high-level architecture documentation from design.md into openspec/docs/
- Produce a migration report tracing each requirement to its target spec
- Document the migration as an OpenSpec change

**Non-Goals:**
- No code changes or restructuring of the implementation
- No changes to test infrastructure or configuration
- No migration of tasks.md (all 144 tasks were already marked complete)

## Decisions

1. **Split by capability, not by file** — Legacy requirements.md had 48 requirements across 16 domains. Grouped into 48 capability specs for granularity and discoverability.

2. **Preserve legacy files until review** — No automatic deletion. User must approve before removal.

3. **Schema: spec-driven** — Kept the existing schema. Specs are the source of truth; design and task artifacts derive from them.

4. **Architecture doc as summary** — The full design.md (3139 lines) was too detailed for a single doc. Only the high-level layer architecture, component map, and data flow were extracted to openspec/docs/. Sub-component design details were folded into the relevant spec scenarios.

5. **Tasks.md not migrated** — All 144 tasks were marked complete. No actionable items remained. Future implementation tracking should use OpenSpec change tasks.

## Risks / Trade-offs

- **Granularity risk**: 48 specs may be too many for some teams. Trade-off: easier to find and update individual capabilities vs. fewer, larger specs.
- **Design.md detail loss**: Some algorithm-level detail (exact class interfaces, rendering layer ordering, race-condition fixes) from design.md is now only in git history rather than structured docs. Mitigation: critical implementation details were preserved as spec scenarios (e.g., forming-candle lifecycle, alert dedup layers).
- **Loss of cross-referencing**: Legacy tasks.md had requirement cross-references (e.g., `_Requirements: 1.1, 1.2_`). OpenSpec specs don't carry those — future work should reference specs directly.
