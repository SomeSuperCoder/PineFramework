# LICENSE file missing — declared MIT is not legally binding
**Date:** 2026-08-13
**Source:** team/core/scout + team/research/documentation-writer (README rewrite)
**Priority:** high
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Ship an actual `LICENSE` file at the repo root. `package.json` declares `"license": "MIT"` but no `LICENSE` file exists anywhere in the repo — until it ships, the MIT declaration is not legally binding and may block external use/redistribution.

## Rationale
The new README states the license truthfully ("MIT declared — LICENSE file pending") so consumers are warned, but the gap itself remains a legal risk for any external contributor or user. A standard MIT license text file resolves it.

## Evidence
- `package.json` → `"license": "MIT"` (verified)
- No `LICENSE` file at root (`ls -la` — verified during README rewrite, 2026-08-13)
- README.md License section (line 478): "**MIT (declared in `package.json`)** — the actual **`LICENSE` file is pending**."
