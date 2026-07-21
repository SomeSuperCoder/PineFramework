## ADDED Requirements

### Requirement: Strategy Mode Functions
The engine SHALL implement strategy mode with strategy.entry(), strategy.exit(), strategy.close(), strategy.cancel(), strategy.risk.*, strategy.position_size, strategy.openprofit, strategies for pyramiding, and brokerage emulation.

#### Scenario: strategy.entry()
- **WHEN** strategy.entry() is called
- **THEN** the engine SHALL create a new trade entry with direction and size

#### Scenario: strategy.exit()
- **WHEN** strategy.exit() is called
- **THEN** the engine SHALL create an exit order with optional stop-loss and take-profit

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
- **THEN** the engine SHALL emulate broker fill mechanics

#### Scenario: Partial Exit Sizing
- **WHEN** strategy.exit() is called with qty parameter
- **THEN** the engine SHALL exit only the specified quantity rather than full position

#### Scenario: Stop Loss Exit
- **WHEN** strategy.exit() is called with `stop=entryPrice * 0.95`
- **THEN** the engine SHALL compute the dynamic stop price from an expression

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
