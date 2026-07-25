## MODIFIED Requirements

### Requirement: Health and Status Endpoint
The server SHALL expose a health/status endpoint that reports overall system health including disk cache statistics.

#### Scenario: Status includes disk cache stats (modified)
- **WHEN** querying `GET /api/status`
- **THEN** the response SHALL include `checks.diskCache` with fields: `entries` (number of cached symbol/interval pairs), `hitRate` (percentage), `diskUsageBytes` (total bytes on disk), `maxDiskUsageBytes` (configured limit)
