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
