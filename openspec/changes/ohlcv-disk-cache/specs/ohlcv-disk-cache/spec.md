## ADDED Requirements

### Requirement: Persistent OHLCV Disk Cache
The system SHALL maintain a persistent disk-backed cache for OHLCV bar data that survives backend server restarts.

#### Scenario: Data survives restart
- **WHEN** the backend server restarts
- **THEN** previously fetched OHLCV bars SHALL be served from disk cache without calling the Bybit API

#### Scenario: Cache directory structure
- **WHEN** the backend starts
- **THEN** it SHALL create `backend/data/ohlcv-cache/` if it does not exist, with files named `{symbol}_{interval}.ndjson` and `{symbol}_{interval}.meta.json` per cached pair

### Requirement: Cache Read-Through Semantics
The disk cache SHALL act as L2 between the in-memory L1 cache and the Bybit API, with automatic write-back on API fetches.

#### Scenario: L1 miss, L2 hit
- **WHEN** a request misses the in-memory cache but finds data on disk
- **THEN** the system SHALL return the disk-cached data and repopulate the in-memory cache

#### Scenario: L2 miss, API fetch
- **WHEN** a request misses both in-memory and disk caches
- **THEN** the system SHALL fetch from Bybit API, write the result to both caches, and return the data

#### Scenario: Partial cache coverage
- **WHEN** a request range is partially covered by disk cache
- **THEN** the system SHALL fetch only the missing range from Bybit, merge with cached data, and write back the merged result

### Requirement: Staleness Management
The cache SHALL differentiate between historical (immutable) and recent (staleable) bars for TTL purposes.

#### Scenario: Historical bars are permanent
- **WHEN** bars are older than a configurable threshold (default 1 hour)
- **THEN** they SHALL be considered immutable and never re-fetched from Bybit

#### Scenario: Recent bars have TTL
- **WHEN** bars are within the recent threshold
- **THEN** they SHALL be re-fetched if the cache entry's `lastFetchedAt` is older than the recent TTL (default 60s)

### Requirement: Disk Space Management
The cache SHALL enforce a configurable maximum disk usage with LRU eviction.

#### Scenario: Max disk usage enforced
- **WHEN** the total cache directory size exceeds the configured maximum (default 500MB)
- **THEN** the system SHALL evict the least-recently-accessed (symbol, interval) pair files until usage is below the limit

#### Scenario: Atomic writes prevent corruption
- **WHEN** writing to the cache
- **THEN** the system SHALL write to a `.tmp` file first, then atomically rename to the final `.ndjson` path

### Requirement: Cache Statistics
The system SHALL expose disk cache statistics for monitoring.

#### Scenario: Stats exposed via status endpoint
- **WHEN** querying `/api/status`
- **THEN** the response SHALL include disk cache entries count, hit rate, and disk usage in bytes

#### Scenario: Stats track reads and writes
- **WHEN** the cache is accessed
- **THEN** hit/miss counters SHALL be updated and persisted in the metadata for accurate reporting
