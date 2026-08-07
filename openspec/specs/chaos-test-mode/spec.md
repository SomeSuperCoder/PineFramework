# chaos-test-mode Specification

## Purpose

Provides a chaos testing mode that bypasses user strategy logic and generates random trading signals on every real-time candle close, enabling continuous stress-testing of the bot's order execution pipeline, position management, and error handling under unpredictable conditions.
## Requirements
### Requirement: Chaos mode configuration

The system SHALL support a `chaosMode` flag in `BotConfig` that, when enabled, overrides normal strategy execution with random signal generation.

#### Scenario: Chaos mode enabled in config

- **WHEN** `BotConfig.chaosMode.enabled` is `true`
- **THEN** the system SHALL ignore the configured Pine Script strategy and generate random trading signals instead

#### Scenario: Chaos mode disabled by default

- **WHEN** `BotConfig` is loaded and `chaosMode` is not specified
- **THEN** `chaosMode.enabled` SHALL default to `false` and normal strategy execution SHALL proceed

### Requirement: Random signal generation

The system SHALL generate a random trading signal on the close of every real-time candle when chaos mode is active. The signal SHALL be one of `long`, `short`, or `exit`, selected with equal probability (1/3 each).

#### Scenario: Signal generated on candle close

- **WHEN** a real-time candle closes and chaos mode is active
- **THEN** the system SHALL generate exactly one random signal: `long`, `short`, or `exit`

#### Scenario: Signal has equal probability distribution

- **WHEN** chaos mode runs for 300 candle closes
- **THEN** each signal type (`long`, `short`, `exit`) SHALL appear approximately 100 times (within statistical variance)

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

### Requirement: Chaos mode signal logging

The system SHALL log every chaos-generated signal with its type, timestamp, generated equity at time of signal, and the resulting position state.

#### Scenario: Signal logged

- **WHEN** a chaos signal is generated
- **THEN** the system SHALL record: signal type (`long`/`short`/`exit`), timestamp, current equity, and resulting position summary

### Requirement: Chaos mode activation via hidden UI gesture

The system SHALL provide a hidden activation mechanism on the review/backtest screen. The user SHALL be able to toggle chaos mode by repeatedly tapping a designated hidden area.

#### Scenario: Activation gesture recognized

- **WHEN** the user taps the hidden area 5 times within 3 seconds on the review screen
- **THEN** the system SHALL toggle chaos mode state and show a confirmation toast

#### Scenario: Chaos mode persists across sessions

- **WHEN** chaos mode is toggled on
- **THEN** the setting SHALL persist in `BotConfig` until explicitly toggled off

### Requirement: Dashboard chaos mode warning

When chaos mode is active and the trading dashboard opens, the system SHALL display a prominent full-screen warning banner before any dashboard content is visible.

#### Scenario: Warning banner displayed

- **WHEN** chaos mode is active and the user opens the trading dashboard
- **THEN** the system SHALL display a full-width warning banner with text "⚠️ CHAOS MODE ACTIVE — RANDOM SIGNALS" and a confirmation button to proceed

#### Scenario: Dashboard blocked until acknowledged

- **WHEN** the warning banner is displayed
- **THEN** the dashboard content SHALL NOT be visible until the user acknowledges the warning

### Requirement: Chaos mode status indicator

The system SHALL display a persistent indicator when chaos mode is active, visible in both the review screen and the trading dashboard.

#### Scenario: Status indicator visible

- **WHEN** chaos mode is enabled
- **THEN** a visible indicator (e.g., badge, icon, or text) SHALL appear in the UI showing chaos mode is active

### Requirement: Chaos mode signal execution

When chaos mode is active, the system SHALL execute chaos-generated signals on the DEX, but ONLY on confirmed real-time candle closes. Signals SHALL NOT be generated or executed during backtesting, on forming/in-progress candles, or when the bot is not connected to a live data feed. The `submitOrders` callback SHALL only fire when the scheduler receives a confirmed candle from the real-time bar feed. Each `long` signal SHALL result in a buy order, each `exit` signal SHALL result in a sell order closing the current position, and each `short` signal SHALL close any existing long position (spot DEX constraint). When the real wallet balance is zero or unreachable, the chaos engine SHALL still drive the strategy machinery using a documented simulated equity floor, and SHALL log the failure mode loudly instead of silently generating zero-quantity entries.

#### Scenario: Chaos buy blocked by risk gate

- **WHEN** chaos mode generates a `long` signal but the daily loss limit has been breached
- **THEN** the system SHALL NOT place a buy order
- **AND** the signal SHALL be recorded as blocked by risk controls

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

### Requirement: Chaos mode execution result tracking

The system SHALL track and expose chaos mode execution results including successful orders, failed orders, and total execution time. In addition, every processed candle SHALL produce an observable outcome (signal, explicit no-op reason, or error) so a running chaos mode is never silently idle.

#### Scenario: Execution stats available

- **WHEN** chaos mode has been running for multiple candle closes
- **THEN** the system SHALL track: total signals generated, orders executed, orders failed, total execution time

#### Scenario: Snapshot includes recent chaos markers on connect

- **WHEN** a WebSocket client connects while chaos mode has been active
- **THEN** the `bot:snapshot` payload SHALL include the most recent chaos markers from the in-memory ring buffer

#### Scenario: State-change snapshot preserves chaos markers

- **WHEN** the bot transitions state (e.g., enters Running) and broadcasts a `bot:snapshot`
- **THEN** the snapshot payload SHALL include the full `chaosSignals` history in the same shape as the connect-time snapshot

#### Scenario: Every candle produces an observable outcome

- **WHEN** a real-time candle closes while chaos mode is active
- **THEN** the system SHALL record and expose one of: a generated signal, an explicit no-op reason (e.g. impossible transition), or an error

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

### Requirement: Chaos entries are sized at 10% of equity

Every position opened during chaos mode SHALL be sized at exactly 10% of current equity, regardless of any strategy sizing configuration.

#### Scenario: Long entry sized at 10%

- **WHEN** chaos mode opens a long position and current equity is $10,000
- **THEN** the position size SHALL be $1,000 (10% of equity)

#### Scenario: Equity recalculated per entry

- **WHEN** chaos mode opens consecutive positions
- **THEN** each position size SHALL be derived from the current equity at the time of the entry, not the initial capital

### Requirement: Chaos markers broadcast in real time

The system SHALL broadcast every chaos-generated marker over the `bot:chaosSignal` WebSocket channel, including the marker fields produced by the strategy engine (type, name, direction, action, quantity, price, timestamp, color) and its execution result (success or failure, with transaction signature or error on failure).

#### Scenario: Marker broadcast on candle close

- **WHEN** chaos mode produces a marker on a confirmed candle close
- **THEN** the system SHALL broadcast a `bot:chaosSignal` message containing the full marker fields and execution result

#### Scenario: Failed order broadcast with failure state

- **WHEN** a chaos order fails on the DEX (e.g., insufficient balance)
- **THEN** the broadcast SHALL include the failure state and the resulting marker SHALL remain visible on the chart flagged as failed

### Requirement: Chaos history replayed on connect

The system SHALL retain a bounded in-memory history of recent chaos markers and include it in the `bot:snapshot` message sent to a WebSocket client on connect, so a page reload preserves the recent chaos trace. The same complete payload SHALL be produced by a single shared snapshot builder used by every snapshot broadcast site.

#### Scenario: Snapshot includes recent chaos markers

- **WHEN** a WebSocket client connects while chaos mode has been active
- **THEN** the `bot:snapshot` payload SHALL include the most recent chaos markers from the in-memory ring buffer

#### Scenario: Every snapshot broadcast uses the shared builder

- **WHEN** any code path broadcasts a `bot:snapshot`
- **THEN** the payload SHALL be built by the single shared snapshot-payload builder so `chaosSignals` is never omitted

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

