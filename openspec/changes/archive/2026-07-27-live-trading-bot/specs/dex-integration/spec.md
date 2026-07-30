## Purpose
Implement Jupiter DEX integration for live order execution with a pluggable abstraction layer that allows future DEXs to be added with minimal code changes.

## ADDED Requirements

### Requirement: Jupiter Swap Integration
The system SHALL integrate with Jupiter Swap API for spot market order execution on Solana.

#### Scenario: Execute swap order
- **WHEN** a buy or sell signal is received
- **THEN** the system SHALL submit a swap via Jupiter Swap API with the configured slippage

#### Scenario: Swap confirmation
- **WHEN** a swap transaction is submitted
- **THEN** the system SHALL wait for confirmation and return the transaction signature

#### Scenario: Swap failure handling
- **WHEN** a swap transaction fails
- **THEN** the system SHALL log the error and notify the user

### Requirement: Jupiter Ultra Integration
The system SHALL integrate with Jupiter Ultra for improved execution pricing and routing.

#### Scenario: Execute via Jupiter Ultra
- **WHEN** the user selects Jupiter Ultra as the DEX backend
- **THEN** the system SHALL route orders through Jupiter Ultra API

#### Scenario: Ultra pricing
- **WHEN** a quote is requested via Jupiter Ultra
- **THEN** the system SHALL return improved pricing compared to standard Swap where available

### Requirement: Pluggable DEX Interface
The system SHALL define a common DEX interface that all execution backends implement, enabling future DEXs with minimal code changes.

#### Scenario: Common interface
- **WHEN** a new DEX is added
- **THEN** it SHALL implement the common DEX interface (quote, swap, getBalance, getTransactionStatus)

#### Scenario: DEX selection
- **WHEN** the user configures the bot
- **THEN** they SHALL select which DEX backend to use from the available implementations

### Requirement: Commission Models Per DEX
Every supported DEX SHALL define its own fee model, slippage model, and execution assumptions. The same implementation SHALL be reused by live trading, backtesting, auto-selection, and profitability estimation.

#### Scenario: Commission calculation
- **WHEN** computing expected trade costs
- **THEN** the system SHALL use the selected DEX's commission model

#### Scenario: Shared commission logic
- **WHEN** backtesting or auto-selection evaluates a strategy
- **THEN** it SHALL use the same commission model as live trading for the selected DEX

### Requirement: Spot Trading Only
The initial implementation SHALL support spot trading only. Long positions buy the asset with USDC; closing sells the asset for USDC. Short positions are not supported.

#### Scenario: Open long position
- **WHEN** a long entry signal is received
- **THEN** the system SHALL execute USDC → Asset swap

#### Scenario: Close long position
- **WHEN** a close signal is received for a long position
- **THEN** the system SHALL execute Asset → USDC swap
