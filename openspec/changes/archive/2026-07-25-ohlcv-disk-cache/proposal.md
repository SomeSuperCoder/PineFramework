## Why

Every REST request for OHLCV data (`/api/ohlcv`, `/api/bars`) and every backtest that fetches historical bars hits the Bybit API on cache miss. The current in-memory `OHLCVCache` (60s TTL, 100 entries) is lost on server restart, forcing re-fetch of the same historical data repeatedly. This wastes API rate limits, increases latency for users, and makes the backend unnecessarily dependent on Bybit availability for data that rarely changes (historical bars).

## What Changes

- Introduce a **disk-backed OHLCV cache** stored in `backend/data/ohlcv-cache/` (already gitignored) that persists across server restarts
- Cache structure: one JSON/NDJSON file per `(symbol, interval)` pair, keyed by bar timestamp, with metadata for staleness checks
- Historical bars (older than a configurable threshold, e.g., 1 hour) are treated as **immutable** — fetched once from Bybit, cached permanently
- Recent bars are cached with a configurable TTL (default 60s) to match the current in-memory behavior
- Add a `DiskOHLCVCache` class that layers between the in-memory `OHLCVCache` and the Bybit API call, with read-through semantics
- When the in-memory cache misses, check disk cache before hitting the API; on API fetch, always write back to both caches
- Expose cache stats (disk usage, hit rate, entry count) via the status endpoint
- No breaking changes to the API contract — routes continue to accept the same parameters and return the same shapes

## Capabilities

### New Capabilities
- `ohlcv-disk-cache`: Persistent disk-backed cache for OHLCV bar data, with read-through semantics, TTL management, and LRU eviction for disk space limits

### Modified Capabilities
- `bybit-integration`: The "REST Historical Data" scenario augments — the backend SHALL serve cached data from disk when available, falling back to Bybit API only on cache miss, reducing redundant API calls
- `backend-api-server`: The `/api/status` endpoint SHALL expose disk cache statistics (entries, hit rate, disk usage)

## Impact

- `backend/src/cache/` — new `DiskOHLCVCache.ts` and `DiskOHLCVCache.test.ts`
- `backend/src/routes/ohlcv.ts` — layer disk cache between in-memory cache and Bybit fetch
- `backend/src/routes/bars.ts` — same layering
- `backend/src/routes/backtest.ts` — `fetchBars()` call benefits automatically if the disk cache integrates into `fetch-bars.ts`
- `backend/src/bybit/fetch-bars.ts` — optional: add disk cache read-through to avoid redundant paginated fetches
- `backend/src/routes/status.ts` — add disk cache stats to health check response
- `backend/src/index.ts` — instantiate and wire `DiskOHLCVCache` alongside `OHLCVCache`
- `backend/.gitignore` — verify `ohlcv-cache/` pattern (already covered by `backend/data/`)
- `backend/package.json` — may need `lru-cache` or similar (prefer native Node.js `fs` to minimize dependencies)
