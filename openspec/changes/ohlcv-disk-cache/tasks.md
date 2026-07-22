## 1. DiskOHLCVCache Core Implementation

- [x] 1.1 Create `backend/src/cache/DiskOHLCVCache.ts` — main class with NDJSON read/write, metadata management, atomic writes using `.tmp` + `rename`, and per-key write locks

- [x] 1.2 Implement `get(symbol, interval, start?, end?)` — reads from NDJSON file, scans bars in the requested timestamp range, returns matching bars; updates `lastAccessed` in metadata

- [x] 1.3 Implement `set(symbol, interval, bars)` — appends new bars to the NDJSON file (skipping duplicates by timestamp), updates metadata (`newestTimestamp`, `barCount`, `lastFetchedAt`), uses atomic write pattern

- [x] 1.4 Implement staleness logic — `isStale(symbol, interval)`: returns `false` if the newest bar's timestamp is older than `historicalThresholdMs` (permanent), otherwise checks if `lastFetchedAt` exceeds `recentTtlMs`

- [x] 1.5 Implement disk space management — `enforceDiskLimit()`: walks cache directory, calculates total size, evicts LRU entries (by `lastAccessed` in metadata) until below `maxDiskUsageBytes`

- [x] 1.6 Implement `getStats()` — returns `{ entries, hitRate, diskUsageBytes, maxDiskUsageBytes, hits, misses }` for the status endpoint

- [x] 1.7 Ensure the cache directory `backend/data/ohlcv-cache/` is created on instantiation if it doesn't exist

## 2. Unit Tests

- [x] 2.1 Write `backend/tests/disk-ohlcv-cache.test.ts` — test with temp directories: verify NDJSON files are created with correct structure

- [x] 2.2 Test `get`/`set` round-trip: write bars, read them back and verify timestamps, OHLCV values match

- [x] 2.3 Test deduplication: writing a bar with an existing timestamp updates it instead of appending

- [x] 2.4 Test atomic write: simulate crash during `.tmp` write, verify the `.ndjson` file is not corrupted

- [x] 2.5 Test staleness: historical bars (older than threshold) return `isStale = false` even after long wall-clock time; recent bars return `isStale = true` after TTL

- [x] 2.6 Test LRU eviction: fill cache beyond `maxDiskUsageBytes`, verify oldest-accessed entries are evicted

- [x] 2.7 Test partial range reads: write bars with timestamps T1..T100, read range T20..T50, verify only matching bars returned

## 3. Integration into Routes and Data Fetching

- [x] 3.1 Modify `backend/src/index.ts` — instantiate `DiskOHLCVCache` alongside `OHLCVCache`, pass to route factories

- [x] 3.2 Modify `backend/src/routes/ohlcv.ts` — on in-memory cache miss, check disk cache before calling Bybit API; on API fetch, write back to both caches

- [x] 3.3 Modify `backend/src/routes/bars.ts` — same layering as `ohlcv.ts`

- [x] 3.4 Modify `backend/src/bybit/fetch-bars.ts` — at function entry, check disk cache for the requested `(symbol, interval, startDate?, endDate?)` range; serve from cache if covered and not stale, write back on API fetch

- [x] 3.5 Modify `backend/src/routes/status.ts` — add `checks.diskCache` with stats from `DiskOHLCVCache.getStats()`

## 4. Integration Tests

- [x] 4.1 Write `backend/tests/disk-cache-integration.test.ts` — full round-trip (simulate restart), verify cache files persist and serve data across instances

- [x] 4.2 Test backtest path: `fetchBars()` with disk cache — first call hits mock API and writes cache, second call serves from cache without any API call

- [x] 4.3 Test overlapping ranges: write T1..T100, query T20..T50 and T40..T80 — both served from cache

- [x] 4.4 Test cache eviction: configure tight `maxDiskUsageBytes`, write many symbols, verify LRU eviction brings disk usage below limit

## 5. Cleanup & Documentation

- [x] 5.1 Startup log line in constructor — already present in `DiskOHLCVCache` constructor via `logger.info`

- [x] 5.2 JSDoc added to `DiskOHLCVCache` class and public methods — explains cache layers, staleness rules, and atomic write guarantees

- [x] 5.3 Run full test suite: `pnpm test` — 98 test files, 1599 tests pass (no regressions)

- [ ] 5.4 Commit all changes with conventional commit message
