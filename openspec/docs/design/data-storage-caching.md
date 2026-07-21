# Data Storage and Caching

## 1. Data Storage Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Data Storage                          │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: In-Memory Cache (LRU/LFU)                        │
│    - Recent bars for fast access                            │
│    - Frequently accessed symbols                            │
│    - Computed indicators                                    │
│                                                             │
│  Layer 2: Memory-Mapped Files                               │
│    - Historical OHLCV data                                  │
│    - Optimized for sequential access                        │
│    - Efficient for millions of candles                      │
│                                                             │
│  Layer 3: Persistent Storage                                │
│    - Database for configuration & metadata (SQLite/PostgreSQL)│
│      - Telegram Bot Token and Telegram Username              │
│      - Per-alert Telegram notification preferences           │
│      - User settings and script configurations               │
│    - Parquet files for time series data                     │
│    - Compression for storage efficiency                     │
│                                                             │
│  Layer 4: External Data Sources                             │
│    - Real-time data feeds                                   │
│    - Market data providers                                  │
│    - REST APIs for historical data                          │
└─────────────────────────────────────────────────────────────┘
```

## 2. Caching Strategies

### Time-Series Data Cache:
- LRU (Least Recently Used) cache for recent bars
- Pre-fetching for sequential access patterns
- Batch loading for multi-timeframe requests

### Indicator Cache:
- Cache computed technical indicators
- Invalidate on data updates
- Share cache across multiple scripts using same data

### Request Cache:
- Cache results of `request.security()` calls
- Invalidate based on data freshness
- Support for different caching policies per request

## 3. Memory Management

- Object pooling for frequent allocations
- Reference counting for shared resources
- Garbage collection for unused objects
- Memory limits per script execution
- Leak detection and prevention
