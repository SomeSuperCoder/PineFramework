# Live-fee staleness surfacing + THROW-gap (fee fetcher)
**Date:** 2026-08-14
**Source:** security-engineer (parity-security.json, note 1)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Surface fee-source staleness to the user and close the THROW gap in `applyDexFee` (backend/src/backtest-config.ts): the underlying `jupiter-fee-fetcher` serves a 30-day disk cache / non-expiring session cache before the 10-min TTL policy can throw — so a "live fee" can be up to 30 days stale while the run proceeds. Consider: (a) emitting a `live-fee-cache`-style warning when the served fee is older than a freshness bound, and (b) documenting or tightening the fetcher's session-cache expiry so the THROW-on-failure policy is actually reachable.

## Rationale
The trust promise is "what actually ran is what's shown". A stale fee that looks fresh silently undercuts that promise; the documented THROW policy is currently softer than it appears.

## Evidence
- security-engineer parity-security.json note 1: "fetcher silently serves 30-day disk cache / non-expiring session cache before throwing"
- backend/src/backtest-config.ts applyDexFee (10-min TTL cache is a call-frequency bound, not freshness)
