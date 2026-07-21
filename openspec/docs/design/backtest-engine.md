# Design Document: Backtest Engine Architecture

## 1. Strategy Engine

### 1.1 Responsibility
Execute and backtest trading strategies with visual markers.

### 1.2 Visual Markers
- `strategy.entry(id, direction, qty, price, stop, limit, comment)`: Entry markers on chart — reverses position on opposite direction like TradingView; marker name defaults to "Long"/"Short" by direction, overridden by comment parameter
- `strategy.order()`: Order markers on chart
- `strategy.exit(id, qty, price, stop, limit, comment)`: Exit markers on chart with optional comment text; marker name defaults to "Exit {id}" format, overridden by comment parameter
- `strategy.close()`: Closing markers on chart — supports named arguments (id, comment); marker name formatted as "Exit {name}"
- `strategy.close_all()`: Closing markers on chart for all open positions
- `strategy.cancel()`: Update displayed orders
- `strategy.cancel_all()`: Update displayed orders

### 1.3 Key Features
- Order management and position tracking
- Performance metrics calculation
- Commission and slippage modeling
- Backtesting reports
- Real-time order execution simulation
- Visual representation of orders on chart
- Trade-by-trade analysis
- Market order fills deferred to next bar's open for realistic backtesting
- Position reversal on opposite direction entry
- Exit markers rendered with comment text
- Strategy markers returned as part of execution result
- strategy.position_size builtin for querying current position quantity
- Pluggable Commission Calculation Methods via `CommissionCalculator` interface
- getConfig() method for accessing strategy configuration
- strategy.entry() and strategy.exit() accept stop, limit, and comment parameters for advanced order configuration
- Entry marker naming: defaults to capitalized direction ("Long"/"Short"), overridden by comment parameter
- Exit marker naming: defaults to "Exit {id}" format, overridden by comment parameter
- Close marker naming: formatted as "Exit {name}" matching exit marker convention
- strategy.exit() allows creation when position is flat but pending market entry exists (entry+exit on same bar support)

---

## 2. Backtest Engine Architecture

### 2.1 Overview
The Backtest Engine extends the existing Strategy Engine to provide a complete historical simulation environment. It consumes Pine Script strategies, executes them over historical OHLCV data, simulates order lifecycle and broker conditions, and produces comprehensive performance analytics. It is designed as a layered system sitting above the existing execution runtime, data service, and broker simulator.

### 2.2 Backtest System Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway + Job Queue                   │
│  - Accepts backtest jobs via REST                            │
│  - Manages job lifecycle (queued→running→completed→retrieved)│
│  - Supports concurrent backtests                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    Backtest Orchestrator                      │
│  - Receives job (script + config + date range)               │
│  - Fetches data from Data Service                            │
│  - Invokes Pine Runtime for strategy signal generation       │
│  - Runs Simulation Engine for order lifecycle                │
│  - Calculates performance metrics                            │
│  - Persists results (BacktestResult)                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
     ┌─────────────────┼─────────────────────┐
     ▼                 ▼                     ▼
┌──────────┐   ┌────────────────┐   ┌──────────────────┐
│ Data     │   │ Pine Runtime   │   │ Broker Simulator  │
│ Service  │   │ (Execution     │   │ (Order Manager,   │
│ (existing)│   │  Engine)      │   │  Fill Engine,     │
│          │   │                │   │  Margin Tracker)  │
└──────────┘   └────────────────┘   └──────────────────┘
                                            │
                                    ┌───────┴───────┐
                                    ▼               ▼
                            ┌────────────┐  ┌──────────────┐
                            │ Metrics    │  │ Report       │
                            │ Calculator │  │ Generator    │
                            └────────────┘  └──────────────┘
```

### 2.3 Backtest Orchestrator
- **Responsibility**: Coordinate the full backtest lifecycle from job submission to result delivery
- **Key Features**:
  - Receives backtest job specification (script, symbol, timeframe, date range, config)
  - Fetches historical OHLCV data from the Data Service for the requested range
  - Invokes the Pine Runtime (existing Execution Engine) to compile and execute the strategy, capturing OrderRequest events
  - Pipes OrderRequest events into the Broker Simulator for order lifecycle management
  - After simulation, invokes the Metrics Calculator to compute performance statistics
  - Stores the completed BacktestResult for retrieval via REST API
  - Reports progress updates during long-running backtests

### 2.4 Broker Simulator
- **Responsibility**: Simulate realistic broker conditions including order management, fills, margin, and fees

**2.4.1 Order Manager:**
- Maintains active order book: pending, working, and filled orders
- Processes OrderRequest events from the strategy engine
- Validates orders against account state (margin, pyramiding limits, position sizing rules)
- Tracks order lifecycle: pending → accepted → filled/cancelled/expired

**2.4.2 Fill Engine:**
- On each bar (or tick for intrabar mode), evaluates all active orders for fill conditions
- **Market orders**: Filled at next bar open + slippage (or immediately on intrabar tick)
- **Limit orders**: Filled when price crosses the limit level (for longs: low <= limit; for shorts: high >= limit)
- **Stop orders**: Filled when price breaches stop level (for longs: high >= stop; for shorts: low <= stop); converted to market order after trigger
- **Stop-limit orders**: Triggered like stop orders, then placed as limit orders
- Applies slippage adjustment to fill prices based on order type and configured slippage parameters
- Records fill price, fill time, and commission for each fill

**2.4.3 Margin Tracker:**
- Tracks initial and maintenance margin requirements
- On each bar, checks if equity falls below maintenance margin threshold
- If margin call triggered, liquidates positions at current market price
- Updates Account state: balance, equity, margin_used, free_margin

**2.4.4 Position Manager:**
- Maintains current positions (symbol, direction, quantity, avg_entry_price)
- Handles position opening, increasing, reducing, and closing
- Supports pyramiding: configurable maximum entries in same direction (0 = single entry, N = up to N entries)
- Handles position reversal: opposite-direction entry closes existing position first, then opens new position

**2.4.5 Commission Calculation Methods:**
- Pluggable `CommissionCalculator` interface: `calculateCommission(trade: Trade, config: CommissionConfig): number`
- Built-in methods:
  - **percent_fixed**: Fixed percentage of trade value (replaces legacy `commission_type: 'percent'`)
  - **per_order_fixed**: Fixed cash amount per order (replaces legacy `commission_type: 'per_order'`)
  - **jupiter_ultra**: Models Jupiter DEX Ultra Mode swap fees — varies by pair volatility and token type (typically 0–0.5%, ~5–10 bps typical), fee amount determined at quote time by Jupiter backend; for backtesting a representative percentage or tiered model is used
  - **jupiter_manual**: Models Jupiter DEX Market Swap (manual routing) — zero commission
  - **none**: No commission
- A commission method MAY enforce long-only trading by filtering out short trades when the method is selected
- Method selected via UI dropdown in backtest settings panel; method-specific settings exposed as configurable fields
- Slippage modes: fixed ticks, fixed points, percentage of price
- Configurable via strategy() declaration parameters as fallback defaults

### 2.5 Bar Processing Loop
```
for each bar in historical range (chronological):
    if multi-timeframe needed, align requested TF data via Request System
    execute Pine strategy on current bar (existing Execution Engine)
    after script execution, process pending OrderRequest events:
        for each OrderRequest:
            validate against account state (margin, pyramiding)
            if valid, register as PendingOrder in Order Manager
    advance simulated clock to bar close time
    check fill conditions for all active orders via Fill Engine
    apply fills, update positions, P&L, margin, equity
    record EquityPoint { time, equity, drawdown }
    expire orders past their validity (GTC, day orders)
    update progress percentage
```

### 2.6 Intrabar Magnification (Bar Magnifier)
- When enabled, retrieve a lower-resolution data series (e.g., 1-minute bars for daily charts)
- Instead of using bar OHLC for fill decisions, iterate through lower-resolution sub-bars
- On each sub-bar, re-evaluate order fill conditions using the sub-bar's price range
- Entry/exit prices reflect the exact sub-bar price where fill conditions are met
- Produces more realistic fill prices than open-close bar granularity

### 2.7 Performance Metrics Computation

**Trade Metrics** (per trade):
- Entry/exit time, price, size, direction
- P&L (gross and net of commission)
- Percent return
- Bars held (duration in bars)
- MAE (Maximum Adverse Excursion)
- MFE (Maximum Favorable Excursion)

**Portfolio Metrics:**
- Total Net Profit, Gross Profit, Gross Loss
- Profit Factor = Gross Profit / Gross Loss
- Percent Profitable (Win Rate) = Winning Trades / Total Trades × 100
- Average Trade = Net Profit / Number of Trades
- Average Winning Trade, Average Losing Trade
- Sharpe Ratio = (Mean(R) - Rf) / StdDev(R) — annualized, using daily equity returns
- Sortino Ratio = (Mean(R) - Rf) / DownsideDev(R) — only downside deviation
- Max Drawdown (absolute value and percentage)
- Max Drawdown Duration (longest period from peak to recovery)
- Average Bars in Trade
- Return on Initial Capital = Net Profit / Initial Capital × 100
- Buy & Hold Return (for comparison with strategy return)

**Calculation method:**
1. Collect all closed Trades from the simulation
2. Build equity curve from EquityPoint records
3. Compute daily returns from equity curve (EQ[t] / EQ[t-1] - 1)
4. Apply metric formulas to daily returns and trade list

### 2.8 Data Models
```
Bar:             { time, open, high, low, close, volume }
OrderRequest:    { id, strategy_id, direction, qty, limit_price, stop_price, order_type, oca_group }
Order:           { id, request_id, status (pending|accepted|filled|cancelled|expired), fill_price, fill_time, commission, slippage }
Position:        { symbol, direction, quantity, avg_entry_price, current_price, unrealized_pnl }
Trade:           { entry_order_id, exit_order_id, direction, qty, entry_time, exit_time, entry_price, exit_price, gross_pnl, commission, net_pnl, return_pct, bars_held, mae, mfe }
Account:         { initial_capital, balance, equity, margin_used, free_margin, currency }
EquityPoint:     { time, equity, balance, drawdown_pct, drawdown_value }
BacktestResult:  { config, metrics, trades[], equity_curve[], orders[] }
```

### 2.9 REST API Specification

**Submit Backtest:**
```
POST /api/backtest
Request: {
  "script": "//@version=6\nstrategy('My Strategy')\n...",
  "symbol": "BTCUSDT",
  "timeframe": "1D",
  "start_date": "2020-01-01",
  "end_date": "2023-01-01",
  "initial_capital": 10000,
  "commission_method": "jupiter_ultra",
  "commission_method_settings": {},
  "commission_type": "percent",
  "commission_value": 0.1,
  "slippage": 1,
  "pyramiding": 0,
  "bar_magnifier": true,
  "inputs": { "fast_len": 12, "slow_len": 26 }
}
Response: { "job_id": "uuid" }
```

**Get Backtest Status:**
```
GET /api/backtest/{job_id}
Response: { "status": "queued|running|completed|failed", "progress": 85, "result_url": "/api/backtest/{job_id}/result" }
```

**Retrieve Result:**
```
GET /api/backtest/{job_id}/result
Response: {
  "metrics": { "net_profit": ..., "profit_factor": ..., "sharpe_ratio": ..., "max_drawdown_pct": ..., ... },
  "equity_curve": [{"time": "2020-01-01", "equity": 10000, "drawdown_pct": 0}, ...],
  "trades": [{ "entry_time": ..., "exit_time": ..., "pnl": ..., ... }],
  "orders": [{ "id": ..., "status": ..., "fill_price": ..., ... }]
}
```

### 2.10 Broker Emulator Properties
- `commission_method`: "percent_fixed" | "per_order_fixed" | "jupiter_ultra" | "jupiter_manual" | "none"
- `commission_method_settings`: object (method-specific settings, e.g., `{ rate: 0.001 }` for percent_fixed)
- `commission_type`: "percent" | "cash_per_contract" | "cash_per_order" (legacy, used as fallback when no method selected)
- `commission_value`: number (legacy fallback)
- `slippage`: number in ticks/points/percent (configurable mode)
- `initial_margin`: percentage (e.g., 50 for 2x leverage)
- `maintenance_margin`: percentage (e.g., 25)
- `default_qty_type`: "contracts" | "percent_of_equity" | "cash"
- `default_qty_value`: number
- `pyramiding`: 0 (no pyramiding), N (max N entries in same direction)
- `currency`: "USD" | "BTC" | etc.

### 2.11 Testing Strategy
- Unit tests for fill logic (market, limit, stop, stop-limit)
- Unit tests for margin calculations and liquidation
- Unit tests for commission calculation methods (percent_fixed, per_order_fixed, jupiter_ultra, jupiter_manual, none)
- Unit tests for each performance metric formula
- Integration tests: run standard Pine strategies (SMA crossover, etc.) and compare metrics to TradingView output within 0.1% tolerance
- Regression tests: curated library of scripts with known expected results
- Performance tests: backtest on 1M bars must complete within 10 seconds

### 2.12 Deployment Considerations
- Pine runtime isolated in sandbox (WebAssembly or restricted process)
- Backtest workers scaled horizontally; message queue (RabbitMQ/Redis) for job distribution
- Results stored in time-series or document database (MongoDB/InfluxDB)
- Chart rendering via lightweight-charts or existing Canvas Charting Library

---

## 3. Pluggable Commission Calculation Methods

### 3.1 CommissionCalculator Interface
```typescript
interface CommissionCalculator {
  calculateCommission(trade: Trade, config: CommissionConfig): number;
  getDescriptor(): CommissionMethodDescriptor;
}
```

### 3.2 Built-in Methods
1. **percent_fixed**: Fixed percentage of trade value (replaces legacy `commission_type: 'percent'`)
   - Settings: `rate` (e.g., 0.001 for 0.1%)
2. **per_order_fixed**: Fixed cash amount per order (replaces legacy `commission_type: 'per_order'`)
   - Settings: `amount` (e.g., 0.5 for $0.50 per order)
3. **jupiter_ultra**: Models Jupiter DEX Ultra Mode swap fees
   - Settings: `rate` (default 0.001, ~10 bps typical)
   - Commission varies by pair volatility and token type (0–0.5%)
4. **jupiter_manual**: Models Jupiter DEX Market Swap (manual routing) — zero commission
   - No settings
5. **none**: No commission applied
   - No settings

### 3.3 Long-Only Enforcement
- Methods may declare `enforceLongOnly: true` in descriptor
- When selected, short trades are filtered out during order processing
- Jupiter Ultra/Manual enforce long-only by default

### 3.4 Integration
- Broker Simulator accepts `CommissionCalculator` instance
- REST API `/api/backtest` accepts `commission_method` and `commission_method_settings`
- CLI tool accepts `--commission-method` argument
- Frontend BacktestSettingsPopup renders method dropdown with dynamic settings fields
- Legacy `strategy()` `commission_type`/`commission_value` used as fallback when no method selected
