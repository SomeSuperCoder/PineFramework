## Purpose

Compiles and executes Pine Script strategies in live trading mode, generating trade signals from real market data.

## ADDED Requirements

### Requirement: Strategy Compilation

The system SHALL compile Pine Script source code into an executable strategy module.

#### Scenario: Valid strategy compilation

- **WHEN** a valid Pine Script strategy source is provided
- **THEN** the system SHALL compile it and produce a runnable strategy module with entry/exit logic

#### Scenario: Compilation error handling

- **WHEN** the Pine Script source contains syntax errors
- **THEN** the system SHALL return structured error information with line numbers

### Requirement: Live Strategy Execution

The system SHALL execute the compiled strategy on each confirmed candle, maintaining series state across bars.

#### Scenario: Bar-by-bar execution

- **WHEN** a confirmed candle arrives
- **THEN** the system SHALL execute the strategy logic and update internal state

#### Scenario: Signal generation

- **WHEN** strategy.entry() or strategy.exit() is called during execution
- **THEN** the system SHALL generate a `TradeSignal` with action, quantity, and price

#### Scenario: Series state preservation

- **WHEN** executing across multiple bars
- **THEN** the system SHALL maintain series variables (e.g., `close[1]`, `ta.ema()`) correctly

### Requirement: Signal-to-Order Translation

The system SHALL translate strategy signals into executable DEX orders.

#### Scenario: Entry signal translation

- **WHEN** a `TradeSignal` with action `buy` is generated
- **THEN** the system SHALL create an order to swap USDC for the target asset

#### Scenario: Exit signal translation

- **WHEN** a `TradeSignal` with action `sell` is generated
- **THEN** the system SHALL create an order to swap the asset back to USDC

#### Scenario: Position size calculation

- **WHEN** a trade signal is generated
- **THEN** the system SHALL calculate order size based on available balance and risk parameters

### Requirement: Strategy State Persistence

The system SHALL persist strategy state across bot restarts.

#### Scenario: State save on shutdown

- **WHEN** the bot stops gracefully
- **THEN** the system SHALL save strategy state (series values, position tracking) to disk

#### Scenario: State restore on startup

- **WHEN** the bot starts
- **THEN** the system SHALL restore strategy state from disk if available

### Requirement: Realtime Bar Processing

The system SHALL handle realtime bar updates differently from historical bars.

#### Scenario: Forming candle updates

- **WHEN** a realtime bar update arrives (confirm: false)
- **THEN** the system SHALL re-evaluate the strategy on the forming candle without persisting state

#### Scenario: Confirmed bar finalization

- **WHEN** a realtime bar confirms (confirm: true)
- **THEN** the system SHALL finalize the bar, persist state, and generate signals
