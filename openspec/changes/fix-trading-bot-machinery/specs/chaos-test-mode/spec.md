## MODIFIED Requirements

### Requirement: Fixed 10% capital sizing in chaos mode

The system SHALL use exactly 10% of current equity for every position opened during chaos mode, regardless of the strategy's `default_qty_value` or other sizing configuration. The resulting USDC buy input SHALL be computed from equity without price division and converted to micro-USDC units, so the on-chain order matches the intended 10% exposure.

#### Scenario: Position sized at 10% of equity

- **WHEN** chaos mode generates a `long` or `short` signal and current equity is $10,000
- **THEN** the position size SHALL be $1,000 (10% of equity)
- **AND** the on-chain buy input SHALL be 1,000 USDC in micro-USDC units (1_000_000_000 lamports)

#### Scenario: Equity recalculated per signal

- **WHEN** chaos mode generates consecutive signals
- **THEN** each position size SHALL be calculated from the current equity at the time of the signal, not the initial capital

#### Scenario: Chaos sizing overrides positionSizePercent

- **WHEN** chaos mode is enabled and `positionSizePercent` is unset (defaults to 100) or set to any other value
- **THEN** the on-chain buy input SHALL still be exactly 10% of available USDC balance
- **AND** the buy SHALL NOT spend the full balance

### Requirement: Chaos mode signal execution

When chaos mode is active, the system SHALL execute chaos-generated signals on the DEX, but ONLY on confirmed real-time candle closes. Signals SHALL NOT be generated or executed during backtesting, on forming/in-progress candles, or when the bot is not connected to a live data feed. The `submitOrders` callback SHALL only fire when the scheduler receives a confirmed candle from the real-time bar feed. Each `long` signal SHALL result in a buy order, each `exit` signal SHALL result in a sell order closing the current position, and each `short` signal SHALL close any existing long position (spot DEX constraint). Execution SHALL respect the risk gate: if `canEnterPosition()` returns false, buy orders SHALL be blocked.

#### Scenario: Chaos buy blocked by risk gate

- **WHEN** chaos mode generates a `long` signal but the daily loss limit has been breached
- **THEN** the system SHALL NOT place a buy order
- **AND** the signal SHALL be recorded as blocked by risk controls
