# Cache-version/schema guard for ~/.pine/jupiter-fees.json
**Date:** 2026-08-14
**Source:** test-engineer (fee-fix-verification.json)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Add a cache-version/schema guard to the jupiter fee cache (`~/.pine/jupiter-fees.json`): the Bug Hunter's live probe left a corrupted `{"dexFeeBps": 0.25, "dexLabel": "1DEX"}` artifact in the cache that would have served the broken 100×-low fee to any backtest until expiry. A version field (and sanity bounds, e.g. reject bps values < 1) would make stale/corrupted artifacts self-invalidating instead of silently poisoning runs.

## Rationale
The 100× fee bug lived undetected partly because a cached value can outlive the code that wrote it. A cache-version guard prevents a stale-format entry from being trusted after a fetcher fix.

## Evidence
- `~/.pine/jupiter-fees.json` contained `dexFeeBps: 0.25` + label `"1DEX"` after the pre-fix probe; cleared manually before verification
- fee-fix-verification.json (TE run, cache cleared first)
