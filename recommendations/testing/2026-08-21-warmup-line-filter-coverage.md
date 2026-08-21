# [Warmup line-removal branch has zero test coverage]
**Date:** 2026-08-21
**Source:** Test Engineer (b6-engine verification wave)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Add unit tests for the type-aware line filter in `src/language/runtime/interpreter.ts:511-518` (applyLookbackFilter): (a) a `bar_time` line anchored on a warmup timestamp is removed; (b) a `bar_index` line with `x1 < warmupCount` is removed; (c) a `bar_index` line with `x1 >= warmupCount` survives; (d) a `bar_time` line outside warmup survives.

## Rationale
The B6 fix made bar_index lines actually filterable (previously they survived by type mismatch), but the new branch ships with zero test coverage — a regression would be silent.

## Evidence
interpreter.ts:511-518; TE report b6-engine.json ("coverage gap: interpreter.ts:511-518 warmup line-removal has zero test coverage").
