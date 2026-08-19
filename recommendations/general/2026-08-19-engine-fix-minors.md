# Engine-fix minor follow-ups (Code Reviewer)
**Date:** 2026-08-19
**Source:** code-reviewer (engine-fix review, B4)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr) each

## 1. parseInt leniency in --max-bars parse
**Recommendation:** consider stricter validation than bare parseInt for `--max-bars` (e.g., reject "12abc" style input) in `backend/src/cli/backtest-cli.ts`.

## 2. Property-read of function members
**Recommendation:** consider whether reading `timeframe.in_seconds` as a property (without calling) should return NA or the function — currently it returns NA via the thunk path; confirm the desired Pine-compatible behavior.

## 3. Defensive limit guard in BybitBarFetcher (fetch-bars review)
**Date:** 2026-08-19
**Source:** code-reviewer (fetch-bars review, B8)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)
**Recommendation:** add a defensive `limit > 0` guard in auto-select-runner.ts BybitBarFetcher.fetchBars (slice(-0) == slice(0) would keep the OLDEST bars).

## 4. v1 cache orphans reclaimed only by LRU (fetch-bars review)
**Date:** 2026-08-19
**Source:** code-reviewer (fetch-bars review, B8)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)
**Recommendation:** CACHE_FORMAT_VERSION=2 invalidates v1 logically, but v1 files remain on disk until LRU/clear reclaims them. Consider eager cleanup. Acceptable as-is; note only.

## 5. Balance-fetch failure marks candle consumed-but-never-executed (equity T4 review)
**Date:** 2026-08-19
**Source:** code-reviewer (equity T4 review)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)
**Recommendation:** in live-strategy-executor.ts processCandle, `state.lastBarTimestamp`/`state.barIndex` are mutated BEFORE the awaited `fetchUsdcBalance()` (lines 480-498). When the fetch throws (RPC down), the candle is marked consumed but the bar never executes — the dedupe guard then rejects any retry of the same candle, so the bar is permanently dropped (series gap). Consider fetching the balance before mutating bar state, or re-fetch before the dedupe mutation.

## 6. Unnecessary `as any` cast + public equitySource field (equity T4 review)
**Date:** 2026-08-19
**Source:** code-reviewer (equity T4 review)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)
**Recommendation:** in strategy-builtins.ts registerStrategyEquityBuiltin, the `eng as any` cast is unnecessary — `builtins` is a public `@internal` field (execution-engine.ts:127), so `engine.builtins` type-checks directly. Also consider making the `equitySource` field private with `setEquitySource` as the only entry point (encapsulation; currently any caller can assign the field directly).
