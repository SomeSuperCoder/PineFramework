# strategy-execution Specification

## Purpose

Implement and verify Strategy Mode Functions functionality for the strategy-execution module.

## Requirements

### Requirement: Strategy Mode Functions

The engine SHALL implement strategy mode with strategy.entry(), strategy.exit(), strategy.close(), strategy.cancel(), strategy.risk.*, strategy.position_size, strategy.openprofit, strategies for pyramiding, and brokerage emulation.

#### Scenario: strategy.entry()

- **WHEN** strategy.entry() is called
- **THEN** the engine SHALL create a new trade entry with direction and size

#### Scenario: strategy.entry() stores marker with action, quantity, price, and comment

- **WHEN** strategy.entry() is called with optional `comment` parameter
- **THEN** the resulting `StrategyMarker` SHALL include `type: 'entry'`, `action`, `quantity`, `price`, and `comment` (if provided) so the frontend can display these in the bar tooltip

#### Scenario: strategy.exit()

- **WHEN** strategy.exit() is called
- **THEN** the engine SHALL create an exit order with optional stop-loss and take-profit

#### Scenario: strategy.exit() stores marker with action, quantity, price, and comment

- **WHEN** strategy.exit() is called with optional `comment` parameter
- **THEN** the resulting `StrategyMarker` SHALL include `type: 'exit'`, `action`, `quantity`, `price`, and `comment` (if provided) so the frontend can display these in the bar tooltip

#### Scenario: strategy.exit() with rich parameters

- **WHEN** strategy.exit() is called with any combination of limit, stop, profit, loss, trail_price, trail_offset, qty, qty_percent, or from_entry
- **THEN** the engine SHALL create exit orders matching the specified parameters

#### Scenario: strategy.close()

- **WHEN** strategy.close() is called
- **THEN** the engine SHALL close the current position

#### Scenario: strategy.cancel()

- **WHEN** strategy.cancel() is called with an entry ID
- **THEN** the engine SHALL cancel the pending order

#### Scenario: strategy.risk Functions

- **WHEN** strategy.risk.allow_entry_in() or strategy.risk.max_intraday_filled_orders() is called
- **THEN** the engine SHALL respect the risk constraints

#### Scenario: strategy.position_size

- **WHEN** strategy.position_size is read
- **THEN** the engine SHALL return the current position size

#### Scenario: strategy.openprofit

- **WHEN** strategy.openprofit is read
- **THEN** the engine SHALL return the unrealized profit

#### Scenario: Pyramiding

- **WHEN** pyramiding is configured
- **THEN** the engine SHALL allow multiple concurrent entries

#### Scenario: Broker Emulation

- **WHEN** backtesting strategy orders
- **THEN** the engine SHALL emulate broker fill mechanics including OCA cancellation

#### Scenario: Partial Exit Sizing

- **WHEN** strategy.exit() is called with qty or qty_percent parameter
- **THEN** the engine SHALL exit only the specified quantity rather than full position

#### Scenario: Stop Loss Exit

- **WHEN** strategy.exit() is called with `stop=entryPrice * 0.95`
- **THEN** the engine SHALL compute the dynamic stop price from an expression

#### Scenario: Multi-Level Exits with OCA

- **WHEN** multiple strategy.exit() calls exist for the same entry
- **THEN** the engine SHALL group them in an OCA group such that filling one cancels the others

#### Scenario: From Entry Targeting

- **WHEN** strategy.exit() includes `from_entry` parameter and pyramiding is active
- **THEN** the engine SHALL only exit the portion of the position attributed to that specific entry

#### Scenario: Default Strategy ID Auto-Generation

- **WHEN** strategy() declaration lacks an explicit ID
- **THEN** the engine SHALL auto-generate a default ID (e.g., "default")

#### Scenario: Default Strategy Exit Size Inversion

- **WHEN** strategy.exit() exits without specifying size on a long position
- **THEN** the engine SHALL default to the current negative position size (full short)

### Requirement: Strategy Backtest Framework

The engine SHALL compute strategy metrics: net profit, gross profit/loss, max drawdown, Sharpe ratio, sortino ratio, win rate, profit factor, total closed trades, percent profitable, avg trade, best trade, worst trade, avg bars in trades.

#### Scenario: Backtest Metrics

- **WHEN** a strategy finishes backtesting
- **THEN** the engine SHALL compute and return all standard backtest metrics

#### Scenario: Trade History

- **WHEN** backtest results are queried
- **THEN** the engine SHALL include a list of all trades with entry/exit details

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

### Requirement: Live Strategy Metrics

The system SHALL compute live trading metrics alongside backtest metrics.

#### Scenario: Real-time P&L

- **WHEN** positions are open
- **THEN** the system SHALL compute unrealized P&L based on current market price

#### Scenario: Trade history

- **WHEN** trades are executed
- **THEN** the system SHALL maintain a live trade history with entry/exit details

### Requirement: Live trading short signal interpretation

When a Pine Script strategy emits a short signal (`strategy.entry()` with `strategy.short` direction), the live trading executor SHALL interpret it based on the current position state. Since spot DEXes do not support short selling, the system SHALL map short signals to position-closing actions rather than silently dropping them.

#### Scenario: Short signal closes existing long position

- **WHEN** the live trading executor receives a strategy marker with `direction: 'short'` and the current position is `long`
- **THEN** the executor SHALL emit a `TradeSignal` with `action: 'close'` to close the entire long position

#### Scenario: Short signal ignored when flat

- **WHEN** the live trading executor receives a strategy marker with `direction: 'short'` and the current position is `flat`
- **THEN** the executor SHALL log a warning that short positions are not supported on spot DEXes and NOT emit any trade signal

#### Scenario: Short signal ignored when already short

- **WHEN** the live trading executor receives a strategy marker with `direction: 'short'` and the current position is already `short` (theoretical, should not happen on spot DEX)
- **THEN** the executor SHALL log a warning and NOT emit any trade signal

### Requirement: Short signal warning logging

The system SHALL provide visible feedback when a short signal is received, so users understand why no trade was executed.

#### Scenario: Warning logged for short signal on spot DEX

- **WHEN** a strategy marker with `direction: 'short'` is processed by the live trading executor
- **THEN** the system SHALL log a warning message indicating that short positions are not supported and describing what action was taken (close if long, ignored if flat)

### Requirement: Chaos mode strategy bypass

When chaos mode is active, the `LiveStrategyExecutor` SHALL bypass normal Pine Script strategy execution and instead produce random trade signals on each candle close.

#### Scenario: Executor generates random signal instead of strategy signal

- **WHEN** `LiveStrategyExecutor.processCandle()` is called and chaos mode is active
- **THEN** the executor SHALL generate a random signal (`long`, `short`, or `exit`) with equal probability instead of running the compiled strategy

#### Scenario: Executor uses 10% capital sizing in chaos mode

- **WHEN** chaos mode generates a `long` or `short` signal
- **THEN** the executor SHALL calculate position size as 10% of current equity, ignoring `config.positionSizePercent`

#### Scenario: Executor logs chaos signals

- **WHEN** a chaos signal is generated and executed
- **THEN** the executor SHALL log the signal type, timestamp, equity, and execution result to the chaos signal log

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
