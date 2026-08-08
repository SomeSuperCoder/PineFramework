# [Line filter compares bar-index to ms-timestamp Set — latent bug]
**Date:** 2026-08-08
**Source:** Bug Hunter + Code Reviewer (report-only, intentionally not fixed this wave)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
applyLookbackFilter's line filter (interpreter.ts ~383-386 / pre-edit 373-377) checks `line.x1` (a bar-index number, drawing-builtins.ts:93) against `warmupTimestamps` (Set of ms timestamps) — never matches, so lines survive warmup by accident. Fix with a type-aware check (bar-index set for lines, ms-timestamp set for time-based lines) once the lookback wave lands.

## Rationale
Lines currently survive warmup only by a type mismatch — if the timestamp side is ever normalized, the filter behavior silently changes.

## Evidence
interpreter.ts:383-386, drawing-builtins.ts:93; Bug Hunter verdict 2026-08-08 (backbone/rightmost test line survival).