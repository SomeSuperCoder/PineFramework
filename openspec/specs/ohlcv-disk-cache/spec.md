## Purpose
Provide persistent disk-backed OHLCV bar data cache that survives backend server restarts.

## Requirements

### Requirement: Persistent OHLCV Disk Cache
The system SHALL maintain a persistent disk-backed cache for OHLCV bar data that survives backend server restarts.

#### Scenario: Data survives restart
- **WHEN** the backend server restarts
- **THEN** previously fetched OHLCV bars SHALL be served from disk cache without calling the Bybit API

#### Scenario: Cache directory structure
- **WHEN** the backend starts
- **THEN** it SHALL create the cache directory with files named `{symbol}_{interval}.ndjson`

### Requirement: Cache Read-Through Semantics
The disk cache SHALL act as L2 between the in-memory L1 cache and the Bybit API.

#### Scenario: L1 miss, L2 hit
- **WHEN** a request misses L1 but finds data on disk
- **THEN** the system SHALL return disk-cached data and repopulate L1

#### Scenario: L2 miss, API fetch
- **WHEN** a request misses both L1 and disk
- **THEN** the system SHALL fetch from Bybit API and write to both caches

### Requirement: Staleness Management
The cache SHALL differentiate between historical (immutable) and recent (staleable) bars.

#### Scenario: Historical bars are permanent
- **WHEN** bars are older than a configurable threshold (default 1 hour)
- **THEN** they SHALL be considered immutable and never re-fetched

### Requirement: Disk Space Management
The cache SHALL enforce a configurable maximum disk usage with LRU eviction.

#### Scenario: Max disk usage enforced
- **WHEN** total cache size exceeds configured maximum (default 500MB)
- **THEN** LRU eviction SHALL remove entries until below limit
