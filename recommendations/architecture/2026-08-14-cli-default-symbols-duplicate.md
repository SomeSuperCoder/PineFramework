# Remove hardcoded DEFAULT_SYMBOLS duplicate in CLI
**Date:** 2026-08-14
**Source:** backend-engineer (ssot-pairs handoff) + QA (qa.json finding)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
`backend/src/cli/types.ts:98` hardcodes `DEFAULT_SYMBOLS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT']` — a 5-symbol duplicate of the SSOT that (a) misses DOGEUSDT/ADAUSDT and (b) misses the 5 new USDC pairs (PAXGUSDC, GOLDUSDC, GLDXUSDC, TSLAXUSDC, AAPLXUSDC). Per the SSOT law in `token-registry.ts` ("No other file should hardcode token addresses or symbol lists"), this should derive from `getTradablePairs()` (or a scoped default slice) instead of being maintained by hand.

## Rationale
Two sources of truth = drift (this list already diverged from the 7-pair registry before the +5 expansion). Every future pair addition will silently break the CLI default list.

## Evidence
- `backend/src/cli/types.ts:98` — `DEFAULT_SYMBOLS` hardcoded (5 symbols)
- `src/trading/token-registry.ts` — SSOT header: "No other file should hardcode token addresses or symbol lists"
- Scout report: duplicate list confirmed (5 vs 7), now 5 vs 12
