## MODIFIED Requirements

### Requirement: Live Trading Mode

The system SHALL support executing strategies in live trading mode by compiling the configured Pine Script strategy source and evaluating it bar-by-bar on live market data, bridging the resulting strategy engine markers to real DEX orders.

#### Scenario: Live mode activation

- **WHEN** the bot starts with a configured strategy and DEX
- **THEN** the system SHALL compile the strategy source into the strategy engine
- **AND** the system SHALL evaluate the compiled strategy on each live closed candle, generating real trade signals from the strategy engine's markers

#### Scenario: Signal-to-order bridge

- **WHEN** the strategy engine emits an `entry` marker with `direction: 'long'` while processing a live candle
- **THEN** the system SHALL translate the marker into a real DEX order (USDC → Asset)
- **AND** the order quantity SHALL match the marker's quantity

#### Scenario: Exit-to-order bridge

- **WHEN** the strategy engine emits an `exit` or `close` marker while processing a live candle
- **THEN** the system SHALL translate the marker into a real DEX order (Asset → USDC) closing the open position

#### Scenario: Live mode vs backtest mode

- **WHEN** the same strategy source runs in backtest mode and live mode over the same bars
- **THEN** the strategy logic SHALL produce identical signals for the same input data (deterministic execution)

### Requirement: Real-Time Position Tracking

The system SHALL track open positions in real-time during live trading, keeping the executor's position state consistent with the strategy engine's position state.

#### Scenario: Position opening

- **WHEN** a buy order is filled on the DEX
- **THEN** the system SHALL record the position with entry price, quantity, and timestamp

#### Scenario: Position closing

- **WHEN** a sell order is filled on the DEX
- **THEN** the system SHALL close the position and calculate realized P&L

#### Scenario: Position size update

- **WHEN** pyramiding adds to an existing position
- **THEN** the system SHALL update the average entry price and total quantity

#### Scenario: Position state synced from engine markers

- **WHEN** a live candle produces strategy engine markers
- **THEN** the executor's position state SHALL be reconciled against those markers before order execution so the engine and executor agree on direction and quantity

### Requirement: Strategy State in Live Mode

The system SHALL maintain strategy state (series values, variables) across live candles by evaluating the strategy incrementally on the same engine instance that was seeded during warm start.

#### Scenario: Series persistence across candles

- **WHEN** processing live candles sequentially
- **THEN** the system SHALL maintain series state (e.g., `ta.ema()`, `close[1]`) correctly across the warm-up bars and live candles

#### Scenario: Var persistence

- **WHEN** `var` variables are used in the strategy
- **THEN** the system SHALL preserve their values across warm-up and live candle processing

## ADDED Requirements

### Requirement: Live mode warm start

The system SHALL seed each pair's live strategy engine with recent historical bars before processing live candles, so indicator state and series history are populated and the strategy produces signals consistent with how it evaluates on the chart.

#### Scenario: Engine seeded with historical bars on start

- **WHEN** the bot starts and subscribes to a pair
- **THEN** the system SHALL fetch and evaluate recent historical bars for that pair through the compiled strategy
- **AND** the system SHALL NOT generate DEX orders for signals produced during the warm-up seed

#### Scenario: Live candles continue the warm-up state

- **WHEN** the first live candle arrives after warm start
- **THEN** the system SHALL evaluate it on the same engine instance that processed the historical bars, continuing series and `var` state rather than starting from an empty engine

### Requirement: Deterministic live vs backtest execution

The system SHALL guarantee that evaluating a strategy source bar-by-bar (live) and in a single batch (chart/backtest) over the same bars produces identical markers.

#### Scenario: Identical markers across evaluation modes

- **WHEN** the same strategy source and the same bar sequence are evaluated incrementally and in batch
- **THEN** the sequence of emitted strategy markers SHALL be identical (same types, directions, quantities, prices, and timestamps)

#### Scenario: Live signals match chart signals

- **WHEN** a live candle closes and produces a strategy marker
- **THEN** the mini chart rendering the same source over the same bars SHALL show the same marker on the same candle
