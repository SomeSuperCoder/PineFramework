## ADDED Requirements

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
