# Design Document: CLI Backtest Tool for Multi-Symbol Strategy Validation

## 1. Overview
The CLI Backtest Tool enables AI agents (and human developers) to validate trading strategies across multiple trading pairs from the command line, without requiring the web server to be running. It runs the same Pine Script strategy against historical data for several symbols, aggregates the results, computes cross-pair statistics, and produces an overfitting risk assessment. This is the primary mechanism for AI agents to iteratively refine merged indicator strategies.

## 2. System Architecture
```
┌──────────────────────────────────────────────────────────────┐
│                     CLI Entry Point                           │
│  Parses arguments: script, timeframe, symbols, date range,   │
│  strategy config, output path                                │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│                  Multi-Symbol Runner                          │
│  Iterates over symbols list, runs backtest per symbol        │
│  Reports progress, handles per-symbol failures               │
└──────────┬───────────────────────────────────┬───────────────┘
           │                                   │
┌──────────▼──────────────┐  ┌─────────────────▼──────────────┐
│   Per-Symbol Backtest   │  │   Result Aggregator             │
│   (reuses existing      │  │   - Computes cross-pair stats   │
│    execution pipeline)  │  │   - Coefficient of variation    │
│   1. Fetch OHLCV bars   │  │   - Overfitting risk score      │
│   2. Parse + compile    │  │   - Best/worst pair             │
│   3. ExecuteEngine.run  │  │   - Median/mean/percentiles     │
│   4. Extract metrics    │  └────────────────────────────────┘
└─────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────────┐
│                      Output Formatter                        │
│  - JSON file (machine-readable, for agent consumption)      │
│  - Human-readable summary table (stdout)                    │
└─────────────────────────────────────────────────────────────┘
```

## 3. CLI Interface
```
pine-backtest <script.pine> [options]

Options:
  --timeframe <tf>        Timeframe: 1,3,5,15,30,60,120,240,D,W,M (default: 60)
  --symbols <list>        Comma-separated symbols (default: BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT)
  --days-back <n>         Lookback period in days (default: varies by timeframe)
  --start-date <date>     Start date YYYY-MM-DD (overrides --days-back)
  --end-date <date>       End date YYYY-MM-DD
  --output <path>         Write JSON results to file
  --initial-capital <n>   Starting capital (default: 10000)
  --commission <n>        Commission value (default: 0)
  --slippage <n>          Slippage value (default: 0)
  --default-qty <n>       Default order quantity (default: 1)
  --pyramiding <n>        Max pyramiding entries (default: 0)
```

The `--days-back` default varies by timeframe to prevent memory issues with smaller timeframes that generate more bars per day:

| Timeframe | Default Days Back |
|-----------|-------------------|
| 1m        | 3                 |
| 3m        | 7                 |
| 5m        | 14                |
| 15m       | 45                |
| 30m       | 90                |
| 60m       | 180               |
| 120m      | 365               |
| 240m      | 730               |
| D/W/M     | 1825              |

The tool resolves script paths from both the current working directory and the monorepo root, allowing scripts to be specified as `backend/data/scripts/strategies/name.pine` when run from any workspace directory. It can be invoked via `pnpm run backtest` from the monorepo root.

## 4. Multi-Symbol Runner
- **Sequential execution** — runs one symbol at a time to avoid API rate limits on Bybit
- **Progress reporting** — prints `[2/5] Backtesting ETHUSDT...` to stderr
- **Per-symbol error handling** — catches compilation errors, data fetch failures, and execution errors per symbol, logs them, and continues with remaining symbols
- **Skip on failure** — failed symbols are excluded from cross-pair aggregation

## 5. Overfitting Detection
The tool computes an overfitting risk score based on the consistency of performance across diverse symbols:

```
overfitting_risk = coefficient_of_variation(net_profits)
  < 0.5  → LOW risk (consistent across pairs)
  0.5-1.5 → MODERATE risk (some variance)
  > 1.5  → HIGH risk (likely overfitted)
```

Additional signals:
- **Best-pair / worst-pair ratio** — if best pair is 5x+ worse than worst, high overfit risk
- **Negative correlation** — if some pairs are profitable while others are unprofitable, the strategy may be curve-fitted
- **Win rate consistency** — large variance in win rates across symbols indicates overfitting

## 6. Output Format
```json
{
  "script": "strategy_name.pine",
  "timeframe": "60",
  "dateRange": { "start": "2026-04-14", "end": "2026-07-13" },
  "symbols": [
    {
      "symbol": "BTCUSDT",
      "status": "completed",
      "metrics": {
        "netProfit": 1250.45,
        "netProfitPercent": 12.5,
        "profitFactor": 1.82,
        "maxDrawdownPercent": 8.3,
        "winRate": 58.3,
        "sharpeRatio": 1.45,
        "totalTrades": 42,
        "buyHoldReturn": 5.2
      }
    },
    {
      "symbol": "SOLUSDT",
      "status": "failed",
      "error": "Compilation error: Line 15 - undeclared identifier"
    }
  ],
  "crossPairSummary": {
    "avgNetProfitPercent": 8.7,
    "medianProfitFactor": 1.65,
    "coefficientOfVariation": 0.42,
    "overfittingRisk": "LOW",
    "bestPair": "BTCUSDT",
    "worstPair": "ETHUSDT",
    "successfulSymbols": 4,
    "failedSymbols": 1
  }
}
```

## 7. Human-Readable Output
```
═══════════════════════════════════════════════════════════════
  Backtest Results: rsi_bollinger_strategy.pine (1h, 90 days)
═══════════════════════════════════════════════════════════════
  Symbol       Net PnL%   PF     MaxDD%   WinRate  Trades  Sharpe
  ─────────────────────────────────────────────────────────────
  BTCUSDT      +12.50%    1.82   8.30%    58.3%    42      1.45
  ETHUSDT       +5.20%    1.45  12.10%    52.1%    38      0.92
  SOLUSDT      +15.30%    2.10   6.50%    61.2%    35      1.88
  BNBUSDT       +1.80%    1.12  15.20%    48.9%    44      0.35
  XRPUSDT       +8.80%    1.55   9.80%    55.0%    40      1.12
  ─────────────────────────────────────────────────────────────
  Average       +8.72%    1.61   10.38%   55.1%    40      1.14
  CV of PnL:    0.42  |  Overfitting Risk: LOW
  Best: SOLUSDT (+15.30%)  |  Worst: BNBUSDT (+1.80%)
═══════════════════════════════════════════════════════════════
```

## 8. Agent Iteration Workflow
The intended workflow for AI agents:
1. Merge indicators into a strategy (per merge-indicators-to-strategy.md)
2. Run `pine-backtest strategy.pine --output results.json`
3. Parse the JSON output
4. If overfitting risk is HIGH or performance is poor:
   a. Identify the weakest-performing symbols
   b. Adjust strategy input parameters (e.g., RSI length, threshold levels)
   c. Re-run the backtest
   d. Compare results to the previous run
5. Repeat until overfitting risk is LOW and cross-pair performance is acceptable
6. Save the final optimized strategy

## 9. Integration with Existing Systems
- **Execution Engine**: Reuses `parse()`, `compile()`, `ExecutionEngine`, and `createSeries` from `pine-framework`
- **Bybit Data Source**: Reuses the existing `fetchBars()` function from the backtest route for OHLCV data
- **Strategy Engine**: Reuses `strategyEngine.getTrades()` and `strategyEngine.getMetrics()` for result extraction
- **Backtest Route Logic**: Mirrors the execution pipeline from `backend/src/routes/backtest.ts` but runs synchronously in a CLI context (no job queue, no REST)
- **No server required**: The CLI tool operates independently of the web server
