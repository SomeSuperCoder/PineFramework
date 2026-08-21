# [Profile engine/builtin boundary churn — 2000-bar supertrend-3d ~90s/run]
**Date:** 2026-08-21
**Source:** Performance Engineer (b13-decimal investigation)
**Priority:** medium
**Status:** pending
**Effort:** large (>4hr)

## Recommendation
decimal.js DP was REFUTED as the compute-cost driver (op cost flat across DP 10-20; outputs identical via toNumber() exit — see b13-decimal.json numbers table). Real cost suspected in engine/builtin boundary churn & allocations. Run `node --cpu-prof` on the existing harness (tools/perf/b13-dp-bench.test.ts pattern, 2000-bar supertrend-3d, ~90 s/run) and attack the actual hot paths (allocation churn at the Decimal<->PineValue boundary is the prime suspect).

## Rationale
Cancellation/yielding fixed responsiveness; wall-clock compute remains slow for heavy scripts. Fixing the true hotspot reduces how often cancellation matters.

## Evidence
data/handoffs/team/platform/performance-engineer/b13-decimal.json (bench table + microbench validation)
