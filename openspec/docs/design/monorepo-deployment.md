## Monorepo Architecture

### 1. Package Structure

```
pine-framework/
+-- pnpm-workspace.yaml         # Declares workspace packages
+-- package.json                 # Root package: "pine-framework" (engine library)
+-- pnpm-lock.yaml              # Single lockfile for all packages
+-- tsconfig.json               # Base TypeScript config
|
+-- src/                         # Engine source code (part of root package)
|   +-- ...
|
+-- frontend/                    # React frontend application
|   +-- package.json             # Name: "pine-framework-frontend"
|   +-- vite.config.ts
|   +-- src/
|
+-- backend/                     # Express backend server
    +-- package.json             # Name: "pine-framework-backend"
    +-- src/
```

### 2. Workspace Configuration

```yaml
# pnpm-workspace.yaml
packages:
  - "frontend"   # React app
  - "backend"    # Express server
# Note: engine library is the root package, not a workspace member
```

### 3. Dependency Graph

```
pine-framework (root package -- engine library)
    ^ workspace:*
    +-- frontend -- uses engine types + API
    +-- backend  -- uses engine for script execution + Bybit adapter
```

### 4. Root Scripts

```json
{
  "scripts": {
    "dev": "concurrently \"pnpm --filter pine-framework-backend dev\" \"pnpm --filter pine-framework-frontend dev\"",
    "build": "pnpm --filter pine-framework run build:lib && pnpm --filter pine-framework-backend run build && pnpm --filter pine-framework-frontend run build",
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck"
  }
}
```

## Deployment and Operations

### 1. Deployment Architecture

**Monorepo Development:**
- Single `pnpm install` at root installs all packages
- `pnpm dev` starts backend (port 8080) and frontend (port 3000) concurrently
- Frontend Vite proxy forwards `/api` and `/ws` to backend
- Engine library consumed via workspace protocol

**Production Deployment:**
- `pnpm build` builds all packages in dependency order
- Backend serves API endpoints on port 8080
- Frontend static files served by backend or CDN
- Docker container with Node.js runtime

**Server Deployment:**
- REST API for script execution
- WebSocket for realtime updates
- Load balancing and scaling
- High availability configuration

**Embedded Library:**
- C/C++ API for integration
- Language bindings (Python, JavaScript, etc.)
- Customizable components
- Reduced dependency footprint

### 2. Configuration Management

**Application Configuration:**
- Performance tuning parameters
- Plugin directory locations
- Data source configurations
- Logging and monitoring settings

**Script Configuration:**
- Input parameter defaults
- Execution preferences
- Rendering options
- Alert configurations

### 3. Monitoring and Maintenance

**Health Monitoring:**
- System resource usage
- Script execution status
- Data feed connectivity
- Plugin health checks

**Logging and Diagnostics:**
- Structured logging
- Performance metrics collection
- Error reporting and aggregation
- Audit trails for security

**Maintenance Operations:**
- Plugin updates
- Data cache management
- Performance optimization
- Backup and recovery procedures

### 4. Future Extensibility

#### 4.1 Language Evolution
- Pine Script version compatibility
- New language feature integration
- Backward compatibility maintenance
- Migration tooling

#### 4.2 Analysis Capabilities
- Additional technical indicators
- Machine learning integration
- Alternative data sources
- Custom analysis functions

#### 4.3 Visualization Features
- New plot types
- Advanced styling options
- Interactive features
- Export capabilities

#### 4.4 Platform Integration
- Additional deployment targets
- Cloud service integration
- Mobile platform support
- Desktop application enhancements

#### 4.5 Testing Strategy
- Integration tests: run standard Pine strategies (SMA crossover, etc.) and compare metrics to TradingView output within 0.1% tolerance
- Regression tests: curated library of scripts with known expected results
- Performance tests: backtest on 1M bars must complete within 10 seconds

#### 4.6 Deployment Considerations
- Pine runtime isolated in sandbox (WebAssembly or restricted process)
- Backtest workers scaled horizontally; message queue (RabbitMQ/Redis) for job distribution
- Results stored in time-series or document database (MongoDB/InfluxDB)
- Chart rendering via lightweight-charts or existing Canvas Charting Library
