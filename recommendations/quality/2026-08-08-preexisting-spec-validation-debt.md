# Pre-existing main spec validation debt (3 specs fail openspec validate)
**Date:** 2026-08-08
**Source:** QA Engineer (bulk archive gate) + `openspec validate --specs`
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Fix the 3 main specs that fail `openspec validate` — they were introduced by PRIOR archive commits (`1a1107a`, `065f977`), not by today's bulk archive:
- `openspec/specs/getMaxLookback-completeness/spec.md`
- `openspec/specs/manual-select-dropdowns/spec.md`
- `openspec/specs/token-type-system/spec.md`

## Rationale
The failures (missing SHALL/MUST wording or missing `## Requirements` section) make these capabilities invisible to `openspec list/validate/archive` and break the clean-validate baseline. They were reported as out-of-scope for the bulk archive and routed here.

## Evidence
QA report (2026-08-07): `openspec validate --specs` → 106/109 pass; 3 failures named above; git history attributes them to prior commits 1a1107a / 065f977.
