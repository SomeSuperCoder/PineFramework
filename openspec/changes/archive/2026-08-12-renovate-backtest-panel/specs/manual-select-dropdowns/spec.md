## ADDED Requirements

### Requirement: Backtest Panel Pair/Timeframe Selection SHALL Be Panel-Owned Dropdowns

The backtest start panel SHALL render its own trading-pair and timeframe dropdowns with curated options (same option sets as the app's manual selection dropdowns). The panel SHALL NOT depend on the app header's pair/timeframe state for its own inputs, and its selections SHALL be restored from persisted backtest settings on reopen.

#### Scenario: Panel renders its own pair dropdown

- **WHEN** the backtest start panel is open
- **THEN** it SHALL render a trading-pair dropdown with predefined trading pair options (e.g. BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT, DOGEUSDT, ADAUSDT) independent of the header selection

#### Scenario: Panel renders its own timeframe dropdown

- **WHEN** the backtest start panel is open
- **THEN** it SHALL render a timeframe dropdown with predefined timeframe options (e.g. 1m, 5m, 15m, 30m, 1h, 4h, 1d) independent of the header selection

#### Scenario: Panel pair/timeframe survive reopen

- **WHEN** the user selects a pair and timeframe in the panel, closes it, and reopens it
- **THEN** the panel SHALL restore the previously selected pair and timeframe
