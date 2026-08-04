## ADDED Requirements

### Requirement: Chaos mode startup integration

When chaos mode is enabled, the system SHALL start the bot without requiring a compiled Pine Script strategy. The chaos mode signal generator SHALL be used instead of the strategy executor for candle processing.

#### Scenario: Bot starts with chaos mode enabled and no strategy

- **WHEN** `engine.start()` is called with `config.chaosMode.enabled: true` and no strategy source is configured
- **THEN** the system SHALL proceed with normal state transitions (`Idle` → `Starting` → `Running`) and use the chaos signal generator for candle processing

#### Scenario: Bot starts with chaos mode enabled and strategy configured

- **WHEN** `engine.start()` is called with `config.chaosMode.enabled: true` and a strategy source is also configured
- **THEN** the system SHALL start normally but ignore the configured strategy, using chaos signal generation instead

#### Scenario: Chaos mode does not affect backtest

- **WHEN** the bot runs a backtest with `config.chaosMode.enabled: true`
- **THEN** the backtest SHALL execute the configured strategy normally (chaos mode applies only to live trading)
