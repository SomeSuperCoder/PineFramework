## MODIFIED Requirements

### Requirement: Chaos mode signal execution

When chaos mode is active, the system SHALL execute chaos-generated signals on the DEX, but ONLY on confirmed real-time candle closes. Signals SHALL NOT be generated or executed during backtesting, on forming/in-progress candles, or when the bot is not connected to a live data feed. The `submitOrders` callback SHALL only fire when the scheduler receives a confirmed candle from the real-time bar feed. Each `long` signal SHALL result in a buy order, each `exit` signal SHALL result in a sell order closing the current position, and each `short` signal SHALL close any existing long position (spot DEX constraint). When the real wallet balance is zero or unreachable, the chaos engine SHALL still drive the strategy machinery using a documented simulated equity floor, and SHALL log the failure mode loudly instead of silently generating zero-quantity entries.

#### Scenario: Long signal executes buy order

- **WHEN** chaos mode generates a `long` signal and the bot has sufficient USDC balance
- **THEN** the system SHALL submit a buy order to the DEX for 10% of current equity
- **AND** the order result (success/failure, transaction signature) SHALL be logged

#### Scenario: Exit signal executes sell order

- **WHEN** chaos mode generates an `exit` signal and the bot holds a long position
- **THEN** the system SHALL submit a sell order to the DEX to close the full position
- **AND** the order result SHALL be logged

#### Scenario: Short signal closes long position

- **WHEN** chaos mode generates a `short` signal and the bot holds a long position
- **THEN** the system SHALL submit a sell order to close the position (spot DEX constraint)
- **AND** if no position exists, the signal SHALL be logged and discarded

#### Scenario: Wallet empty falls back to simulated equity

- **WHEN** chaos mode generates a `long` signal and the real wallet USDC balance is zero
- **THEN** the system SHALL size the chaos engine entry using the documented simulated equity floor
- **AND** the system SHALL log the `wallet-empty` failure mode and that execution is not live-tested
- **AND** the strategy machinery (engine markers, scheduler flow, executor path) SHALL continue to run

#### Scenario: Balance fetch failure is distinguishable from empty wallet

- **WHEN** the balance provider cannot be reached (RPC/transport error)
- **THEN** the system SHALL record the `rpc-unreachable` failure mode distinctly from `wallet-empty`
- **AND** the system SHALL NOT report the balance as a plain zero

#### Scenario: Insufficient balance

- **WHEN** chaos mode generates a `long` signal but USDC balance is insufficient for the 10% position size
- **THEN** the system SHALL log the failure with the balance shortfall
- **AND** the bot SHALL continue running (no crash, no state corruption)

### Requirement: Chaos mode simulates a real strategy

When chaos mode is active, the system SHALL simulate a real strategy by driving the strategy engine with random `long`/`short`/`exit` actions rather than emitting raw signals directly. The resulting markers SHALL be produced by the strategy engine itself, so their labels, colors, and types are indistinguishable from a real strategy's output. The chaos engine SHALL never be seeded with zero or negative equity: when the real wallet balance is zero or unreachable, a documented simulated equity floor SHALL be used so the engine machinery always produces markers.

#### Scenario: Long entry while flat

- **WHEN** chaos mode generates a `long` action and the simulated position is flat
- **THEN** the strategy engine SHALL produce a genuine entry marker with label `Long`, direction `long`, and the standard long-entry color

#### Scenario: Short while long closes the position

- **WHEN** chaos mode generates a `short` action and the simulated position is long
- **THEN** the strategy engine SHALL close the position, producing a genuine close marker labeled `Exit Short`

#### Scenario: Exit while long closes the position

- **WHEN** chaos mode generates an `exit` action and the simulated position is long
- **THEN** the strategy engine SHALL close the position, producing a genuine close marker

#### Scenario: No marker when the transition is impossible

- **WHEN** chaos mode generates `long` while the simulated position is already long, or `short`/`exit` while the simulated position is flat
- **THEN** the strategy engine SHALL produce no marker for that candle, matching real strategy position-state semantics

#### Scenario: Zero balance does not stop the engine machinery

- **WHEN** the real wallet balance is zero or unreachable and a chaos action is generated
- **THEN** the strategy engine SHALL be driven with the simulated equity floor
- **AND** the resulting markers SHALL be produced and flow through the same scheduler and executor path a real strategy uses

### Requirement: Chaos mode execution result tracking

The system SHALL track and expose chaos mode execution results including successful orders, failed orders, and total execution time. In addition, every processed candle SHALL produce an observable outcome (signal, explicit no-op reason, or error) so a running chaos mode is never silently idle.

#### Scenario: Execution stats available

- **WHEN** chaos mode has been running for multiple candle closes
- **THEN** the system SHALL track: total signals generated, orders executed, orders failed, total execution time

#### Scenario: Every candle produces an observable outcome

- **WHEN** a real-time candle closes while chaos mode is active
- **THEN** the system SHALL record and expose one of: a generated signal, an explicit no-op reason (e.g. impossible transition), or an error

## ADDED Requirements

### Requirement: Per-candle errors are observable, not swallowed

When processing a candle fails while chaos mode (or any live strategy) is active, the system SHALL surface the error through the bot event channel and WebSocket so the failure is visible to the operator, instead of silently skipping the candle.

#### Scenario: Candle processing error is broadcast

- **WHEN** an exception occurs while processing a candle for a configured pair
- **THEN** the system SHALL emit a `candle-error` event containing the pair, timeframe, candle timestamp, and error message
- **AND** the event SHALL be broadcast to connected clients via WebSocket
- **AND** the bot SHALL continue processing subsequent candles (no crash)

#### Scenario: Error counter is tracked

- **WHEN** one or more candle processing errors occur
- **THEN** the system SHALL maintain a running `totalCandleErrors` counter alongside the signals-generated counter

### Requirement: Chaos execution mode is exposed

The system SHALL expose the current chaos execution mode (`live` when real wallet funds back the engine, `simulated` when the equity floor is in use) so operators can tell whether the execution layer was genuinely exercised.

#### Scenario: Execution mode reported

- **WHEN** chaos mode is active and the bot snapshot is requested
- **THEN** the snapshot SHALL include the current chaos execution mode (`live` or `simulated`) and the reason when simulated
