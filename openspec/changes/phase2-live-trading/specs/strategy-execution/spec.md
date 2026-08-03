## ADDED Requirements

### Requirement: Live Trading Mode

The system SHALL support executing strategies in live trading mode, bridging strategy signals to real DEX orders.

#### Scenario: Live mode activation

- **WHEN** the bot starts with a configured strategy and DEX
- **THEN** the system SHALL execute the strategy on live market data and generate real trade signals

#### Scenario: Signal-to-order bridge

- **WHEN** strategy.entry() or strategy.exit() is called in live mode
- **THEN** the system SHALL translate the signal into a real DEX order (USDC → Asset or Asset → USDC)

#### Scenario: Live mode vs backtest mode

- **WHEN** the same strategy runs in backtest mode and live mode
- **THEN** the strategy logic SHALL produce identical signals for the same input data (deterministic execution)

### Requirement: Real-Time Position Tracking

The system SHALL track open positions in real-time during live trading.

#### Scenario: Position opening

- **WHEN** a buy order is filled on the DEX
- **THEN** the system SHALL record the position with entry price, quantity, and timestamp

#### Scenario: Position closing

- **WHEN** a sell order is filled on the DEX
- **THEN** the system SHALL close the position and calculate realized P&L

#### Scenario: Position size update

- **WHEN** pyramiding adds to an existing position
- **THEN** the system SHALL update the average entry price and total quantity

### Requirement: Strategy State in Live Mode

The system SHALL maintain strategy state (series values, variables) across live candles.

#### Scenario: Series persistence across candles

- **WHEN** processing live candles sequentially
- **THEN** the system SHALL maintain series state (e.g., `ta.ema()`, `close[1]`) correctly

#### Scenario: Var persistence

- **WHEN** `var` variables are used in the strategy
- **THEN** the system SHALL preserve their values across candle processing

### Requirement: Live Strategy Metrics

The system SHALL compute live trading metrics alongside backtest metrics.

#### Scenario: Real-time P&L

- **WHEN** positions are open
- **THEN** the system SHALL compute unrealized P&L based on current market price

#### Scenario: Trade history

- **WHEN** trades are executed
- **THEN** the system SHALL maintain a live trade history with entry/exit details
