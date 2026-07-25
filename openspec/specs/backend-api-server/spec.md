## Purpose
Implement and verify Backend API Server functionality for the backend-api-server module.

## Requirements

### Requirement: Backend API Server
The backend SHALL provide an Express-based API server with WebSocket support for real-time chart data, script execution, and management.

#### Scenario: REST API Endpoints
- **WHEN** HTTP requests are made to the API
- **THEN** the backend SHALL respond with appropriate data (chart data, script list, execution results)

#### Scenario: WebSocket Connection
- **WHEN** a WebSocket connection is established
- **THEN** the backend SHALL stream real-time updates (price data, execution results)

#### Scenario: Script Execution via API
- **WHEN** a script execution request is received
- **THEN** the backend SHALL execute the script and return results

### Requirement: Health and Status Endpoint
The server SHALL expose a health/status endpoint that reports overall system health including disk cache statistics.

#### Scenario: Status includes disk cache stats
- **WHEN** querying `GET /api/status`
- **THEN** the response SHALL include `checks.diskCache` with fields: `entries` (number of cached symbol/interval pairs), `hitRate` (percentage), `diskUsageBytes` (total bytes on disk), `maxDiskUsageBytes` (configured limit)
