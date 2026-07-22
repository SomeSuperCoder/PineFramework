## Context

The backend currently has a three-tier data access pattern for OHLCV bars:

1. **In-memory `OHLCVCache`** (TTL: 60s, max 100 entries) — fastest but ephemeral; lost on restart
2. **Bybit REST API** — authoritative source; rate-limited (100 requests/sec via `RateLimiter`), latency ~200-500ms, paginated fetches can take 200 sequential calls for deep history
3. **`DataEngine` in-memory store** in the root pine-framework package — separate from the backend's cache

Backtests via `fetchBars()` paginate through up to 200 pages of 1000 bars each, hitting the API every time. The `/api/ohlcv` and `/api/bars` routes use the in-memory cache but also fall through to the API on every miss. Historical data (bars older than 1 hour) is immutable on Bybit — it will never change — yet we re-fetch it on every server restart or TTL expiry.

The existing `backend/data/` directory is already gitignored and used for persistent storage (telegram config, scripts, indicators). This is the natural location for a disk cache.

## Goals / Non-Goals

**Goals:**
- Persist OHLCV bar data to disk so it survives server restarts
- Serve cached historical bars from disk instead of hitting the Bybit API
- Keep recent bars (configurable TTL, default 60s) fresh with periodic re-fetch
- Integrate transparently into existing routes so callers don't change
- Add cache stats (entries, hit rate, disk usage) to the `/api/status` endpoint
- Minimize new dependencies — use only Node.js built-in `fs` module

**Non-Goals:**
- Replacing the in-memory `OHLCVCache` — it stays as L1 cache in front of the disk L2
- Caching realtime WebSocket bars (forming candles) — they are already handled by the in-memory cache
- Adding a separate cache management UI — stats-only via status endpoint
- Sharding across multiple machines or distributed caching
- Compression of cached data (plain JSON is fine for the data volumes involved)

## Decisions

### Decision 1: Two-layer cache (L1 in-memory → L2 disk → Bybit API)
**Rationale**: The existing `OHLCVCache` provides sub-millisecond L1 lookup. The new `DiskOHLCVCache` sits between it and the API as L2. On a miss from L1, we check L2 (disk). On a miss from L2, we fetch from Bybit and write back to both layers. This preserves the existing hot-path performance while adding persistence.

**Alternatives considered**: Single unified cache with disk + memory — rejected because it would require rewriting the existing, working L1 cache and introduces complexity for no benefit.

### Decision 2: One file per `(symbol, interval)` pair, append-only NDJSON
**Rationale**: NDJSON (newline-delimited JSON) allows append-only writes — we never rewrite the entire history for a symbol/interval pair. Each line is one bar object. When reading, we scan from the end (most recent N bars) or from a start timestamp. This is efficient for the typical access pattern: "get the latest N bars" or "get bars since timestamp X".

**Format**: Each file is named `{symbol}_{interval}.ndjson` (e.g., `BTCUSDT_60.ndjson`). A companion metadata file `{symbol}_{interval}.meta.json` stores:
- `oldestTimestamp`: first bar's timestamp in the file
- `newestTimestamp`: last bar's timestamp in the file
- `lastFetchedAt`: ISO timestamp of last API fetch (for TTL calculation)
- `barCount`: total bar count
- `fileSizeBytes`: last known file size

**Alternatives considered**:
- SQLite — adds a dependency, overkill for simple append-only time-series
- Single JSON file per pair — rewriting the entire file on every append is O(n) and wasteful
- LevelDB/RocksDB — adds native deps, not worth it for this use case

### Decision 3: Staleness by bar age, not wall-clock TTL
**Rationale**: Historical bars (older than a configurable `historicalThresholdMs`, default 1 hour) are immutable on Bybit's API and never need re-fetching. Only the "recent window" (within the threshold) needs periodic refresh. This means:
- Bars with `timestamp < (now - historicalThresholdMs)` are treated as permanent — never re-fetched
- Bars within the recent window are re-fetched if `lastFetchedAt` is older than `recentTtlMs` (default 60s)

This is more nuanced than a single TTL and dramatically reduces API calls for deep history.

### Decision 4: LRU eviction for disk space
**Rationale**: Historical data accumulates over time. We set a maximum disk usage (configurable, default 500MB) and evict the least-recently-accessed `(symbol, interval)` files when the limit is exceeded. "Accessed" is tracked via the `lastFetchedAt` field in the metadata file (updated on every read-through cache hit).

### Decision 5: Read-through integration in `fetch-bars.ts`
**Rationale**: The paginated `fetchBars()` function in `backend/src/bybit/fetch-bars.ts` is the primary consumer for backtests. Integrating disk cache at this level means backtests automatically benefit. The integration works as follows:
1. Check disk cache for the requested `(symbol, interval, start, end)` range
2. If the range is fully covered by cached data and recent-enough, return from disk
3. If partially covered, fetch only the missing range from Bybit, merge, write back
4. If not covered at all, delegate to the existing API pagination loop, then write back

**Alternatives considered**: Adding cache to each route separately — creates duplication and misses the `fetchBars()` entry point used by backtests.

## Risks / Trade-offs

- **[Risk] NDJSON scan performance degrades with very deep history** (e.g., 1-minute bars for 5 years = ~2.6M bars). **Mitigation**: The metadata file tracks `oldestTimestamp` and `newestTimestamp`, allowing binary-search-style reading. For full scans, Node.js `fs.createReadStream` with a line-by-line transform is efficient for up to millions of bars. If this becomes a bottleneck, we can add an index file later.
- **[Risk] Concurrent writes to the same cache file** — if two requests simultaneously miss cache for the same symbol/interval, both will fetch from Bybit and both will try to write. **Mitigation**: Use an in-memory write lock per `(symbol, interval)` key (a simple `Map<string, Promise<void>>`). The second writer waits for the first to complete, then rechecks the cache.
- **[Risk] Disk space fills up** — Bybit has thousands of symbols. **Mitigation**: Configurable max disk space (default 500MB) with LRU eviction. The status endpoint reports usage. A periodic background sweep cleans up old files.
- **[Risk] Stale data served for recent bars** — the recent TTL (60s) matches the existing in-memory cache behavior, so this is not a regression. **Mitigation**: The metadata file tracks `lastFetchedAt` so we know exactly how stale the data is.
- **[Risk] File corruption during write** — a crash mid-write could leave a partial NDJSON line. **Mitigation**: Write to a `.tmp` file first, then atomic `rename` to the final `.ndjson` file. On startup, the last incomplete line (if any) is trimmed.

## Migration Plan

1. Create `DiskOHLCVCache` class with read/write/evict logic
2. Create unit tests (`DiskOHLCVCache.test.ts`) with temp directories
3. Wire into `backend/src/index.ts` alongside existing `OHLCVCache`
4. Modify `backend/src/routes/ohlcv.ts` and `backend/src/routes/bars.ts` to check disk cache on L1 miss
5. Modify `backend/src/bybit/fetch-bars.ts` to check disk cache on entry, write back on API fetch
6. Add cache stats to `backend/src/routes/status.ts`
7. Integration test: start server, fetch bars, restart, verify bars served from cache
8. No migration needed for existing data — the cache starts empty and populates on first fetch

## Open Questions

- What is the actual Bybit API rate limit for the kline endpoint? Currently assumed 100 req/sec based on `RateLimiter` settings. If lower, the cache becomes even more critical.
- Should the cache distinguish between "this range is fully cached" vs "partially cached, fetch the rest"? Current design handles partial coverage via merge logic in `fetch-bars.ts`.
- What's the typical number of symbols a user watches simultaneously? This affects the disk space calculation and eviction strategy.
