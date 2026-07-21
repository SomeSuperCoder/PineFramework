# Data Flow

## 1. Script Loading and Compilation Flow

```
Frontend (Code Editor) → POST /api/execute → Backend → Parser → AST → Compiler → Type Checking → IR Generation → Executable
```

## 2. Historical Execution Flow

```
Bybit REST API → Backend (Data Cache) → Frontend (OHLCV) → Backend (Pine Engine) → Series State → TA Engine → Plot Engine + Shape Engine + Fill Engine + Strategy Engine → Backend (outputs, shapes, fills, strategyMarkers) → Frontend (Chart Render)
```

## 3. Realtime Execution Flow

```
Bybit WebSocket → Backend (WS Gateway)
  ├── Data Cache (update bar)
  ├── Frontend (WS Client) → Chart Update (candle refresh)
  │
  └── reexecuteForTopic(topic, bar, confirmed)
        │
        │ prune stale (closed) WS connections
        │
        └── for EACH subscriber with an active ScriptSession:
              ├── ScriptSession.appendOrUpdateBar(bar, confirmed)
              │     │
              │     ├── if confirmed && timestamp <= lastConfirmedTimestamp
              │     │     → dedup: FormingCandleManager.tick(bar), isConfirmed=false → alerts SUPPRESSED
              │     │
              │     ├── if confirmed && timestamp > lastConfirmedTimestamp
              │     │     → FormingCandleManager.confirm(bar), isConfirmed=true → alerts GENERATED
              │     │     (dedup via recentAlertKeys Set before Telegram dispatch)
              │     │
              │     └── if !confirmed (forming tick)
              │           → FormingCandleManager.tick(bar), isConfirmed=false → alerts SUPPRESSED
              │
              ├── execution_result sent to WS client (plots, shapes, fills, etc.)
              │
              └── if isConfirmed && tgActive && hasTriggers
                    → check recentAlertKeys Set → if duplicate, suppress
                    → telegramService.sendAlertToSubscribers() for each trigger
```

### Three-Layer Alert Dedup Enforcement

1. **ScriptSession `lastConfirmedTimestamp`** — Per-session timestamp tracking: if a second `confirmed=true` kline arrives with the same or older timestamp, the session skips re-execution entirely (returns forming-candle result with `isConfirmed=false`, alerts suppressed).
2. **Gateway `recentAlertKeys` Set** — Module-level Set keyed by `alertId:timestamp:topic` (bounded at 100 entries, oldest evicted first). Before dispatching a Telegram alert, the gateway checks this Set; if the key exists, the duplicate is suppressed with a log message.
3. **Stale connection pruning** — Before iterating topic subscribers, closed WebSocket connections are removed from the subscriber Set, preventing orphaned sessions from producing phantom alerts.

## 4. Request Processing Flow

```
Script Request → Backend → Pine Engine (request.security()) → Bybit Adapter → Bybit REST API → Data Alignment → Script
```

## 5. Strategy Execution Flow

```
Market Data → Backend → Strategy Engine → Order Generation (deferred to next bar open) → Position Management (reversal on opposite direction) → Performance Metrics → Strategy Markers → Backend (shapes, fills, strategyMarkers) → Frontend (Chart Render with markers, fills, shapes)
```

## 6. Monorepo Package Dependency Flow

```
pine-framework (engine library)
    ↑ workspace dependency
    ├── frontend (React + Vite) ── imports engine for type definitions
    └── backend (Express + WS) ── imports engine for script execution
```
