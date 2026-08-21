# [WS live-tick churn + heavy indicator starves ALL backend HTTP (>8s timeouts)]
**Date:** 2026-08-21
**Source:** Frontend Engineer (b16 remove-during-compute e2e discovery)
**Priority:** high
**Status:** pending
**Effort:** large (>4hr)

## Recommendation
WS live-tick churn re-executes registered indicators continuously; any indicator taking >~2s starves ALL backend HTTP (GETs time out >8s) despite the B1 50-bar async yields. The yielding fixed event-loop blocking per-bar, but continuous churn re-queues compute faster than the loop drains it. Investigate: compute scheduling (task queue fairness / max-bytes-per-tick budget), deduplicating in-flight recomputes, or moving indicator compute off the API process (worker thread).

## Rationale
The "API stays responsive during computation" guarantee does not hold under live churn with heavy indicators — a production availability risk once live tick feeds run with complex strategies.

## Evidence
data/handoffs/team/frontend/frontend-engineer/b16-e2e.json (route.fetch probe timings; >8s GET timeouts under churn)
